import { describe, it, expect, vi, afterEach } from "vitest";
import {
  json,
  guardAdminRead,
  guardAdminWrite,
  adminSecurityHeaders,
  type ApiError,
} from "~/lib/cms/http";
import { fakeD1 } from "./helpers/fake-d1";

const SITE = "https://nicoleolmedo.com";
const TOKEN = "s3cret-write-token";
const DB = fakeD1() as unknown as D1Database;

function req(headers: Record<string, string> = {}, method = "GET"): Request {
  return new Request(`${SITE}/api/admin/content`, { method, headers });
}

/** The guards read only these keys; the rest of `Env` is irrelevant to them. */
function env(over: Partial<Env> = {}): Partial<Env> {
  return { DB, ...over };
}

async function body(res: Response): Promise<ApiError> {
  return (await res.json()) as ApiError;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("json", () => {
  it("serializes with a JSON content type and the given status", async () => {
    const res = json({ rows: [] }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await res.json()).toEqual({ rows: [] });
  });
  it("defaults to 200", () => {
    expect(json({}).status).toBe(200);
  });
});

describe("guardAdminRead", () => {
  it("hands the bound db back when the token matches", () => {
    const result = guardAdminRead(req({ "x-admin-token": TOKEN }), env({ ADMIN_API_TOKEN: TOKEN }), true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.db).toBe(DB);
  });

  it("503 db_unavailable when D1 is unbound", async () => {
    const result = guardAdminRead(req(), { ADMIN_API_TOKEN: TOKEN }, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.res.status).toBe(503);
      expect(await body(result.res)).toEqual({ error: "db_unavailable" });
    }
  });

  it("checks the binding BEFORE the token — an unbound db is not an auth answer", async () => {
    const result = guardAdminRead(req({ "x-admin-token": "wrong" }), { ADMIN_API_TOKEN: TOKEN }, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((await body(result.res)).error).toBe("db_unavailable");
  });

  it("401 unauthorized on a token mismatch", async () => {
    const result = guardAdminRead(req({ "x-admin-token": "wrong" }), env({ ADMIN_API_TOKEN: TOKEN }), true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.res.status).toBe(401);
      expect(await body(result.res)).toEqual({ error: "unauthorized" });
    }
  });

  it("401 unauthorized when the header is missing entirely", async () => {
    const result = guardAdminRead(req(), env({ ADMIN_API_TOKEN: TOKEN }), true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.res.status).toBe(401);
  });

  it("PROD build + token unset → 503 misconfigured [FAIL CLOSED], and it is logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = guardAdminRead(req(), env(), true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.res.status).toBe(503);
      expect(await body(result.res)).toEqual({ error: "misconfigured" });
    }
    expect(error).toHaveBeenCalled();
  });

  it("PROD build + EMPTY-STRING token is also unset (no disarm-by-blank)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = guardAdminRead(req(), env({ ADMIN_API_TOKEN: "   " }), true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((await body(result.res)).error).toBe("misconfigured");
  });

  it("DEV build + token unset passes — the middleware gate already ran", () => {
    expect(guardAdminRead(req(), env(), false).ok).toBe(true);
  });

  it("DEV build + token SET is still enforced", () => {
    expect(guardAdminRead(req(), env({ ADMIN_API_TOKEN: TOKEN }), false).ok).toBe(false);
    expect(
      guardAdminRead(req({ "x-admin-token": TOKEN }), env({ ADMIN_API_TOKEN: TOKEN }), false).ok,
    ).toBe(true);
  });
});

describe("guardAdminWrite", () => {
  const write = (headers: Record<string, string>, e = env({ ADMIN_API_TOKEN: TOKEN })) =>
    guardAdminWrite(req({ "x-admin-token": TOKEN, ...headers }, "POST"), e, true, SITE);

  it("passes a same-origin write", () => {
    expect(write({ "Sec-Fetch-Site": "same-origin" }).ok).toBe(true);
  });

  it("403 forbidden on a cross-site write (fetch-metadata branch)", async () => {
    const result = write({ "Sec-Fetch-Site": "cross-site" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.res.status).toBe(403);
      expect(await body(result.res)).toEqual({ error: "forbidden" });
    }
  });

  it("403 forbidden on a foreign Origin (fallback branch)", async () => {
    const result = write({ Origin: "https://evil.example" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.res.status).toBe(403);
  });

  it("passes a matching Origin when fetch metadata is absent", () => {
    expect(write({ Origin: SITE }).ok).toBe(true);
  });

  it("runs the read preamble FIRST — token failure outranks CSRF", async () => {
    const result = guardAdminWrite(
      req({ "x-admin-token": "wrong", "Sec-Fetch-Site": "cross-site" }, "POST"),
      env({ ADMIN_API_TOKEN: TOKEN }),
      true,
      SITE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.res.status).toBe(401);
  });

  it("still fails closed on an unbound db", async () => {
    const result = guardAdminWrite(
      req({ "Sec-Fetch-Site": "same-origin" }, "POST"),
      { ADMIN_API_TOKEN: TOKEN },
      true,
      SITE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect((await body(result.res)).error).toBe("db_unavailable");
  });
});

describe("adminSecurityHeaders", () => {
  it("stamps no-store on both variants", () => {
    for (const isApi of [true, false]) {
      const res = new Response("x");
      adminSecurityHeaders(res, isApi);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("the API variant carries noindex and nothing page-shaped", () => {
    const res = new Response("{}");
    adminSecurityHeaders(res, true);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
    expect(res.headers.get("X-Frame-Options")).toBeNull();
  });

  it("the page variant carries noindex,nofollow + DENY + Referrer-Policy + CSP", () => {
    const res = new Response("<html></html>");
    adminSecurityHeaders(res, false);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("same-origin");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("script-src 'self'");
  });

  it("names NO external origin while posters serve same-origin (Stage A)", () => {
    const res = new Response("<html></html>");
    adminSecurityHeaders(res, false);
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/https?:\/\//);
  });
});
