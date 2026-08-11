import { describe, it, expect, vi, afterEach } from "vitest";
import {
  copyKey,
  deleteContentKv,
  listContentKv,
  loadCmsContent,
  mergeSiteOverrides,
  overrideSide,
  overrideValue,
  toKvMap,
  upsertContentKv,
  validateKvEntries,
  validateKvKeys,
  type ContentKvRow,
  type KvMap,
} from "~/lib/cms/content";
import type { CmsConfig } from "~/lib/cms/config-types";
import { FakeD1, throwingD1 } from "./helpers/fake-d1";

function row(over: Partial<ContentKvRow> = {}): ContentKvRow {
  return {
    key: "site.contact.email",
    value_sv: "hello@nicoleolmedo.com",
    value_en: "",
    updated_at: "2026-08-09T10:00:00.000Z",
    updated_by: "hello@nicoleolmedo.com",
    ...over,
  };
}

const kvOf = (...rows: Partial<ContentKvRow>[]): KvMap => toKvMap(rows.map((over) => row(over)));

/** A config with one of everything the allowlist has to know about. */
const config = {
  contentGroups: [
    {
      key: "contact",
      label: "Kontakt",
      fields: [
        { key: "site.contact.email", label: "E-post", kind: "text" },
        { key: "site.about.bio1", label: "Bio", kind: "textarea" },
      ],
    },
  ],
  editableCopy: [
    { page: "copy-home", label: "Start", keys: [{ key: "home.heroTitle", label: "Rubrik" }] },
  ],
  collections: [],
  mediaPrefix: "posters/",
  usageQueries: [],
  adminNav: [],
} as unknown as CmsConfig;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listContentKv", () => {
  it("reads the whole table in one query", async () => {
    const db = new FakeD1(() => [row()]);
    const rows = await listContentKv(db);
    expect(rows).toHaveLength(1);
    expect(db.queries).toHaveLength(1);
    expect(db.sqlAt(0)).toBe("SELECT * FROM content_kv");
  });
});

describe("toKvMap", () => {
  it("indexes rows by key", () => {
    const kv = toKvMap([row({ key: "a" }), row({ key: "b", value_sv: "B" })]);
    expect(kv.size).toBe(2);
    expect(kv.get("b")?.value_sv).toBe("B");
    expect(kv.get("missing")).toBeUndefined();
  });
  it("returns an empty map for an empty table", () => {
    expect(toKvMap([]).size).toBe(0);
  });
});

describe("loadCmsContent", () => {
  it("returns a d1-sourced bundle when the binding is there", async () => {
    const result = await loadCmsContent(new FakeD1(() => [row({ key: "site.brand.name" })]));
    expect(result.source).toBe("d1");
    expect(result.kv?.get("site.brand.name")).toBeDefined();
  });

  it("a BOUND but EMPTY table is still source d1 — no rows is a real answer", async () => {
    // Row existence is provenance. Zero rows means "the client has edited
    // nothing yet", not "there is no database".
    const result = await loadCmsContent(new FakeD1(() => []));
    expect(result).toMatchObject({ source: "d1" });
    expect(result.kv?.size).toBe(0);
  });

  it("null db → the JSON fallback bundle", async () => {
    expect(await loadCmsContent(null)).toEqual({ kv: null, source: "fallback" });
  });

  it("a throwing query degrades to the fallback with a warning, never a rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadCmsContent(throwingD1())).resolves.toEqual({
      kv: null,
      source: "fallback",
    });
    expect(warn).toHaveBeenCalled();
  });

  it("survives a table that does not exist yet (unmigrated local D1)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = {
      prepare: () => ({
        bind() {
          return this;
        },
        all: async () => {
          throw new Error("D1_ERROR: no such table: content_kv");
        },
        first: async () => null,
        run: async () => ({}),
      }),
    };
    await expect(loadCmsContent(db as never)).resolves.toMatchObject({ source: "fallback" });
  });
});

describe("copyKey — the one prefixing seam", () => {
  it("namespaces a bare dictionary key under copy.", () => {
    expect(copyKey("home.heroTitle")).toBe("copy.home.heroTitle");
  });
});

