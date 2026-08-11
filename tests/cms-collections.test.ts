import { describe, it, expect, vi, afterEach } from "vitest";
import {
  deleteCollectionItem,
  getCollectionItem,
  insertCollectionItem,
  listCollectionItems,
  loadCollection,
  reorderCollection,
  updateCollectionItem,
  validateCollectionItem,
  validateIdList,
} from "~/lib/cms/collections";
import type { CollectionDef } from "~/lib/cms/config-types";
import { CMS } from "~/cms.config";
import { FakeD1, throwingD1 } from "./helpers/fake-d1";

/**
 * The generic list layer. The schema IS the validator, so most of what is worth
 * asserting here is "what does a `FieldDef` actually enforce" — and the one
 * behaviour that guards live content: an unedited save must not strip anything.
 */

const def: CollectionDef = {
  name: "widgets",
  label: "Widgets",
  orderable: true,
  jsonFallback: () => [{ title_sv: "Ur JSON", title_en: "From JSON" }],
  fields: [
    { name: "key", kind: "text", label: "Nyckel", readOnly: true },
    { name: "title", kind: "text", label: "Rubrik", bilingual: true, required: true, maxLen: 10 },
    { name: "bullets", kind: "list", label: "Punkter", bilingual: true, maxItems: 2, maxLen: 8 },
    { name: "url", kind: "url", label: "Länk" },
    { name: "count", kind: "number", label: "Antal" },
    { name: "live", kind: "toggle", label: "Aktiv" },
    { name: "poster", kind: "image", label: "Bild" },
  ],
};

/** A row as `SELECT *` hands it over: `data` is JSON text. */
function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    collection: "widgets",
    data: JSON.stringify({ title_sv: "Ett", title_en: "One" }),
    sort_order: 0,
    status: "published",
    created_at: "2026-08-09T10:00:00.000Z",
    updated_at: "2026-08-09T10:00:00.000Z",
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateCollectionItem — the schema is the validator", () => {
  const minimal = { title_sv: "Ett", title_en: "One" };

  it("accepts a well-formed item and normalizes the absent fields", () => {
    const result = validateCollectionItem(def, minimal);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.value).toEqual({
      // `key` is readOnly but there is no stored item to carry it forward from,
      // so on a create it is validated like any other field.
      key: "",
      title_sv: "Ett",
      title_en: "One",
      bullets_sv: [],
      bullets_en: [],
      url: "",
      count: 0,
      live: false,
      poster: "",
    });
  });

  it("requires only the SWEDISH side of a bilingual required field", () => {
    // Swedish is canonical and every renderer falls back to it, so blocking a
    // save on a missing translation would block the client on work she may not
    // be able to do (R-5).
    expect(validateCollectionItem(def, { title_sv: "Ett", title_en: "" }).ok).toBe(true);
    expect(validateCollectionItem(def, { title_sv: "  ", title_en: "One" })).toMatchObject({
      ok: false,
      errors: [{ error: "invalid_input", field: "title_sv", detail: "required" }],
    });
  });

  it("enforces maxLen per side", () => {
    expect(validateCollectionItem(def, { ...minimal, title_en: "x".repeat(11) })).toMatchObject({
      ok: false,
      errors: [{ field: "title_en", detail: "too_long" }],
    });
  });

  it("validates a url only when it has a value", () => {
    expect(validateCollectionItem(def, { ...minimal, url: "" }).ok).toBe(true);
    expect(validateCollectionItem(def, { ...minimal, url: "not a url" })).toMatchObject({
      ok: false,
      errors: [{ field: "url", detail: "unparseable" }],
    });
    expect(validateCollectionItem(def, { ...minimal, url: "https://example.com" }).ok).toBe(true);
  });

  it("coerces a numeric string and rejects a non-number", () => {
    const ok = validateCollectionItem(def, { ...minimal, count: "42" });
    expect(ok.ok && ok.value.count).toBe(42);
    expect(validateCollectionItem(def, { ...minimal, count: "many" })).toMatchObject({
      ok: false,
      errors: [{ field: "count", detail: "bad_shape" }],
    });
  });

  it("coerces a checkbox toggle to a real boolean", () => {
    const on = validateCollectionItem(def, { ...minimal, live: "1" });
    expect(on.ok && on.value.live).toBe(true);
    const off = validateCollectionItem(def, { ...minimal, live: false });
    expect(off.ok && off.value.live).toBe(false);
  });

  it("accepts a media key in an image field and rejects anything outside that shape", () => {
    expect(validateCollectionItem(def, { ...minimal, poster: "posters/abc.jpg" }).ok).toBe(true);
    expect(validateCollectionItem(def, { ...minimal, poster: "https://evil.example/x" })).toMatchObject({
      ok: false,
      errors: [{ field: "poster", detail: "bad_shape" }],
    });
  });

  it("keeps a list as an array, drops blank lines, and caps entries and length", () => {
    // Blank lines are dropped BEFORE the cap is counted: a trailing newline in
    // the textarea must not read as an extra bullet.
    const ok = validateCollectionItem(def, { ...minimal, bullets_sv: ["ett", "  ", "två"] });
    expect(ok.ok && ok.value.bullets_sv).toEqual(["ett", "två"]);
    expect(validateCollectionItem(def, { ...minimal, bullets_sv: ["a", "b", "c"] })).toMatchObject({
      ok: false,
      errors: [{ field: "bullets_sv", detail: "too_many" }],
    });
    expect(validateCollectionItem(def, { ...minimal, bullets_sv: ["x".repeat(9)] })).toMatchObject({
      ok: false,
      errors: [{ field: "bullets_sv", detail: "too_long" }],
    });
  });

  it("strips unknown keys rather than storing them", () => {
    const result = validateCollectionItem(def, { ...minimal, _status: "PLACEHOLDER", junk: 1 });
    expect(result.ok && "junk" in result.value).toBe(false);
    expect(result.ok && "_status" in result.value).toBe(false);
  });

  it("reports errors in FIELD order, so the first message is the first field on screen", () => {
    const result = validateCollectionItem(def, { title_sv: "", url: "nope" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["title_sv", "url"]);
  });

  it("rejects a payload that is not an object", () => {
    expect(validateCollectionItem(def, ["nope"]).ok).toBe(false);
    expect(validateCollectionItem(def, null).ok).toBe(false);
  });
});

