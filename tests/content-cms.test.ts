import { describe, it, expect } from "vitest";
import { FakeD1 } from "./helpers/fake-d1";
import { CMS, STAFF, SERVICES, AWARDS } from "~/cms.config";
import { PAGE_COPY, pageCopyDict, paraKeys } from "~/lib/pagecopy";
import {
  asStylist,
  bookingUrl,
  flatAwards,
  getSite,
  getStaff,
  getStats,
  stylistPhotoUrl,
} from "~/lib/content";
import { resolveCollection } from "~/lib/collections";
import { validateCollectionItem } from "~/lib/cms/collections";
import { copyKey, toKvMap, type ContentKvRow } from "~/lib/cms/content";
import { t, useT, LOCALES } from "~/i18n";
import sv from "~/i18n/ui.sv.json";
import en from "~/i18n/ui.en.json";

/**
 * NOVO's content MODEL — the seams between the JSON/TS defaults, the dictionary
 * and the CMS. The core's own behaviour is covered by the ported cms-* suites;
 * what is asserted here is that this project's content actually flows through
 * them, and keeps flowing when the client saves.
 */

const row = (key: string, value_sv: string, value_en: string): ContentKvRow => ({
  key,
  value_sv,
  value_en,
  updated_at: "2026-08-11T00:00:00.000Z",
  updated_by: "test@salongnovo.se",
});

