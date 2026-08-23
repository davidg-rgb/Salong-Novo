import { describe, it, expect, vi, afterEach } from "vitest";
import type { APIContext } from "astro";
import { GET } from "~/pages/robots.txt";

/**
 * `robots.txt` is the one public artefact where a staging deployment either
 * stays out of the index or does not. Both branches are pinned to their EXACT
 * bytes: the production string is asserted verbatim so that adding the staging
 * switch can never quietly reword what salongnovo.se serves.
 */
const PRODUCTION_BODY =
  "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: https://salongnovo.se/sitemap.xml\n";
const STAGING_BODY = "User-agent: *\nDisallow: /\n";

function get(site = "https://salongnovo.se/") {
  const context = { site: new URL(site) } as unknown as APIContext;
  return (GET as (c: APIContext) => Response)(context);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt — production (PUBLIC_SITE_NOINDEX unset)", () => {
  it("serves the exact launched body, sitemap included", async () => {
    const res = get();
    expect(await res.text()).toBe(PRODUCTION_BODY);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  });

  it("an empty var is production, not staging — nobody has to opt out", async () => {
    vi.stubEnv("PUBLIC_SITE_NOINDEX", "");
    expect(await get().text()).toBe(PRODUCTION_BODY);
  });

  it("trims the trailing slash off the site URL in the Sitemap line", async () => {
    const body = await get("https://novo.bottomsup.fun/").text();
    expect(body).toContain("Sitemap: https://novo.bottomsup.fun/sitemap.xml");
  });
});

describe("robots.txt — staging (PUBLIC_SITE_NOINDEX set)", () => {
  it("disallows everything", async () => {
    vi.stubEnv("PUBLIC_SITE_NOINDEX", "1");
    expect(await get().text()).toBe(STAGING_BODY);
  });

  it("publishes NO sitemap — a URL list is exactly how the copy gets found", async () => {
    vi.stubEnv("PUBLIC_SITE_NOINDEX", "true");
    const body = await get().text();
    expect(body).not.toContain("Sitemap");
    expect(body).not.toContain("Allow: /\n");
  });
});
