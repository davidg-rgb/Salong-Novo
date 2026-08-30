import { describe, it, expect } from "vitest";
import {
  getStaff,
  getStylist,
  getServices,
  showServicePrices,
  getAwards,
  getBrands,
  getCourses,
  getSite,
  bookingUrl,
  serviceName,
  brandDesc,
  courseTitle,
  asBrand,
  asCourse,
  stylistPhotoUrl,
} from "../src/lib/content";

describe("staff", () => {
  const staff = getStaff();
  it("has the full 17-person roster", () => {
    expect(staff).toHaveLength(17);
  });
  it("every stylist has name + slug", () => {
    for (const s of staff) {
      expect(s.name).toBeTruthy();
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
  it("slugs are unique", () => {
    const slugs = staff.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("includes the owners and the 2026 newcomer winner", () => {
    expect(getStylist("chriss-berner")?.role).toBe("Delägare");
    expect(getStylist("ellen-rudd")?.awards).toContain("Vinnare Årets Nykomling 2026");
  });
  it("ships a slug-matched portrait for every stylist", () => {
    // The file itself is checked by the bundled-imagery gate in build-gates.
    for (const s of staff) {
      expect(s.photo, s.slug).toBe(`/images/staff/${s.slug}.jpg`);
    }
  });
});

describe("stylist portraits", () => {
  it("uses a bundled asset path exactly as written", () => {
    expect(stylistPhotoUrl("/images/staff/chriss-berner.jpg")).toBe(
      "/images/staff/chriss-berner.jpg",
    );
  });
  it("serves an uploaded media key through the media route", () => {
    // Stage A: no PUBLIC_IMAGE_BASE, so the key goes through the Worker.
    expect(stylistPhotoUrl("blog/abc123.jpg")).toBe("/api/media/blog/abc123.jpg");
  });
  it("serves an uploaded media key off the image base once one is configured", () => {
    expect(stylistPhotoUrl("blog/abc123.jpg", "https://img.salongnovo.se/")).toBe(
      "https://img.salongnovo.se/blog/abc123.jpg",
    );
  });
  it("is null when there is no portrait, so the card falls back to its monogram", () => {
    expect(stylistPhotoUrl(undefined)).toBeNull();
    expect(stylistPhotoUrl(null)).toBeNull();
    expect(stylistPhotoUrl("")).toBeNull();
    expect(stylistPhotoUrl("   ")).toBeNull();
  });
});

describe("services", () => {
  // The client reversed "no prices" on 2026-06-01 (ARCHITECTURE §2A): the Bokning & priser page
  // WILL show prices. The flag stays false until the client mails the price list; the page renders
  // its coming-soon state meanwhile. This asserts the flag is data-driven, not a permanent decision.
  it("does not show prices until the price list is supplied", () => {
    expect(showServicePrices()).toBe(false);
  });
  it("has bilingual names", () => {
    const svc = getServices()[0]!;
    expect(serviceName(svc, "sv")).toBeTruthy();
    expect(serviceName(svc, "en")).toBeTruthy();
  });
});

describe("brands", () => {
  const brands = getBrands();
  it("carries the five lines the client named, under each brand's OWN mark", () => {
    // The client's list read "Ghd", "DC Hair extensions", "RichyHair extensions".
    // Verified against the brands' own wordmarks (2026-08-27): ghd is lowercase
    // always, Richy Hair is two words, and DC's mark is "DC Hair" (the company is
    // DC Hair Solutions). The product category lives in `desc_*`, not the name.
    expect(brands.map((b) => b.name)).toEqual([
      "Keune",
      "ghd",
      "DC Hair",
      "Richy Hair",
      "Signaturdoftljus",
    ]);
  });
  it("every brand has a unique slug and a description in both locales", () => {
    const slugs = brands.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const brand of brands) {
      expect(brandDesc(brand, "sv")).not.toBe("");
      expect(brandDesc(brand, "en")).not.toBe("");
    }
  });
  it("ships with NO logo or product image — the grid has to render without them", () => {
    // The whole point of the wordmark fallback. If a default ever gains a logo,
    // this test is the reminder to check the empty case still looks finished.
    expect(brands.every((b) => !b.logo && !b.product)).toBe(true);
  });
  it("reads a stored row back defensively", () => {
    const row = asBrand({ name: "Keune", desc_sv: "Text", logo: "", url: 42 });
    expect(row).toEqual({
      slug: "",
      name: "Keune",
      desc_sv: "Text",
      desc_en: "",
      url: "",
      logo: undefined,
      product: undefined,
    });
  });
});

describe("courses", () => {
  it("ships EMPTY on purpose — the salon has no published programme", () => {
    // Not an oversight: a fabricated course on a live client site is worse than
    // an empty programme that says so. See content/courses.json.
    expect(getCourses()).toEqual([]);
  });
  it("reads a stored row back defensively", () => {
    const row = asCourse({ title_sv: "Balayage", when: "14 oktober", price: null });
    expect(courseTitle(row, "sv")).toBe("Balayage");
    expect(courseTitle(row, "en")).toBe("");
    expect(row.when).toBe("14 oktober");
    expect(row.price).toBe("");
    expect(row.image).toBeUndefined();
  });
});

describe("awards + site", () => {
  it("has award years", () => {
    expect(getAwards().some((a) => a.year === 2026)).toBe(true);
  });
  it("exposes the Voady booking url and address", () => {
    expect(bookingUrl()).toBe("https://bokning.voady.se/novo");
    expect(getSite().address.street).toBe("Rörstrandsgatan 39C");
  });
});