describe("overrideValue (site.*) [P1-C1]", () => {
  it("no row → null, so the JSON default applies", () => {
    expect(overrideValue(kvOf({ key: "site.brand.name" }), "site.model.bust", "sv")).toBeNull();
    expect(overrideValue(null, "site.model.bust", "sv")).toBeNull();
  });

  it("a whole-row blank is an INTENTIONAL blank — it hides the model-sheet row", () => {
    const kv = kvOf({ key: "site.model.bust", value_sv: "", value_en: "" });
    expect(overrideValue(kv, "site.model.bust", "sv")).toBe("");
    expect(overrideValue(kv, "site.model.bust", "en")).toBe("");
  });

  it("returns the requested side when it has content", () => {
    const kv = kvOf({ key: "site.contact.city", value_sv: "Göteborg", value_en: "Gothenburg" });
    expect(overrideValue(kv, "site.contact.city", "sv")).toBe("Göteborg");
    expect(overrideValue(kv, "site.contact.city", "en")).toBe("Gothenburg");
  });

  it("borrows the other side when the requested one is blank but the row is not", () => {
    const kv = kvOf({ key: "site.contact.city", value_sv: "Göteborg", value_en: "  " });
    expect(overrideValue(kv, "site.contact.city", "en")).toBe("Göteborg");
  });
});

describe("overrideSide (copy.*) [P1-C2]", () => {
  it("returns the requested side when it has content", () => {
    const kv = kvOf({ key: "copy.home.heroTitle", value_sv: "Hej", value_en: "Hello" });
    expect(overrideSide(kv, "copy.home.heroTitle", "en")).toBe("Hello");
  });

  it("a blank side returns null so the SAME locale's dictionary wins", () => {
    // The failure this prevents: an SV-only edit shadowing a real English
    // translation with Swedish. Per-SIDE resolution is the whole point.
    const kv = kvOf({ key: "copy.home.heroTitle", value_sv: "Hej", value_en: "" });
    expect(overrideSide(kv, "copy.home.heroTitle", "sv")).toBe("Hej");
    expect(overrideSide(kv, "copy.home.heroTitle", "en")).toBeNull();
  });

  it("no row → null", () => {
    expect(overrideSide(kvOf(), "copy.nope", "sv")).toBeNull();
    expect(overrideSide(null, "copy.nope", "sv")).toBeNull();
  });
});

describe("mergeSiteOverrides", () => {
  const base = {
    brand: { name: "Nicole Olmedo", motto_sv: "Svenskt", motto_en: "English" },
    brands: { count: "50+", names: [] as string[] },
    model: { bust_sv: "88", bust_en: "88" },
  };

  it("writes BOTH sides of a paired leaf, detected from the JSON shape", () => {
    const merged = mergeSiteOverrides(base, kvOf({ key: "site.brand.motto", value_sv: "A", value_en: "B" }));
    expect(merged.brand.motto_sv).toBe("A");
    expect(merged.brand.motto_en).toBe("B");
  });

  it("writes the Swedish side into a PLAIN leaf that has no locale pair", () => {
    // brand.name and brands.count are exactly the non-paired leaves an
    // enumerated field list got wrong (P2 Adv-W3).
    const merged = mergeSiteOverrides(
      base,
      kvOf({ key: "site.brand.name", value_sv: "Nya Namnet", value_en: "" }),
    );
    expect(merged.brand.name).toBe("Nya Namnet");
  });

  it("reaches a leaf in a different branch of the document", () => {
    const merged = mergeSiteOverrides(base, kvOf({ key: "site.brands.count", value_sv: "80+" }));
    expect(merged.brands.count).toBe("80+");
  });

  it("propagates the intentional blank so a model-sheet row disappears", () => {
    const merged = mergeSiteOverrides(
      base,
      kvOf({ key: "site.model.bust", value_sv: "", value_en: "" }),
    );
    expect(merged.model.bust_sv).toBe("");
    expect(merged.model.bust_en).toBe("");
  });

  it("returns the base itself when there is nothing to merge — the fallback path is free", () => {
    expect(mergeSiteOverrides(base, null)).toBe(base);
    expect(mergeSiteOverrides(base, toKvMap([]))).toBe(base);
  });

  it("deep-clones: one request's merge cannot leak into the next", () => {
    // The module-level JSON import is shared across every request in an isolate.
    // Mutating it would make one client edit permanent for everybody.
    const merged = mergeSiteOverrides(base, kvOf({ key: "site.brand.name", value_sv: "Muterad" }));
    expect(merged).not.toBe(base);
    expect(base.brand.name).toBe("Nicole Olmedo");
  });

  it("ignores a key that names a path this document does not have", () => {
    const merged = mergeSiteOverrides(base, kvOf({ key: "site.nope.missing", value_sv: "x" }));
    expect(merged).toEqual(base);
  });

  it("ignores copy.* rows — they belong to the dictionary, not to site.json", () => {
    const merged = mergeSiteOverrides(base, kvOf({ key: "copy.home.heroTitle", value_sv: "x" }));
    expect(merged).toEqual(base);
  });
});

