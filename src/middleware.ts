/**
 * Global middleware — legacy redirects, content distributor, admin identity gate
 * (ARCHITECTURE §6.4). Runs for EVERY request.
 *
 * THREE JOBS, in this order:
 *
 * 0. LEGACY REDIRECTS. `resolveRedirect` maps the launched Next.js site's URLs
 *    onto this one's and answers a 301 before anything else runs. It stays first
 *    because a redirected request has no business paying for bindings, and
 *    because the old site's `/admin`-adjacent URLs must resolve to their new
 *    home rather than hit the gate below.
 *
 * 1. DISTRIBUTION. Bindings are read once per request and stashed in
 *    `Astro.locals`, so pages and components never touch `bindings()`
 *    themselves. Content loading is a LAZY MEMOIZED thunk: no branch can forget
 *    to load it, and requests that never render CMS content — 404s, media
 *    streaming, the blog's own D1 reads — cost zero content_kv queries.
 *
 * 2. THE ADMIN GATE. `/admin*` and `/api/admin*` are the identity boundary's
 *    origin-side enforcement point. Rejection is a 403 BEFORE the route runs;
 *    admission stamps `locals.adminEmail` and the defense-in-depth headers.
 *
 * WHAT THIS FILE DROPPED when the Forge core landed: the third identity tier
 * that trusted a bare `Cf-Access-Authenticated-User-Email` header when
 * origin-side verification was unconfigured. That header is attacker-suppliable
 * on any path that does not traverse Access (a direct `*.workers.dev` hit), so
 * "verification isn't configured" is now a hard reject rather than a trust
 * downgrade. The dev identity survives, but only per `resolveAdminIdentity`'s
 * model: inside a dev build, with both `ACCESS_*` vars unset.
 *
 * `onRequest` is a plain `MiddlewareHandler` rather than a `defineMiddleware()`
 * call. `defineMiddleware` is only a typing convenience, and importing
 * `astro:middleware` here would make the whole module unimportable from vitest —
 * which would leave the §9.7 gate untested, the one thing it must not be.
 */
import type { APIContext, MiddlewareHandler, MiddlewareNext } from "astro";
import { resolveRedirect } from "./lib/redirects";
import { bindings } from "./lib/cms/bindings";
import { resolveAdminIdentity, type Jwk } from "./lib/cms/access";
import { adminSecurityHeaders } from "./lib/cms/http";
import { loadCmsContent, type CmsContent } from "./lib/cms/content";

/** The two gated prefixes: `/admin*` and `/api/admin*`. */
const ADMIN_RE = /^\/(admin|api\/admin)(\/|$)/;

/**
 * In-isolate JWKS cache + fetcher. Access signing keys rotate rarely, so caching
 * per isolate avoids a round-trip on every admin request. Keyed by URL, so a
 * team-domain change cannot serve stale keys.
 *
 * Exported as a FACTORY (the module keeps a single instance) so the cache
 * behaviour is unit-testable against a fake fetch.
 */
export function makeJwksFetcher(
  deps: { fetch: typeof fetch; now: () => number } = { fetch, now: Date.now },
): (url: string) => Promise<Jwk[]> {
  const cache = new Map<string, { keys: Jwk[]; at: number }>();
  const TTL_MS = 60 * 60 * 1000; // 1h
  return async (url: string): Promise<Jwk[]> => {
    const hit = cache.get(url);
    if (hit && deps.now() - hit.at < TTL_MS) return hit.keys;
    const res = await deps.fetch(url);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const data = (await res.json()) as { keys?: Jwk[] };
    const keys = Array.isArray(data.keys) ? data.keys : [];
    cache.set(url, { keys, at: deps.now() });
    return keys;
  };
}

const fetchJwks = makeJwksFetcher();

const NOINDEX_403_HTML = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Åtkomst nekad</title></head><body><h1>Åtkomst nekad</h1><p>Du har inte behörighet att se den här sidan.</p></body></html>`;

/**
 * Reject an unauthenticated admin request: JSON for the API, a `noindex` HTML
 * page for the UI. `no-store` on both — a cached 403 is as wrong as a cached
 * dashboard.
 */
function adminUnauthorized(context: APIContext, reason: string): Response {
  if (context.url.pathname.startsWith("/api/admin")) {
    return new Response(JSON.stringify({ error: "forbidden", reason }), {
      status: 403,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(NOINDEX_403_HTML, {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}

/** Load once per request, at most once, and only if someone actually asks. */
function memoizeCms(db: Parameters<typeof loadCmsContent>[0]): () => Promise<CmsContent> {
  let pending: Promise<CmsContent> | null = null;
  return () => (pending ??= loadCmsContent(db));
}

export const onRequest: MiddlewareHandler = async (
  context: APIContext,
  next: MiddlewareNext,
) => {
  const target = resolveRedirect(context.url.pathname);
  if (target && target !== context.url.pathname) {
    return context.redirect(target, 301);
  }

  const env = await bindings();
  context.locals.db = env.DB ?? null;
  context.locals.getCms = memoizeCms(context.locals.db);

  if (!ADMIN_RE.test(context.url.pathname)) return next();

  let identity;
  try {
    identity = await resolveAdminIdentity({
      jwt: context.request.headers.get("Cf-Access-Jwt-Assertion"),
      env,
      // Evaluated HERE, not in the core: the decision table stays env-free and
      // every one of its rows stays a unit test.
      isDevBuild: import.meta.env.DEV,
      deps: { fetchJwks },
    });
  } catch (error) {
    // The coexistence tripwire fired. This is a deploy-configuration bug, but it
    // must never surface as a 500 with a stack — log it and fail closed.
    console.error("[admin] identity misconfiguration", error);
    return adminUnauthorized(context, "misconfigured");
  }

  if (identity.kind === "rejected") return adminUnauthorized(context, identity.reason);

  context.locals.adminEmail = identity.email;
  // The layout reads the write token off locals for its meta tag; no component
  // ever calls bindings() itself.
  context.locals.adminToken = env.ADMIN_API_TOKEN ?? "";

  const response = await next();
  adminSecurityHeaders(response, context.url.pathname.startsWith("/api/admin"));
  return response;
};
