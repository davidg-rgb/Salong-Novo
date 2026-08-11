import { describe, it, expect } from "vitest";
import { hairSalonJsonLd, ogMeta } from "../src/lib/seo";

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
