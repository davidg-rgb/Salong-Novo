/**
 * Admin API envelope + route preamble guards (ARCHITECTURE §6.5, ADR-09).
 *
 * Every `/api/admin/*` response is JSON. Success is `200`/`201` with the domain
 * payload; failure is `{ error: <code>, field?, detail? }` with a machine code
 * from the §11.1 taxonomy, which the client maps to a Swedish message via
 * `strings.sv.ts` — raw codes are never shown to the client.
 *
 * The preamble is exactly ONE function per method class (`guardAdminRead` for
 * GETs, `guardAdminWrite` for writes) rather than a kit of helpers, so a route
 * file cannot get the order wrong: bindings → db present → token → CSRF.
 * Bindings and validate/act stay in the route; the guards own the middle.
 */
import type { Database } from "./db";
import { isSameOriginWrite, isSet } from "./access";

/** The failure envelope. Every non-2xx admin response has this shape. */
export type ApiError = { error: string; field?: string; detail?: string };

/** Either the guard passed and handed you a bound db, or it built your response. */
export type GuardResult =
  | { ok: true; db: Database }
  | { ok: false; res: Response };

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Shared read preamble.
 *
 * The token rule is fail-closed and symmetric with ADR-03 — the
 * disarmed-by-absence antipattern is NOT reproduced here. In a PROD build an
 * unset `ADMIN_API_TOKEN` means the deploy forgot `wrangler secret put`, so
 * every admin call answers 503 `misconfigured` rather than waving traffic
 * through. In a dev build an unset token passes: the middleware identity gate
 * has already run, and the local loop should not need a secret.
 *
 * `isProdBuild` is `import.meta.env.PROD`, passed by the route so this module
 * stays env-free (and so both sides of the branch are unit-testable).
 */
export function guardAdminRead(
  request: Request,
  env: Partial<Env>,
  isProdBuild: boolean,
): GuardResult {
  const db = env.DB;
  if (!db) return { ok: false, res: json({ error: "db_unavailable" } satisfies ApiError, 503) };

  const expected = env.ADMIN_API_TOKEN;
  if (!isSet(expected)) {
    if (isProdBuild) {
      console.error("[admin] ADMIN_API_TOKEN unset in a production build — failing closed");
      return { ok: false, res: json({ error: "misconfigured" } satisfies ApiError, 503) };
    }
    return { ok: true, db };
  }

  if (request.headers.get("x-admin-token") !== expected) {
    return { ok: false, res: json({ error: "unauthorized" } satisfies ApiError, 401) };
  }

  return { ok: true, db };
}

/**
 * Write preamble: `guardAdminRead` plus the same-origin CSRF check (layer 3).
 *
 * Astro 7's built-in `security.checkOrigin` already rejects cross-origin
 * form-content-type POSTs — including multipart uploads — before any route runs,
 * as a `text/plain` 403. This layer is therefore partially redundant for form
 * posts and load-bearing for JSON-body writes (§11.1).
 */
export function guardAdminWrite(
  request: Request,
  env: Partial<Env>,
  isProdBuild: boolean,
  siteUrl: string,
): GuardResult {
  const read = guardAdminRead(request, env, isProdBuild);
  if (!read.ok) return read;

  if (!isSameOriginWrite(request, siteUrl)) {
    return { ok: false, res: json({ error: "forbidden" } satisfies ApiError, 403) };
  }

  return read;
}

/**
 * The admin CSP. No external origin appears here while posters serve same-origin
 * through `/api/media/*` (Stage A). At the Stage-B cutover the
 * `PUBLIC_IMAGE_BASE` origin is appended to `img-src` — and nothing else.
 */
const ADMIN_PAGE_CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self'; form-action 'self'; frame-ancestors 'none'";

/**
 * Stamp the defense-in-depth headers on an admin response. `no-store` always —
 * an admin page in a shared cache is the whole problem. Pages additionally get
 * the framing, referrer and CSP set; the API variant only needs `noindex`.
 */
export function adminSecurityHeaders(res: Response, isApi: boolean): void {
  res.headers.set("Cache-Control", "no-store");
  if (isApi) {
    res.headers.set("X-Robots-Tag", "noindex");
    return;
  }
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Content-Security-Policy", ADMIN_PAGE_CSP);
  res.headers.set("Referrer-Policy", "same-origin");
}