describe("validateKvEntries — writes are allowlisted", () => {
  it("accepts an allowlisted site key", () => {
    const result = validateKvEntries(config, [
      { key: "site.contact.email", value_sv: "a@b.se", value_en: "" },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "site.contact.email", value_sv: "a@b.se", value_en: "" }],
    });
  });

  it("accepts a copy key only in its PREFIXED wire form", () => {
    expect(
      validateKvEntries(config, [{ key: "copy.home.heroTitle", value_sv: "Hej", value_en: "" }]).ok,
    ).toBe(true);
    // The bare key is what the config stores for readability; it is not the wire
    // format, and accepting both would make the key space ambiguous.
    expect(
      validateKvEntries(config, [{ key: "home.heroTitle", value_sv: "Hej", value_en: "" }]).ok,
    ).toBe(false);
  });

  it("rejects a key nobody allowlisted", () => {
    const result = validateKvEntries(config, [
      { key: "site.hacked.key", value_sv: "x", value_en: "" },
    ]);
    expect(result).toMatchObject({
      ok: false,
      errors: [{ error: "invalid_input", field: "site.hacked.key", detail: "unknown" }],
    });
  });

  it("caps length by field kind — text is short, a textarea is not", () => {
    const long = "x".repeat(400);
    expect(
      validateKvEntries(config, [{ key: "site.contact.email", value_sv: long, value_en: "" }]),
    ).toMatchObject({ ok: false, errors: [{ detail: "too_long" }] });
    expect(
      validateKvEntries(config, [{ key: "site.about.bio1", value_sv: long, value_en: "" }]).ok,
    ).toBe(true);
  });

  it("allows blank values — that is the intentional-blank signal, not an omission", () => {
    expect(
      validateKvEntries(config, [{ key: "site.contact.email", value_sv: "", value_en: "" }]).ok,
    ).toBe(true);
  });

  it("rejects a non-array body and a malformed entry", () => {
    expect(validateKvEntries(config, { key: "x" }).ok).toBe(false);
    expect(
      validateKvEntries(config, [{ key: "site.contact.email", value_sv: 5, value_en: "" }]),
    ).toMatchObject({ ok: false, errors: [{ detail: "bad_shape" }] });
  });
});

describe("upsertContentKv", () => {
  it("writes one UPSERT per entry, stamping who and when", async () => {
    const db = new FakeD1(() => []);
    await upsertContentKv(
      db,
      [{ key: "site.contact.email", value_sv: "a@b.se", value_en: "" }],
      "nicole@example.com",
      "2026-08-09T12:00:00.000Z",
    );
    expect(db.sqlAt(0)).toContain("ON CONFLICT(key) DO UPDATE");
    expect(db.last?.binds).toEqual([
      "site.contact.email",
      "a@b.se",
      "",
      "2026-08-09T12:00:00.000Z",
      "nicole@example.com",
    ]);
  });

  it("batches every entry in one call", async () => {
    const db = new FakeD1(() => []);
    await upsertContentKv(
      db,
      [
        { key: "a", value_sv: "1", value_en: "" },
        { key: "b", value_sv: "2", value_en: "" },
      ],
      "",
      "now",
    );
    expect(db.queries).toHaveLength(2);
  });
});

describe("validateKvKeys — reset is looser than write [P1 W-2]", () => {
  it("accepts an allowlisted key", () => {
    expect(validateKvKeys(config, ["site.contact.email"])).toEqual({
      ok: true,
      value: ["site.contact.email"],
    });
  });

  it("accepts a de-allowlisted key that still has a row — the orphan escape hatch", () => {
    // A row nobody can reach through the form is still overriding a default.
    expect(validateKvKeys(config, ["site.retired.key"], ["site.retired.key"]).ok).toBe(true);
  });

  it("rejects a key that is neither allowlisted nor on disk", () => {
    expect(validateKvKeys(config, ["site.hacked.key"], [])).toMatchObject({
      ok: false,
      errors: [{ field: "site.hacked.key", detail: "unknown" }],
    });
  });
});

describe("deleteContentKv", () => {
  it("removes existing rows and reports how many actually went", async () => {
    const db = new FakeD1((query) => (query.binds[0] === "site.contact.email" ? [{ key: "x" }] : []));
    expect(await deleteContentKv(db, ["site.contact.email", "site.nothing.here"])).toBe(1);
    expect(db.queries.some((q) => q.sql.includes("DELETE FROM content_kv"))).toBe(true);
  });

  it("deleting nothing is not an error", async () => {
    expect(await deleteContentKv(new FakeD1(() => []), ["site.gone"])).toBe(0);
  });
});