describe("validateCollectionItem — readOnly carry-forward", () => {
  it("accepts a readOnly value on CREATE, when there is no stored item yet", () => {
    const result = validateCollectionItem(def, { key: "ugc", title_sv: "Ett" });
    expect(result.ok && result.value.key).toBe("ugc");
  });

  it("copies it from the STORED item on update and ignores what the client sent", () => {
    const result = validateCollectionItem(
      def,
      { key: "hijacked", title_sv: "Ett" },
      { key: "ugc", title_sv: "Ett" },
    );
    expect(result.ok && result.value.key).toBe("ugc");
  });

  it("leaves it absent when the stored item never had one", () => {
    const result = validateCollectionItem(def, { key: "x", title_sv: "Ett" }, { title_sv: "Ett" });
    expect(result.ok && "key" in result.value).toBe(false);
  });
});

describe("collection round-trip — the data-loss guard [P2-C3]", () => {
  /**
   * The scenario: the client opens a seeded item, changes nothing, presses save.
   * Every field the schema does not declare is STRIPPED, so a property missing
   * from the config would silently destroy live page content on a save that
   * changed nothing.
   *
   * Nicole's copy runs this against one named collection (`SERVICES`). Written
   * here against EVERY configured collection instead, so it arms itself the
   * moment Phase B2 declares the first one rather than needing to be remembered.
   * `CMS.collections` is empty in Phase B1, which is why the mechanism itself is
   * held by the `def` fixture below.
   */
  it("an unedited save of the fixture's full shape strips nothing", () => {
    const stored: Record<string, unknown> = {
      key: "machine-key",
      title_sv: "Rubrik",
      title_en: "Heading",
      bullets_sv: ["ett", "två"],
      bullets_en: ["one", "two"],
      url: "https://example.com",
      count: 3,
      live: true,
      poster: "blog/abc.jpg",
    };
    const result = validateCollectionItem(def, stored, stored);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const [key, value] of Object.entries(stored)) {
      expect(result.value[key], `${key} was stripped`).toEqual(value);
    }
  });

  for (const collection of CMS.collections) {
    const stored = collection.jsonFallback()[0] as Record<string, unknown> | undefined;
    if (!stored) continue;

    it(`${collection.name}: the seeded shape survives an unedited save intact`, () => {
      const result = validateCollectionItem(collection, stored, stored);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const [key, value] of Object.entries(stored)) {
        expect(result.value[key], `${collection.name}.${key} was stripped`).toEqual(value);
      }
    });

    it(`${collection.name}: the config declares every property the seed stores`, () => {
      // The seed writes each JSON item minus its `_`-prefixed notes; a property
      // the schema does not know about is a property the first save deletes.
      const declared = new Set(
        collection.fields.flatMap((field) =>
          field.bilingual ? [`${field.name}_sv`, `${field.name}_en`] : [field.name],
        ),
      );
      expect(Object.keys(stored).filter((key) => !declared.has(key))).toEqual([]);
    });
  }
});

describe("validateIdList", () => {
  it("accepts positive integers", () => {
    expect(validateIdList([3, 1, 2])).toEqual({ ok: true, value: [3, 1, 2] });
  });

  it("rejects duplicates, non-integers, zero and an over-long list", () => {
    expect(validateIdList([1, 1])).toMatchObject({ ok: false, errors: [{ detail: "duplicate" }] });
    expect(validateIdList([1.5]).ok).toBe(false);
    expect(validateIdList([0]).ok).toBe(false);
    expect(validateIdList("nope").ok).toBe(false);
    expect(validateIdList(Array.from({ length: 501 }, (_, i) => i + 1)).ok).toBe(false);
  });
});

