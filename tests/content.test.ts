import { describe, it, expect } from "vitest";
import {
  getStaff,
  getStylist,
  getServices,
  showServicePrices,
  getAwards,
  getStats,
  getSite,
  bookingUrl,
  serviceName,
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

describe("awards + site", () => {
  it("reports three Collection-of-the-Year wins and 17 stylists", () => {
    expect(getStats().arets_kollektion_wins).toBe(3);
    expect(getStats().stylists).toBe(17);
  });
  it("has award years", () => {
    expect(getAwards().some((a) => a.year === 2026)).toBe(true);
  });
  it("exposes the Voady booking url and address", () => {
    expect(bookingUrl()).toBe("https://bokning.voady.se/novo");
    expect(getSite().address.street).toBe("Rörstrandsgatan 39C");
  });
});
