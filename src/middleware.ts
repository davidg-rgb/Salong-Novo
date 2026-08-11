import { defineMiddleware } from "astro:middleware";
import type { APIContext } from "astro";
import { resolveRedirect } from "./lib/redirects";
import { verifyAccessJwt, type Jwk } from "./lib/access";
import { bindings } from "./lib/cms/bindings";

/** Matches the two Access-gated prefixes: `/admin*` and `/api/admin*`. */
const ADMIN_RE = /^\/(admin|api\/admin)(\/|$)/;

/** The security headers applied to every admin response (§10.8, defense-in-depth). */
const ADMIN_PAGE_CSP =
  "default-src 'self'; img-src 'self' https://img.salongnovo.se data:; " +
  "style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; " +
  "frame-ancestors 'none'";

/**
 * In-module JWKS cache + fetcher. The Access signing keys rotate rarely; caching
 * per worker isolate avoids a JWKS round-trip on every admin request. Keyed by
 * URL so a team-domain change can't serve stale keys.
 */
function makeJwksFetcher(): (url: string) => Promise<Jwk[]> {
  const cache = new Map<string, { keys: Jwk[]; at: number }>();
  const TTL_MS = 60 * 60 * 1000; // 1h
  return async (url: string): Promise<Jwk[]> => {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.keys;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const data = (await res.json()) as { keys?: Jwk[] };
    const keys = Array.isArray(data.keys) ? data.keys : [];
    cache.set(url, { keys, at: Date.now() });
    return keys;
  };
}
const fetchJwks = makeJwksFetcher();

const NOINDEX_403_HTML = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Åtkomst nekad</title></head><body><h1>Åtkomst nekad</h1><p>Du har inte behörighet att se den här sidan.</p></body></html>`;

/**
 * Reject a request whose Access JWT failed verification. JSON for the API,
 * a `noindex` HTML page for the admin UI. Fires only on a verifiably bad JWT
 * (Access itself normally prevents this from reaching the origin).
 */
function adminUnauthorized(context: APIContext, reason: string): Response {
  const isApi = context.url.pathname.startsWith("/api/admin");
  if (isApi) {
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

/** Apply the §10.8 admin security headers to a response (page vs API variant). */
function applyAdminHeaders(res: Response, isApi: boolean): void {
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

/** Edge middleware: legacy redirects first, then the admin identity gate. */
export const onRequest = defineMiddleware(async (context, next) => {
  // 1) existing legacy-redirect pass (unchanged, runs first for all routes).
  const target = resolveRedirect(context.url.pathname);
  if (target && target !== context.url.pathname) {
    return context.redirect(target, 301);
  }

  // 2) admin identity — only for the two Access-gated prefixes.
  if (ADMIN_RE.test(context.url.pathname)) {
    const env = await bindings();
    const h = context.request.headers;
    const jwt = h.get("Cf-Access-Jwt-Assertion");
    const headerEmail = h.get("Cf-Access-Authenticated-User-Email");
    let user: App.AdminUser | null = null;

    if (jwt && env?.ACCESS_AUD && env?.ACCESS_TEAM_DOMAIN) {
      const res = await verifyAccessJwt(
        jwt,
        { aud: env.ACCESS_AUD, teamDomain: env.ACCESS_TEAM_DOMAIN },
        { fetchJwks },
      );
      if (res.ok) {
        user = { email: res.identity.email || headerEmail || "", source: "access" };
      } else {
        return adminUnauthorized(context, res.reason);
      }
    } else if (headerEmail) {
      // Access is in front but origin-side verification isn't configured.
      user = { email: headerEmail, source: "access-header" };
    } else if (env?.DEV_ADMIN_EMAIL) {
      // LOCAL DEV ONLY — Access cannot gate localhost.
      user = { email: env.DEV_ADMIN_EMAIL, source: "dev" };
    }
    context.locals.user = user; // null when unauthenticated

    const response = await next();
    applyAdminHeaders(response, context.url.pathname.startsWith("/api/admin"));
    return response;
  }

  return next();
});
