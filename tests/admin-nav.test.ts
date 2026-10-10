import { describe, expect, it } from "vitest";
import { CMS } from "../src/cms.config";
import { navGroups } from "../src/lib/admin-nav";
import { ADMIN } from "../src/lib/admin-strings";

/**
 * AdminNav "Innehåll" (2026-10-10). The derived chips used to be one 24-chip
 * row in which a copy page and a list shared a label ("Våra brands" twice,
 * "Butiken (Keune)" twice, "Utbildning & kurser" beside "Kurser & utbildningar").
 */
const LABELS = { facts: ADMIN.nav.groupFacts, copy: ADMIN.nav.groupCopy, lists: ADMIN.nav.groupLists };
const groups = navGroups(CMS, LABELS);
const all = groups.flatMap((g) => g.items);

describe("AdminNav derived links", () => {
  it("no two derived nav labels are equal (case- and space-insensitive)", () => {
    const norm = all.map((i) => i.label.trim().toLowerCase().replace(/\s+/g, " "));
    const dupes = norm.filter((l, i) => norm.indexOf(l) !== i);
    expect(dupes).toEqual([]);
  });

  it("no two derived links point at the same screen", () => {
    const hrefs = all.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("groups in order Fakta · Sidtexter · Listor, each from its own config array", () => {
    expect(groups.map((g) => g.label)).toEqual(["Fakta", "Sidtexter", "Listor"]);
    expect(groups[0]!.items).toHaveLength(CMS.contentGroups.length);
    expect(groups[1]!.items).toHaveLength(CMS.editableCopy.length);
    expect(groups[2]!.items).toHaveLength(CMS.collections.length);
    expect(groups[2]!.items.every((i) => i.href.startsWith("/admin/collections/"))).toBe(true);
  });

  it("the three renamed lists carry their new labels", () => {
    const lists = groups[2]!.items.map((i) => i.label);
    expect(lists).toEqual(expect.arrayContaining(["Varumärken (lista)", "Produkter (lista)", "Kurser (lista)"]));
  });

  it("an empty group is dropped, not rendered as a bare heading", () => {
    const g = navGroups({ contentGroups: [], editableCopy: [], collections: CMS.collections }, LABELS);
    expect(g.map((x) => x.key)).toEqual(["lists"]);
    expect(navGroups({ contentGroups: [], editableCopy: [], collections: [] }, LABELS)).toEqual([]);
  });
});
