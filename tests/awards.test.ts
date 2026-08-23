import { describe, it, expect } from "vitest";
import { groupAwards, resultTone, resultLabel, awardImages, peopleLine } from "~/lib/awards";
import { flatAwards, type AwardRow } from "~/lib/content";

/**
 * The competition page's whole shaping layer. The page itself is a template over
 * these four functions, which is what keeps `CompetitionsPage.astro` free of
 * branching — and what makes "the client reordered the list in the admin" a
 * testable statement rather than a manual click-through.
 */

const row = (over: Partial<AwardRow> = {}): AwardRow => ({
  year: 2026,
  competition: "Årets Frisör",
  category: "Årets Herr",
  result: "Nominerad",
  people: ["Isabella Valentino"],
  photographer: "Ellen Simone",
  note: "",
  location: "",
  images: [],
  ...over,
});

describe("groupAwards", () => {
  it("nests flat rows back into year → competition → items", () => {
    const grouped = groupAwards([
      row({ year: 2025, competition: "Årets Frisör", category: "Årets Kollektion" }),
      row({ year: 2026, competition: "Årets Frisör", category: "Årets Nykomling" }),
      row({ year: 2025, competition: "Nordic Hairshot Awards", category: "Final" }),
    ]);

    expect(grouped.map((g) => g.year)).toEqual([2026, 2025]);
    expect(grouped[0]!.competitions.map((c) => c.competition)).toEqual(["Årets Frisör"]);
    expect(grouped[1]!.competitions.map((c) => c.competition)).toEqual([
      "Årets Frisör",
      "Nordic Hairshot Awards",
    ]);
  });

  it("orders years newest first", () => {
    const grouped = groupAwards([row({ year: 2013 }), row({ year: 2026 }), row({ year: 2019 })]);
    expect(grouped.map((g) => g.year)).toEqual([2026, 2019, 2013]);
  });

  it("keeps competitions and items in first-seen order within a year", () => {
    // First-seen is JSON order for the defaults and sort_order for D1 — which is
    // the only reason drag-to-reorder in the admin changes this page.
    const grouped = groupAwards([
      row({ year: 2025, competition: "B", category: "b1" }),
      row({ year: 2025, competition: "A", category: "a1" }),
      row({ year: 2025, competition: "B", category: "b2" }),
      row({ year: 2025, competition: "A", category: "a2" }),
    ]);
    expect(grouped[0]!.competitions.map((c) => c.competition)).toEqual(["B", "A"]);
    expect(grouped[0]!.competitions[0]!.items.map((i) => i.category)).toEqual(["b1", "b2"]);
    expect(grouped[0]!.competitions[1]!.items.map((i) => i.category)).toEqual(["a1", "a2"]);
  });

  it("coerces a year that arrived from D1 as a string, and merges it with the number", () => {
    // The admin's number field round-trips through a text input, so "2025" and
    // 2025 are the same year and must not open two headings.
    const grouped = groupAwards([
      row({ year: 2025 }),
      row({ year: "2025" as unknown as number, category: "Årets Dam" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.year).toBe(2025);
    expect(grouped[0]!.competitions[0]!.items).toHaveLength(2);
  });

  it("sorts an unreadable year last instead of pretending it is year zero", () => {
    const grouped = groupAwards([
      row({ year: "snart" as unknown as number, category: "Kommande" }),
      row({ year: 2019 }),
      row({ year: 2026 }),
    ]);
    expect(grouped.map((g) => g.year).slice(0, 2)).toEqual([2026, 2019]);
    expect(Number.isNaN(grouped[2]!.year)).toBe(true);
  });

  it("collects every unreadable year into ONE group, not one group each", () => {
    // NaN !== NaN, so the naive Map key would open a heading per bad row.
    const grouped = groupAwards([
      row({ year: undefined as unknown as number }),
      row({ year: "" as unknown as number }),
      row({ year: null as unknown as number }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.competitions[0]!.items).toHaveLength(3);
  });

  it("is empty for no rows — a deleted list renders nothing, not a stray heading", () => {
    expect(groupAwards([])).toEqual([]);
  });

  it("shapes the real document: 2026 first, and 2025 carries both competitions", () => {
    const grouped = groupAwards(flatAwards());
    expect(grouped.map((g) => g.year)).toEqual([2026, 2025]);
    expect(grouped[0]!.competitions[0]!.items).toHaveLength(4);
    expect(grouped[1]!.competitions.map((c) => c.competition)).toEqual([
      "Årets Frisör",
      "Nordic Hairshot Awards",
    ]);
  });
});

describe("resultTone", () => {
  it("classifies the four Swedish result words", () => {
    expect(resultTone("Vinnare")).toBe("winner");
    expect(resultTone("Nominerad")).toBe("nominated");
    expect(resultTone("Finalist")).toBe("finalist");
    expect(resultTone("Bidrag")).toBe("entry");
  });

  it("matches on the PREFIX, so a qualified result still reads as itself", () => {
    // The Nordic Hairshot row is literally "Finalist (Sverige)".
    expect(resultTone("Finalist (Sverige)")).toBe("finalist");
    expect(resultTone("Bidrag till Årets Brud")).toBe("entry");
    expect(resultTone("Vinnare 2027")).toBe("winner");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(resultTone("  VINNARE ")).toBe("winner");
    expect(resultTone("nominerad")).toBe("nominated");
  });

  it("falls back to `other` rather than dropping an unrecognised result", () => {
    expect(resultTone("Hedersomnämnande")).toBe("other");
    expect(resultTone("")).toBe("other");
    expect(resultTone(undefined as unknown as string)).toBe("other");
  });

  it("gives every row in the real document a tone the page styles", () => {
    for (const award of flatAwards()) {
      expect(resultTone(award.result), award.result).not.toBe("other");
    }
  });
});

describe("resultLabel", () => {
  it("prints the client's own Swedish verbatim, qualifier and all", () => {
    // "Finalist (Sverige)" through a lookup table would come back "Finalist".
    expect(resultLabel("Finalist (Sverige)", "sv", "Finalist")).toBe("Finalist (Sverige)");
    expect(resultLabel("Vinnare", "sv", "Vinnare")).toBe("Vinnare");
  });

  it("translates on the English page", () => {
    expect(resultLabel("Vinnare", "en", "Winner")).toBe("Winner");
    expect(resultLabel("Bidrag", "en", "Entry")).toBe("Entry");
  });

  it("falls back rather than rendering an empty pill", () => {
    // An unrecognised tone has no translation, so English shows the raw word.
    expect(resultLabel("Hedersomnämnande", "en", "")).toBe("Hedersomnämnande");
    expect(resultLabel("", "sv", "Vinnare")).toBe("Vinnare");
    expect(resultLabel("  ", "en", "")).toBe("");
  });
});

describe("awardImages", () => {
  it("keeps a bundled asset path exactly as written, in order", () => {
    expect(awardImages({ images: ["/images/awards-2025/dam-1.jpg", "/images/awards-2025/dam-2.jpg"] })).toEqual([
      "/images/awards-2025/dam-1.jpg",
      "/images/awards-2025/dam-2.jpg",
    ]);
  });

  it("keeps an uploaded R2 media key, so a client swap needs no second field", () => {
    expect(awardImages({ images: ["blog/abc123.jpg"] })).toEqual(["blog/abc123.jpg"]);
  });

  it("refuses anything that would point the page at another host", () => {
    // The two shapes `validateCollectionItem` refuses for an `image` field, held
    // to the same rule here (FORGE-MANIFEST divergence #15).
    expect(awardImages({ images: ["https://evil.example/x.jpg", "//evil.example/x.jpg"] })).toEqual([]);
  });

  it("drops the unrenderable and keeps the rest, rather than failing the whole row", () => {
    expect(
      awardImages({
        images: [
          "/images/awards-2026/herr-1.jpg",
          "javascript:alert(1)",
          42,
          null,
          "  /images/awards-2026/herr-2.jpg  ",
          "no-extension",
        ],
      }),
    ).toEqual(["/images/awards-2026/herr-1.jpg", "/images/awards-2026/herr-2.jpg"]);
  });

  it("is empty when the row has no images at all", () => {
    expect(awardImages({})).toEqual([]);
    expect(awardImages({ images: [] })).toEqual([]);
    // The old build's glob strings, should one survive an un-migrated row.
    expect(awardImages({ images: "awards/arets-frisor-2025/dam_*" })).toEqual([]);
  });

  it("every row in the real document renders at least two photos", () => {
    for (const award of flatAwards()) {
      expect(awardImages(award).length, `${award.year} ${award.category}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("peopleLine", () => {
  it("joins names with a typographic middot by default", () => {
    expect(peopleLine(["Chriss Berner", "Jannie Olofsson"])).toBe("Chriss Berner · Jannie Olofsson");
  });

  it("takes a separator, because alt text wants a comma and not a middot", () => {
    expect(peopleLine(["Ola Oterkjaer", "Chriss Berner"], ", ")).toBe("Ola Oterkjaer, Chriss Berner");
  });

  it("drops blanks instead of rendering a dangling separator", () => {
    expect(peopleLine(["Ellen Rudd", "", "   "])).toBe("Ellen Rudd");
  });

  it("is blank for a row with nobody on it", () => {
    expect(peopleLine([])).toBe("");
    expect(peopleLine(undefined)).toBe("");
  });
});
