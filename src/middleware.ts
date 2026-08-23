/**
 * Global middleware — legacy redirects, content distributor, admin identity gate,
 * staging noindex stamp (ARCHITECTURE §6.4). Runs for EVERY request.
 *
 * FOUR JOBS, in this order:
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
 * 3. THE STAGING NOINDEX STAMP. On a build made with `PUBLIC_SITE_NOINDEX` set,
 *    every response the origin answers carries `X-Robots-Tag: noindex, nofollow`
 *    — the layer that covers what markup cannot: redirects, `sitemap.xml`,
 *    streamed media, 404s. Only the two non-admin exits stamp it, because the
 *    admin's own 403s and `adminSecurityHeaders` already set the header on every
 *    path they own and must keep their exact values.
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
import { siteNoindex } from "./lib/seo";

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
  deps: { fetch: typeof fetch; now: () => number } = {
    // WRAPPED, never passed by reference. In workerd the global `fetch` is a method
    // of the global scope and throws `TypeError: Illegal invocation` when invoked
    // with any other receiver — which `deps.fetch(url)` does. Node's fetch does not
    // care, so every unit test passed while production answered `jwks_unavailable`
    // to every Access-authenticated admin request (NOVO staging, 2026-08-23).
    fetch: (input, init) => fetch(input, init),
    now: Date.now,
  },
): (url: string) => Promise<Jwk[]> {
  const cache = new Map<string, { keys: Jwk[]; at: number }>();
  const TTL_MS = 60 * 60 * 1000; // 1h
  return async (url: string): Promise<Jwk[]> => {
    const hit = cache.get(url);
    if (hit && deps.now() - hit.at < TTL_MS) return hit.keys;
    let res: Response;
    try {
      res = await deps.fetch(url);
    } catch (error) {
      // Surfaced in `wrangler tail`: without this the only symptom is the opaque
      // `jwks_unavailable` the caller maps every fetch failure to.
      console.error("[admin] JWKS fetch threw", url, String(error));
      throw error;
    }
    if (!res.ok) {
      console.error("[admin] JWKS fetch failed", url, res.status);
      throw new Error(`JWKS fetch failed: ${res.status}`);
    }
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

/**
 * Stamp a staging build's responses as unindexable. A no-op on production, where
 * `PUBLIC_SITE_NOINDEX` is unset and the branch is inlined away at build time.
 *
 * Read per request rather than once at module scope so the switch stays a
 * testable function call rather than an import-order side effect.
 */
function stampNoindex(response: Response): Response {
  if (siteNoindex()) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
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
    return stampNoindex(context.redirect(target, 301));
  }

  const env = await bindings();
  context.locals.db = env.DB ?? null;
  context.locals.getCms = memoizeCms(context.locals.db);

  if (!ADMIN_RE.test(context.url.pathname)) return stampNoindex(await next());

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

  if (identity.kind === "rejected") {
    console.warn("[admin] rejected", identity.reason, context.url.pathname);
    return adminUnauthorized(context, identity.reason);
  }

  context.locals.adminEmail = identity.email;
  // The layout reads the write token off locals for its meta tag; no component
  // ever calls bindings() itself.
  context.locals.adminToken = env.ADMIN_API_TOKEN ?? "";

  const response = await next();
  adminSecurityHeaders(response, context.url.pathname.startsWith("/api/admin"));
  return response;
};
