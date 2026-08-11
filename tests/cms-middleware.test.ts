import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { APIContext, MiddlewareNext } from "astro";
import { FakeD1 } from "./helpers/fake-d1";
import type { Jwk } from "~/lib/cms/access";

/**
 * The middleware is the one place where bindings, identity and headers meet, so
 * it is driven here as a unit with `bindings()` faked — that is the only I/O it
 * does that a test cannot otherwise reach.
 *
 * NOTE on build mode: vitest runs with `import.meta.env.DEV === true`, so every
 * request through `onRequest` here takes the DEV-build branch. That is why the
 * decision table itself is tested against `resolveAdminIdentity` directly
 * (tests/cms-access.test.ts), where `isDevBuild` is a parameter and the
 * prod-side fail-closed rows are reachable. What this file proves is the WIRING:
 * that the gate is consulted, that a rejection never reaches the route, and that
 * the response is shaped and headered correctly.
 */
const binding = vi.hoisted(() => ({ env: {} as Partial<Env> }));
vi.mock("~/lib/cms/bindings", () => ({ bindings: async () => binding.env }));

const { onRequest, makeJwksFetcher } = await import("~/middleware");

const SITE = "https://salongnovo.se";
const EMAIL = "info@salongnovo.se";

function ctx(pathname: string, headers: Record<string, string> = {}) {
  const url = new URL(SITE + pathname);
  const context = {
    url,
    request: new Request(url, { headers }),
    locals: {} as App.Locals,
    // This project's middleware runs the legacy-redirect pass first, so the
    // fake context has to supply the one Astro helper that pass uses.
    redirect: (location: string, status = 302) =>
      new Response(null, { status, headers: { Location: location } }),
  };
  return context as unknown as APIContext & { locals: App.Locals };
}

function nextFn(response = new Response("route body")) {
  return vi.fn(async () => response) as unknown as MiddlewareNext & { mock: { calls: unknown[] } };
}

async function run(context: ReturnType<typeof ctx>, next = nextFn()) {
  const res = (await onRequest(context, next as unknown as MiddlewareNext)) as Response;
  return { res, next };
}

