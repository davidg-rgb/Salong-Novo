import { describe, it, expect, vi, afterEach } from "vitest";
import { hairSalonJsonLd, ogMeta, isNoindex, siteNoindex } from "../src/lib/seo";

describe("hairSalonJsonLd", () => {
  const ld = hairSalonJsonLd("https://salongnovo.se") as Record<string, any>;
  it("is a schema.org HairSalon", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("HairSalon");
  });
  it("uses the canonical apex URL", () => {
    expect(ld.url).toBe("https://salongnovo.se");
  });
  it("carries NAP data", () => {
    expect(ld.name).toBe("Salong NOVO");
    expect(ld.telephone).toBe("+46 8 663 30 14");
    expect(ld.address.streetAddress).toBe("Rörstrandsgatan 39C");
    expect(ld.address.addressLocality).toBe("Stockholm");
  });
  it("omits geo until coordinates are verified", () => {
    expect(ld.geo).toBeUndefined();
  });
  it("links Instagram via sameAs", () => {
    expect(ld.sameAs).toContain("https://www.instagram.com/salongnovo");
  });
});

describe("ogMeta", () => {
  it("emits OG + Twitter tags with locale mapping", () => {
    const og = ogMeta({
      title: "NOVO",
      description: "desc",
      canonical: "https://x/",
      locale: "sv",
    });
    expect(og["og:locale"]).toBe("sv_SE");
    // No image → plain text card, not a blank large-image card (review 2026-06-01).
    expect(og["twitter:card"]).toBe("summary");
    expect(og["og:image"]).toBeUndefined();
    expect(og["twitter:image"]).toBeUndefined();
  });
  it("includes image tags + a large-image card when an image is provided", () => {
    const og = ogMeta({
      title: "t",
      description: "d",
      canonical: "c",
      locale: "en",
      image: "https://img/x.webp",
    });
    expect(og["og:locale"]).toBe("en_GB");
    expect(og["twitter:card"]).toBe("summary_large_image");
    expect(og["og:image"]).toBe("https://img/x.webp");
    expect(og["twitter:image"]).toBe("https://img/x.webp");
  });
});

describe("isNoindex", () => {
  /**
   * The truth table is the whole feature: this one boolean decides whether a
   * deployment is visible to Google. It fails towards PRODUCTION in every
   * ambiguous case — a typo must never de-index the real site, and a staging
   * copy is only hidden when someone said so in as many words.
   */
  it("is true for the four accepted spellings", () => {
    for (const value of ["1", "true", "yes", "noindex"]) {
      expect(isNoindex(value), value).toBe(true);
    }
  });

  it("ignores case and surrounding whitespace", () => {
    for (const value of ["TRUE", " 1 ", "Yes", "  NoIndex\n"]) {
      expect(isNoindex(value), JSON.stringify(value)).toBe(true);
    }
  });

  it("is false for unset, empty and whitespace — production is the default", () => {
    for (const value of [undefined, null, "", "   "]) {
      expect(isNoindex(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("is false for anything else, including near-misses and negations", () => {
    for (const value of ["0", "false", "no", "off", "index", "ture", "1 1", "yes please"]) {
      expect(isNoindex(value), value).toBe(false);
    }
  });
});

describe("siteNoindex", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads PUBLIC_SITE_NOINDEX, and is false when it is unset", () => {
    expect(siteNoindex()).toBe(false);
  });

  it("is true once the staging var is set", () => {
    vi.stubEnv("PUBLIC_SITE_NOINDEX", "1");
    expect(siteNoindex()).toBe(true);
  });

  it("an explicitly empty var is production", () => {
    vi.stubEnv("PUBLIC_SITE_NOINDEX", "");
    expect(siteNoindex()).toBe(false);
  });
});