describe("page copy → dictionary bridge", () => {
  it("the two dictionary sources occupy disjoint namespaces", () => {
    // A shared top-level key would make one source silently shadow the other,
    // and the loser would be un-editable with no error anywhere.
    const chrome = new Set([...Object.keys(sv), ...Object.keys(en)]);
    const overlap = Object.keys(PAGE_COPY).filter((group) => chrome.has(group));
    expect(overlap).toEqual([]);
  });

  it("every page-copy string resolves through t() in both locales", () => {
    const unresolved: string[] = [];
    for (const locale of LOCALES) {
      for (const [group, fields] of Object.entries(pageCopyDict(locale))) {
        for (const [name, value] of Object.entries(fields)) {
          const key = `${group}.${name}`;
          if (t(locale, key) !== value) unresolved.push(`${locale}:${key}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("a multi-paragraph default expands to numbered keys, in order", () => {
    const keys = paraKeys("about", "body");
    expect(keys).toEqual(["about.body1", "about.body2", "about.body3"]);
    expect(keys.map((key) => t("sv", key))).toEqual(PAGE_COPY.about.body.sv);
    expect(keys.map((key) => t("en", key))).toEqual(PAGE_COPY.about.body.en);
  });

  it("paraKeys is derived from the default, not from a hardcoded count", () => {
    // Adding a paragraph to pagecopy.ts must allowlist and render it with no
    // second edit — which is only true if the count comes from the data.
    for (const group of ["about", "work", "privacy"] as const) {
      expect(paraKeys(group, "body")).toHaveLength(PAGE_COPY[group].body.sv.length);
    }
  });

  it("both locales carry the same page-copy keys — no half-translated group", () => {
    expect(Object.keys(pageCopyDict("en"))).toEqual(Object.keys(pageCopyDict("sv")));
    for (const [group, fields] of Object.entries(pageCopyDict("sv"))) {
      expect(Object.keys(pageCopyDict("en")[group]!), group).toEqual(Object.keys(fields));
    }
  });
});

describe("copy overrides reach the page", () => {
  const kv = toKvMap([row(copyKey("about.heading"), "Ny rubrik.", "")]);

  it("a stored override beats the pagecopy default", () => {
    expect(useT("sv", kv)("about.heading")).toBe("Ny rubrik.");
  });

  it("a blank English side falls through to the English default, not the Swedish edit", () => {
    // The §6.6 per-side rule. An SV-only edit shadowing the EN translation is
    // the failure this project would notice last and care about most.
    expect(useT("en", kv)("about.heading")).toBe(PAGE_COPY.about.heading.en);
  });

  it("no row leaves the developer default in place", () => {
    expect(useT("sv", null)("about.heading")).toBe(PAGE_COPY.about.heading.sv);
    expect(useT("sv", toKvMap([]))("about.heading")).toBe(PAGE_COPY.about.heading.sv);
  });

  it("an override still interpolates — a placeholder is not lost in the edit", () => {
    const named = toKvMap([row(copyKey("cta.bookWith"), "Boka {name} nu", "Book {name} now")]);
    expect(useT("sv", named)("cta.bookWith", { name: "Ellen" })).toBe("Boka Ellen nu");
  });
});

describe("every editable site fact actually reaches the page", () => {
  /**
   * THE gate this project learned the hard way. `mergeSiteOverrides` only
   * applies a key of the form `site.<container>.<leaf>` — a key naming a
   * TOP-LEVEL scalar is skipped in silence. `content/site.json` used to hold
   * `phone_display`, `email` and `name` at the root, so those fields saved
   * cleanly in the admin, reported `{"ok":true}`, and changed nothing on the
   * page. Nothing else in the system noticed; only a live probe did.
   *
   * The fields are nested now, and this asserts the property rather than the
   * shape: write a row for EVERY allowlisted key and require the merged
   * document to differ from the defaults at exactly that path.
   */
  const leafAt = (doc: unknown, key: string): unknown => {
    const parts = key.split(".");
    parts.shift();
    let node: unknown = doc;
    for (const part of parts) {
      node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
    }
    return node;
  };

  it("a stored override changes the value the page reads, for every key", () => {
    const inert: string[] = [];
    for (const group of CMS.contentGroups) {
      for (const field of group.fields) {
        const kv = toKvMap([row(field.key, "ÖVERSKRIVET", "OVERWRITTEN")]);
        const merged = getSite(kv) as unknown;
        const suffix = field.bilingual ? "_sv" : "";
        if (leafAt(merged, field.key + suffix) !== "ÖVERSKRIVET") inert.push(field.key);
      }
    }
    expect(inert).toEqual([]);
  });

  it("and leaves every other fact alone", () => {
    const kv = toKvMap([row("site.contact.email", "ny@salongnovo.se", "")]);
    const merged = getSite(kv);
    expect(merged.contact.email).toBe("ny@salongnovo.se");
    expect(merged.contact.phone).toBe(getSite().contact.phone);
    expect(merged.address.street).toBe(getSite().address.street);
  });

  it("no fact sits at the root of site.json, where the merge cannot reach it", () => {
    // The shape rule behind the test above, stated once so a future edit that
    // adds `site.newThing` fails here with an explanation rather than there.
    const scalars = Object.entries(getSite() as unknown as Record<string, unknown>)
      .filter(([key, value]) => !key.startsWith("_") && (value === null || typeof value !== "object"))
      .map(([key]) => key);
    expect(scalars).toEqual([]);
  });
});

describe("site facts resolve through the kv merge", () => {
  it("the homepage numbers come from site.json and survive an edit", () => {
    expect(getStats()).toEqual({ arets_kollektion_wins: 3, stylists: 18, founded: 2013 });
    const kv = toKvMap([row("site.stats.stylists", "19", "")]);
    expect(getStats(kv).stylists).toBe("19");
    // Untouched keys keep their defaults — the merge is a clone, not a replace.
    expect(getStats(kv).arets_kollektion_wins).toBe(3);
  });

  it("the booking url every CTA points at is editable", () => {
    expect(bookingUrl()).toBe("https://bokning.voady.se/novo");
    const kv = toKvMap([row("site.booking.url", "https://example.test/boka", "")]);
    expect(bookingUrl(kv)).toBe("https://example.test/boka");
  });
});

describe("services bullets survive a save (RUNBOOK §8 landmine 5)", () => {
  /**
   * THE regression this project was warned about by name: `bullets_sv` /
   * `bullets_en` are ARRAYS, unknown keys are stripped on save, and without the
   * `list` field kind the first press of Spara would silently empty both sides.
   */
  const def = CMS.collections.find((collection) => collection.name === "services")!;

  it("declares bullets as the list kind", () => {
    expect(def.fields.find((field) => field.name === "bullets")?.kind).toBe("list");
  });

  it("round-trips both bilingual arrays through validation", () => {
    const stored = {
      slug: "balayage",
      name_sv: "Balayage",
      name_en: "Balayage",
      desc_sv: "Mjuka toner.",
      desc_en: "Soft tones.",
      bullets_sv: ["Konsultation ingår", "Toning ingår"],
      bullets_en: ["Consultation included", "Toning included"],
      price: "från 2 400 kr",
    };

    const saved = validateCollectionItem(SERVICES, stored, stored);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    expect(saved.value.bullets_sv).toEqual(stored.bullets_sv);
    expect(saved.value.bullets_en).toEqual(stored.bullets_en);
    // And the whole payload survives, not just the arrays.
    expect(saved.value.price).toBe("från 2 400 kr");
    expect(saved.value.slug).toBe("balayage");
  });

  it("a second save is idempotent — the arrays do not erode", () => {
    const first = validateCollectionItem(SERVICES, {
      slug: "toning",
      name_sv: "Toning",
      bullets_sv: ["Ett", "Två"],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = validateCollectionItem(SERVICES, first.value, first.value);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual(first.value);
  });
});

describe("the staff roster as a collection", () => {
  it("the defaults are the 18 stylists, minus the JSON's own notes", () => {
    const items = STAFF.jsonFallback() as Record<string, unknown>[];
    expect(items).toHaveLength(18);
    expect(items.map((item) => item.slug)).toEqual(getStaff().map((s) => s.slug));
  });

  it("a default item reads back as the Stylist the grid renders", () => {
    const [first] = STAFF.jsonFallback() as Record<string, unknown>[];
    expect(asStylist(first!)).toEqual(getStaff()[0]);
  });

  it("a stored row missing optional fields still renders", () => {
    // The admin writes JSON documents; a page must not depend on every property
    // being there. An absent handle becomes null, which is what the modal's
    // existing truthiness check already expects.
    const stylist = asStylist({ name: "Ny Stylist", slug: "ny-stylist" });
    expect(stylist.instagram).toBeNull();
    expect(stylist.awards).toEqual([]);
    expect(stylist.bio_sv).toBe("");
    expect(stylist.photo).toBeUndefined();
  });

  it("survives a save without losing its awards list or its slug", () => {
    const [first] = STAFF.jsonFallback() as Record<string, unknown>[];
    const saved = validateCollectionItem(STAFF, first!, first!);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.slug).toBe(first!.slug);
    expect(saved.value.awards).toEqual(first!.awards);
    // The shipped portrait is a value the client never typed and must not have to
    // fix: an unedited save keeps it, which is only true because the `image` field
    // accepts a bundled asset path alongside an R2 key.
    expect(saved.value.photo).toBe(first!.photo);
  });

  it("takes an uploaded portrait over the shipped one, through the same field", () => {
    const [first] = STAFF.jsonFallback() as Record<string, unknown>[];
    const saved = validateCollectionItem(STAFF, { ...first!, photo: "blog/abc123.jpg" }, first!);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(stylistPhotoUrl(asStylist(saved.value).photo)).toBe("/api/media/blog/abc123.jpg");
  });

  it("still refuses a photo that is neither a bundled asset nor a media key", () => {
    const [first] = STAFF.jsonFallback() as Record<string, unknown>[];
    for (const photo of ["https://evil.example/x.jpg", "//evil.example/x.jpg"]) {
      expect(validateCollectionItem(STAFF, { ...first!, photo }, first!), photo).toMatchObject({
        ok: false,
        errors: [{ field: "photo", detail: "bad_shape" }],
      });
    }
  });
});

describe("the awards flattening adapter", () => {
  it("turns the nested document into one row per result", () => {
    const rows = flatAwards();
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({
      year: 2026,
      competition: "Årets Frisör",
      category: "Årets Nykomling",
      result: "Vinnare",
      people: ["Ellen Rudd"],
      photographer: "Ellen Rudd",
      note: "",
      location: "",
    });
  });

  it("carries the year and competition down onto every row", () => {
    // The flattening is the whole reason a row is editable at all: a
    // collection_items payload has no parent to inherit from.
    for (const award of flatAwards()) {
      expect(award.year).toBeGreaterThan(2000);
      expect(award.competition).not.toBe("");
    }
  });

  it("keeps the Nordic Hairshot row's location, which only it has", () => {
    const nordic = flatAwards().find((a) => a.competition.startsWith("Nordic"));
    expect(nordic?.location).toBe("Köpenhamn, 25 oktober");
  });

  it("round-trips a flattened row through validation unchanged", () => {
    const [first] = AWARDS.jsonFallback() as Record<string, unknown>[];
    const saved = validateCollectionItem(AWARDS, first!, first!);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value).toEqual(first);
  });
});

describe("resolveCollection — this project's no-seed provenance rule", () => {
  it("falls back to the JSON defaults with no database at all", async () => {
    const resolved = await resolveCollection(null, STAFF);
    expect(resolved.source).toBe("fallback");
    expect(resolved.items).toHaveLength(18);
  });

  it("falls back when the table holds no rows for this collection", async () => {
    // The divergence from the reference project, and the reason this wrapper
    // exists: nothing is seeded here, so zero rows means "never edited", not
    // "deleted". The core's loadCollection would render an empty team grid.
    const resolved = await resolveCollection(new FakeD1(() => []), STAFF);
    expect(resolved.source).toBe("fallback");
    expect(resolved.items).toHaveLength(18);
  });

  it("hands the whole list to D1 as soon as one row exists", async () => {
    const db = new FakeD1(() => [
      {
        id: 1,
        collection: "staff",
        data: JSON.stringify({ name: "Ellen Rudd", slug: "ellen-rudd" }),
        sort_order: 0,
        status: "published",
        created_at: "",
        updated_at: "",
      },
    ]);
    const resolved = await resolveCollection(db, STAFF);
    expect(resolved.source).toBe("d1");
    expect(resolved.items).toHaveLength(1);
    expect(asStylist(resolved.items[0]!).name).toBe("Ellen Rudd");
  });

  it("falls back when the query throws, rather than taking the page down", async () => {
    const db = new FakeD1(() => {
      throw new Error("no such table");
    });
    const resolved = await resolveCollection(db, STAFF);
    expect(resolved.source).toBe("fallback");
    expect(resolved.items).toHaveLength(18);
  });
});