beforeEach(() => {
  binding.env = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("onRequest — the legacy-redirect pass runs first", () => {
  /**
   * This project's middleware is the core's with `resolveRedirect` merged in
   * ahead of it. Order is the whole point: a legacy URL must resolve to its new
   * home before anything else looks at it, and it must not pay for bindings or
   * the identity gate to get there.
   */
  it("301s a legacy public URL without invoking the route", async () => {
    const next = nextFn();
    const { res } = await run(ctx("/portfolio"), next);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/tavlingar");
    expect(next).not.toHaveBeenCalled();
  });

  it("leaves a path with no legacy mapping alone", async () => {
    const { res, next } = await run(ctx("/blogg"));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });
});

describe("onRequest — distribution (every request)", () => {
  it("passes non-admin paths straight through, unheadered", async () => {
    const context = ctx("/blogg");
    const { res, next } = await run(context);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    // The admin headers are for the admin. A public page must stay cacheable.
    expect(res.headers.get("Cache-Control")).toBeNull();
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("publishes db + getCms on locals for every request, admin or not", async () => {
    const db = new FakeD1(() => []);
    binding.env = { DB: db as unknown as D1Database };
    const context = ctx("/");
    await run(context);
    expect(context.locals.db).toBe(db);
    expect(typeof context.locals.getCms).toBe("function");
  });

  it("locals.db is null where there is no binding (Vercel, bare dev)", async () => {
    const context = ctx("/");
    await run(context);
    expect(context.locals.db).toBeNull();
    await expect(context.locals.getCms()).resolves.toEqual({ kv: null, source: "fallback" });
  });

  it("getCms is LAZY — a request that never renders content costs zero queries", async () => {
    const db = new FakeD1(() => []);
    binding.env = { DB: db as unknown as D1Database };
    const context = ctx("/api/enquiry");
    await run(context);
    expect(db.queries).toHaveLength(0);
  });

  it("getCms is MEMOIZED — twenty components, one query", async () => {
    const db = new FakeD1(() => [
      { key: "site.contact.email", value_sv: "a@b.se", value_en: "", updated_at: "", updated_by: "" },
    ]);
    binding.env = { DB: db as unknown as D1Database };
    const context = ctx("/om-mig");
    await run(context);

    const [first, second] = await Promise.all([context.locals.getCms(), context.locals.getCms()]);
    const third = await context.locals.getCms();
    expect(db.queries).toHaveLength(1);
    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(first.source).toBe("d1");
    expect(first.kv?.get("site.contact.email")?.value_sv).toBe("a@b.se");
  });
});

describe("onRequest — the admin gate", () => {
  it("403s an admin PAGE as noindex HTML and never reaches the route", async () => {
    const { res, next } = await run(ctx("/admin"));
    expect(res.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("noindex,nofollow");
  });

  it("403s an admin API as JSON carrying the machine reason", async () => {
    const { res, next } = await run(ctx("/api/admin/content"));
    expect(res.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "forbidden", reason: "not_configured" });
  });

  it("admits the dev identity and stamps it onto locals", async () => {
    binding.env = { DEV_ADMIN_EMAIL: EMAIL, ADMIN_API_TOKEN: "dev-local-token" };
    const context = ctx("/admin/posts");
    const { res, next } = await run(context);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(context.locals.adminEmail).toBe(EMAIL);
    expect(context.locals.adminToken).toBe("dev-local-token");
  });

  it("adminToken falls back to an empty string rather than undefined", async () => {
    binding.env = { DEV_ADMIN_EMAIL: EMAIL };
    const context = ctx("/admin");
    await run(context);
    expect(context.locals.adminToken).toBe("");
  });

  it("stamps the page header set on an admitted admin PAGE", async () => {
    binding.env = { DEV_ADMIN_EMAIL: EMAIL };
    const { res } = await run(ctx("/admin"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("stamps the API header set on an admitted admin API call", async () => {
    binding.env = { DEV_ADMIN_EMAIL: EMAIL };
    const { res } = await run(ctx("/api/admin/content"));
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("turns the coexistence tripwire into a 403, not a 500, and logs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    binding.env = { DEV_ADMIN_EMAIL: EMAIL, ACCESS_AUD: "aud-tag", ACCESS_TEAM_DOMAIN: "t.example" };
    const { res, next } = await run(ctx("/api/admin/content"));
    expect(res.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ error: "forbidden", reason: "misconfigured" });
    expect(error).toHaveBeenCalled();
  });

  it("gates exactly the two prefixes and nothing that merely starts like them", async () => {
    binding.env = {}; // nothing admits
    const gated = ["/admin", "/admin/", "/admin/media", "/api/admin", "/api/admin/content"];
    const open = ["/", "/administration", "/admin-login", "/api/enquiry", "/en/blog", "/blogg/admin"];

    for (const path of gated) {
      const { res } = await run(ctx(path));
      expect(res.status, `${path} must be gated`).toBe(403);
    }
    for (const path of open) {
      const { res, next } = await run(ctx(path));
      expect(res.status, `${path} must be open`).toBe(200);
      expect(next, `${path} must reach the route`).toHaveBeenCalled();
    }
  });

  it("reads the JWT from the Cf-Access-Jwt-Assertion header when Access is configured", async () => {
    binding.env = { ACCESS_AUD: "aud-tag", ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com" };
    // No header → no_token, which proves the gate demands a token rather than
    // falling back to the (attacker-suppliable) email header.
    const { res } = await run(
      ctx("/api/admin/content", { "Cf-Access-Authenticated-User-Email": "attacker@evil.example" }),
    );
    expect(await res.json()).toEqual({ error: "forbidden", reason: "no_token" });
  });
});

describe("makeJwksFetcher", () => {
  const URL_A = "https://a.cloudflareaccess.com/cdn-cgi/access/certs";
  const URL_B = "https://b.cloudflareaccess.com/cdn-cgi/access/certs";
  const keys: Jwk[] = [{ kid: "k", kty: "RSA", n: "n", e: "AQAB", alg: "RS256" }];

  function harness(now = { t: 0 }) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys })));
    const fetcher = makeJwksFetcher({
      fetch: fetchMock as unknown as typeof fetch,
      now: () => now.t,
    });
    return { fetcher, fetchMock, now };
  }

  it("fetches once and serves the cache thereafter", async () => {
    const { fetcher, fetchMock } = harness();
    expect(await fetcher(URL_A)).toEqual(keys);
    expect(await fetcher(URL_A)).toEqual(keys);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keys the cache by URL, so a team-domain change cannot serve stale keys", async () => {
    const { fetcher, fetchMock } = harness();
    await fetcher(URL_A);
    await fetcher(URL_B);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("expires the entry after 1h", async () => {
    const now = { t: 0 };
    const { fetcher, fetchMock } = harness(now);
    await fetcher(URL_A);
    now.t = 60 * 60 * 1000 - 1;
    await fetcher(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now.t = 60 * 60 * 1000;
    await fetcher(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on a non-OK response rather than caching an empty key set", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
    const fetcher = makeJwksFetcher({ fetch: fetchMock as unknown as typeof fetch, now: () => 0 });
    await expect(fetcher(URL_A)).rejects.toThrow(/503/);
  });

  it("tolerates a JWKS document without a keys array", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({})));
    const fetcher = makeJwksFetcher({ fetch: fetchMock as unknown as typeof fetch, now: () => 0 });
    await expect(fetcher(URL_A)).resolves.toEqual([]);
  });
});