describe("listCollectionItems", () => {
  it("scopes to the collection, orders by sort_order, and parses the payload", async () => {
    const db = new FakeD1(() => [dbRow()]);
    const items = await listCollectionItems(db, "widgets", { includeDrafts: false });
    expect(db.last?.binds).toEqual(["widgets"]);
    expect(db.sqlAt(0)).toContain("ORDER BY sort_order ASC, id ASC");
    expect(items[0]!.data).toEqual({ title_sv: "Ett", title_en: "One" });
  });

  it("filters to published unless drafts are asked for", async () => {
    const published = new FakeD1(() => []);
    await listCollectionItems(published, "widgets", { includeDrafts: false });
    expect(published.sqlAt(0)).toContain("status = 'published'");

    const all = new FakeD1(() => []);
    await listCollectionItems(all, "widgets", { includeDrafts: true });
    expect(all.sqlAt(0)).not.toContain("status");
  });

  it("SKIPS a row whose JSON will not parse rather than 500ing the public page", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = new FakeD1(() => [dbRow({ id: 1, data: "{not json" }), dbRow({ id: 2 })]);
    const items = await listCollectionItems(db, "widgets", { includeDrafts: true });
    expect(items.map((item) => item.id)).toEqual([2]);
    expect(warn).toHaveBeenCalled();
  });

  it("skips a payload that parses but is not an object", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = new FakeD1(() => [dbRow({ data: "[1,2]" })]);
    expect(await listCollectionItems(db, "widgets", { includeDrafts: true })).toEqual([]);
  });
});

describe("loadCollection — fallback only on the ABSENCE of a database", () => {
  it("null db → the JSON default", async () => {
    expect(await loadCollection(null, def)).toEqual({
      items: [{ title_sv: "Ur JSON", title_en: "From JSON" }],
      source: "fallback",
    });
  });

  it("a query throw → the JSON default, with a warning and no rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadCollection(throwingD1(), def)).resolves.toMatchObject({ source: "fallback" });
    expect(warn).toHaveBeenCalled();
  });

  it("a BOUND but empty table is TRUTH — deletion must not refill from the seed", async () => {
    expect(await loadCollection(new FakeD1(() => []), def)).toEqual({ items: [], source: "d1" });
  });

  it("bound rows come back as bare payloads in sort order", async () => {
    const db = new FakeD1(() => [dbRow()]);
    const result = await loadCollection(db, def);
    expect(result).toEqual({ items: [{ title_sv: "Ett", title_en: "One" }], source: "d1" });
  });
});

describe("collection CRUD", () => {
  it("getCollectionItem returns the parsed row, or null", async () => {
    expect((await getCollectionItem(new FakeD1(() => [dbRow()]), 1))?.id).toBe(1);
    expect(await getCollectionItem(new FakeD1(() => []), 9)).toBeNull();
  });

  it("insert lands the item LAST in its list", async () => {
    const db = new FakeD1((query) =>
      query.sql.includes("MAX(sort_order)") ? [{ n: 4 }] : [dbRow({ id: 7, sort_order: 5 })],
    );
    const item = await insertCollectionItem(db, "widgets", { title_sv: "Ny" }, "n@e.se", "now");
    expect(item.id).toBe(7);
    expect(db.queries[1]!.binds).toEqual([
      "widgets",
      JSON.stringify({ title_sv: "Ny" }),
      5,
      "now",
      "now",
      "n@e.se",
    ]);
  });

  it("insert into an empty collection starts at 0", async () => {
    const db = new FakeD1((query) =>
      query.sql.includes("MAX(sort_order)") ? [{ n: null }] : [dbRow()],
    );
    await insertCollectionItem(db, "widgets", {}, "", "now");
    expect(db.queries[1]!.binds[2]).toBe(0);
  });

  it("update never touches sort_order — an edit must not undo a reorder", async () => {
    const db = new FakeD1(() => [dbRow()]);
    await updateCollectionItem(db, 1, { title_sv: "Två" }, "n@e.se", "later");
    expect(db.sqlAt(0)).not.toContain("sort_order");
    expect(db.last?.binds).toEqual([JSON.stringify({ title_sv: "Två" }), "later", "n@e.se", 1]);
  });

  it("update returns null for an unknown id, which the route turns into a 404", async () => {
    expect(await updateCollectionItem(new FakeD1(() => []), 9, {}, "", "now")).toBeNull();
  });

  it("delete reports whether the row was there", async () => {
    expect(await deleteCollectionItem(new FakeD1(() => [{ id: 1 }]), 1)).toBe(true);
    expect(await deleteCollectionItem(new FakeD1(() => []), 9)).toBe(false);
  });
});

describe("reorderCollection", () => {
  it("writes the array index as sort_order, scoped to the collection", async () => {
    const db = new FakeD1(() => []);
    await reorderCollection(db, "widgets", [7, 3], "now");
    expect(db.sqlAt(0)).toContain("WHERE id = ? AND collection = ?");
    expect(db.queries[0]!.binds).toEqual([0, "now", 7, "widgets"]);
    expect(db.queries[1]!.binds).toEqual([1, "now", 3, "widgets"]);
  });

  it("an id from another collection matches nothing — a stale tab cannot corrupt a list", async () => {
    const db = new FakeD1(() => []);
    await reorderCollection(db, "widgets", [99], "now");
    expect(db.queries[0]!.binds).toContain("widgets");
  });
});
