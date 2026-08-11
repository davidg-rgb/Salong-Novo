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
} from "../src/lib/content";

describe("staff", () => {
  const staff = getStaff();
  it("has the full 18-person roster", () => {
    expect(staff).toHaveLength(18);
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
  it("reports three Collection-of-the-Year wins and 18 stylists", () => {
    expect(getStats().arets_kollektion_wins).toBe(3);
    expect(getStats().stylists).toBe(18);
  });
  it("has award years", () => {
    expect(getAwards().some((a) => a.year === 2026)).toBe(true);
  });
  it("exposes the Voady booking url and address", () => {
    expect(bookingUrl()).toBe("https://bokning.voady.se/novo");
    expect(getSite().address.street).toBe("Rörstrandsgatan 39C");
  });
});
