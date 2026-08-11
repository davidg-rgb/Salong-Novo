import { describe, it, expect, vi, afterEach } from "vitest";
import { ALLOWED_MIME, sniffImageType, mimeToExt, servedUrl } from "~/lib/cms/media";
import {
  listMediaRows,
  insertMediaRow,
  getMediaRow,
  updateMediaAlt,
  deleteMediaRow,
  mediaUsage,
  clearMediaRefs,
} from "~/lib/cms/media-db";
import { CMS } from "~/cms.config";
import type { UsageQuery } from "~/lib/cms/config-types";
import { FakeD1, fakeD1 } from "./helpers/fake-d1";

// ── byte-signature fixtures (ported from salong-novo-v2/tests/media.test.ts) ──
// Minimal-but-real magic bytes. The sniffer is the upload trust boundary, so its
// fixtures are the actual leading bytes of each format, not stand-ins.

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

// JPEG: FF D8 FF + a JFIF-ish tail (only the first 3 bytes are required).
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46);
// PNG: the full 8-byte signature.
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d);
// WebP: "RIFF" ‥ "WEBP" (4 size bytes between).
const WEBP = bytes(
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x1a, 0x00, 0x00, 0x00, // (size, ignored)
  0x57, 0x45, 0x42, 0x50, // WEBP
  0x56, 0x50, 0x38, 0x20, // VP8 chunk
);
// AVIF: [size][ftyp][avif major brand][minor][compatible brands].
const AVIF = bytes(
  0x00, 0x00, 0x00, 0x1c,
  0x66, 0x74, 0x79, 0x70, // "ftyp"
  0x61, 0x76, 0x69, 0x66, // "avif" major brand
  0x00, 0x00, 0x00, 0x00, // minor version
  0x61, 0x76, 0x69, 0x66, // compatible brand "avif"
  0x6d, 0x69, 0x66, 0x31, // compatible brand "mif1"
);
// AVIF variant: generic major brand, an AVIF brand only in the compatible list.
const AVIF_COMPAT = bytes(
  0x00, 0x00, 0x00, 0x20,
  0x66, 0x74, 0x79, 0x70, // "ftyp"
  0x6d, 0x69, 0x66, 0x31, // "mif1" major brand (also AVIF-family)
  0x00, 0x00, 0x00, 0x00, // minor version
  0x61, 0x76, 0x69, 0x73, // compatible brand "avis"
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sniffImageType — real magic bytes", () => {
  it("recognizes a JPEG signature", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
  });
  it("recognizes a PNG signature", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
  });
  it("recognizes a WebP (RIFF‥WEBP) signature", () => {
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });
  it("recognizes an AVIF ftyp/avif signature", () => {
    expect(sniffImageType(AVIF)).toBe("image/avif");
  });
  it("recognizes AVIF when the AVIF brand is only a compatible brand", () => {
    expect(sniffImageType(AVIF_COMPAT)).toBe("image/avif");
  });

  it("returns null for a garbage buffer", () => {
    expect(sniffImageType(bytes(0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07))).toBeNull();
  });

  it("returns null for a buffer too short to carry a signature", () => {
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull(); // JPEG needs 3
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull(); // PNG needs 8
    expect(sniffImageType(bytes())).toBeNull();
  });

  it("returns null for RIFF that is not WEBP (a WAV)", () => {
    const wav = bytes(
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, // "WAVE", not "WEBP"
    );
    expect(sniffImageType(wav)).toBeNull();
  });

  it("returns null for an ftyp box with a non-image brand (an mp4)", () => {
    const mp4 = bytes(
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // "ftyp"
      0x6d, 0x70, 0x34, 0x32, // "mp42" — not AVIF family
      0x00, 0x00, 0x00, 0x00,
      0x69, 0x73, 0x6f, 0x6d, // "isom"
    );
    expect(sniffImageType(mp4)).toBeNull();
  });

  it("reports the REAL type of a file claimed as JPEG but carrying PNG bytes", () => {
    // This disagreement is exactly what the upload route turns into a 415
    // content_mismatch: the declared MIME is not evidence, the bytes are.
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(PNG)).not.toBe("image/jpeg");
  });

  it("never returns anything outside ALLOWED_MIME", () => {
    for (const buffer of [JPEG, PNG, WEBP, AVIF, AVIF_COMPAT]) {
      const sniffed = sniffImageType(buffer);
      expect(sniffed).not.toBeNull();
      expect(ALLOWED_MIME.has(sniffed!)).toBe(true);
    }
  });
});

describe("mimeToExt", () => {
  it("maps each allowed MIME to its extension", () => {
    expect(mimeToExt("image/jpeg")).toBe("jpg");
    expect(mimeToExt("image/png")).toBe("png");
    expect(mimeToExt("image/webp")).toBe("webp");
    expect(mimeToExt("image/avif")).toBe("avif");
  });
  it("collapses an unknown MIME to bin rather than trusting it", () => {
    expect(mimeToExt("application/octet-stream")).toBe("bin");
    expect(mimeToExt("image/gif")).toBe("bin");
    expect(mimeToExt("")).toBe("bin");
  });
});

describe("servedUrl", () => {
  it("Stage A: an empty base serves same-origin through the public route", () => {
    expect(servedUrl("", "blog/x.jpg")).toBe("/api/media/blog/x.jpg");
  });
  it("Stage B: a configured base serves straight off the R2 domain", () => {
    expect(servedUrl("https://img.salongnovo.se", "blog/x.jpg")).toBe(
      "https://img.salongnovo.se/blog/x.jpg",
    );
  });
  it("trims a trailing slash on the base so we never emit //", () => {
    expect(servedUrl("https://img.salongnovo.se/", "blog/x.jpg")).toBe(
      "https://img.salongnovo.se/blog/x.jpg",
    );
  });

  // DROPPED IN THIS PORT: nicole's `servedUrl` ↔ `posterSrc` parity block. It
  // exists because her public grid has a SECOND implementation of the same rule;
  // this project has one (`src/lib/media.ts`'s `servedUrl`, the same function),
  // so there is nothing to hold in agreement.
});

// ── media-db against the fake D1 ─────────────────────────────────────────────

const ROW = {
  id: 7,
  r2_key: "blog/abc.jpg",
  alt: "Nicole i studio",
  mime: "image/jpeg",
  bytes: 20480,
  created_at: "2026-08-09T10:00:00.000Z",
};

describe("listMediaRows", () => {
  it("maps rows to MediaItems with a served url, newest first", async () => {
    const db = fakeD1([ROW]);
    const items = await listMediaRows(db, "");
    expect(items).toEqual([
      {
        id: 7,
        key: "blog/abc.jpg",
        url: "/api/media/blog/abc.jpg",
        alt: "Nicole i studio",
        mime: "image/jpeg",
        bytes: 20480,
        createdAt: "2026-08-09T10:00:00.000Z",
      },
    ]);
    expect(db.sqlAt(0)).toContain("ORDER BY created_at DESC, id DESC");
  });

  it("passes limit and offset as binds", async () => {
    const db = fakeD1([]);
    await listMediaRows(db, "", 25, 50);
    expect(db.last?.binds).toEqual([25, 50]);
  });

  it("renders Stage-B urls when a base is configured", async () => {
    const items = await listMediaRows(fakeD1([ROW]), "https://img.salongnovo.se");
    expect(items[0]!.url).toBe("https://img.salongnovo.se/blog/abc.jpg");
  });
});

describe("insertMediaRow", () => {
  it("returns the new id from RETURNING rather than a second SELECT", async () => {
    const db = fakeD1([{ id: 42 }]);
    const id = await insertMediaRow(
      db,
      { r2_key: "blog/new.png", alt: "alt", mime: "image/png", bytes: 100 },
      "2026-08-09T12:00:00.000Z",
    );
    expect(id).toBe(42);
    expect(db.sqlAt(0)).toContain("RETURNING id");
    expect(db.last?.binds).toEqual([
      "blog/new.png",
      "alt",
      "image/png",
      100,
      "2026-08-09T12:00:00.000Z",
    ]);
  });
});

describe("getMediaRow", () => {
  it("finds a row by its R2 key", async () => {
    const db = fakeD1([ROW]);
    const item = await getMediaRow(db, "blog/abc.jpg");
    expect(item?.key).toBe("blog/abc.jpg");
    expect(db.last?.binds).toEqual(["blog/abc.jpg"]);
  });

  it("returns null for an unknown key — this is what the 404s are built on", async () => {
    expect(await getMediaRow(fakeD1([]), "blog/gone.jpg")).toBeNull();
  });
});

describe("updateMediaAlt / deleteMediaRow", () => {
  it("updates the alt by key", async () => {
    const db = fakeD1([]);
    await updateMediaAlt(db, "blog/abc.jpg", "ny beskrivning");
    expect(db.sqlAt(0)).toContain("UPDATE media SET alt = ? WHERE r2_key = ?");
    expect(db.last?.binds).toEqual(["ny beskrivning", "blog/abc.jpg"]);
  });

  it("deletes the row by key", async () => {
    const db = fakeD1([]);
    await deleteMediaRow(db, "blog/abc.jpg");
    expect(db.sqlAt(0)).toContain("DELETE FROM media WHERE r2_key = ?");
    expect(db.last?.binds).toEqual(["blog/abc.jpg"]);
  });
});

/**
 * A fake that answers each configured usage query with a count of its own, keyed
 * by the table it reads — the same discrimination the real queries make.
 */
function usageDb(counts: {
  cover?: number;
  body?: number;
  kv?: number;
  collections?: number;
}): FakeD1 {
  return new FakeD1((query) => {
    if (!/^\s*SELECT/i.test(query.sql)) return [];
    // Both post queries read `posts`, so they are told apart by the column the
    // real statements differ on — the same discrimination the config makes.
    if (query.sql.includes("cover_image")) return [{ n: counts.cover ?? 0 }];
    if (query.sql.includes("body LIKE")) return [{ n: counts.body ?? 0 }];
    if (query.sql.includes("content_kv")) return [{ n: counts.kv ?? 0 }];
    if (query.sql.includes("collection_items")) return [{ n: counts.collections ?? 0 }];
    return [{ n: 0 }];
  });
}

describe("mediaUsage", () => {
  it("returns labelled non-zero hits for the configured queries", async () => {
    const hits = await mediaUsage(
      usageDb({ cover: 1, body: 4, kv: 2, collections: 3 }),
      "blog/abc.jpg",
      CMS.usageQueries,
    );
    expect(hits).toEqual([
      { label: "Omslagsbilder", count: 1 },
      { label: "Bilder i inlägg", count: 4 },
      { label: "Innehållsfält", count: 2 },
      { label: "Listor", count: 3 },
    ]);
  });

  it("omits queries that found nothing — a zero is not a warning", async () => {
    const hits = await mediaUsage(usageDb({ cover: 2 }), "blog/abc.jpg", CMS.usageQueries);
    expect(hits).toEqual([{ label: "Omslagsbilder", count: 2 }]);
  });

  it("returns [] when the key is referenced nowhere (the plain-delete path)", async () => {
    expect(await mediaUsage(usageDb({}), "blog/abc.jpg", CMS.usageQueries)).toEqual([]);
  });

  it("binds the key exactly once per query — the §6.11 bind contract", async () => {
    const db = usageDb({ cover: 1 });
    await mediaUsage(db, "blog/abc.jpg", CMS.usageQueries);
    expect(db.queries).toHaveLength(CMS.usageQueries.length);
    for (const query of db.queries) expect(query.binds).toEqual(["blog/abc.jpg"]);
  });
});

describe("clearMediaRefs", () => {
  it("nulls the cover references and reports what it cleared", async () => {
    const db = usageDb({ cover: 1 });
    const result = await clearMediaRefs(db, "blog/abc.jpg", CMS.usageQueries);

    expect(result).toEqual({ cleared: [{ label: "Omslagsbilder", count: 1 }], unclearable: [] });
    // The clear statement actually ran, and it is the cover_image → NULL update
    // that makes the post fall back to its no-cover layout.
    const mutations = db.queries.filter((q) => /^\s*UPDATE/i.test(q.sql));
    expect(mutations).toHaveLength(1);
    expect(mutations[0]!.sql).toContain("SET cover_image = NULL");
    expect(mutations[0]!.binds).toEqual(["blog/abc.jpg"]);
  });

  it("clears kv values too, and reports both classes", async () => {
    const result = await clearMediaRefs(
      usageDb({ cover: 1, kv: 2 }),
      "blog/abc.jpg",
      CMS.usageQueries,
    );
    expect(result.cleared).toEqual([
      { label: "Omslagsbilder", count: 1 },
      { label: "Innehållsfält", count: 2 },
    ]);
    expect(result.unclearable).toEqual([]);
  });

  it("surfaces a matching query with no clearSql as unclearable, not as cleared", async () => {
    // The collection query reads a JSON document; SQL string surgery on it would
    // risk corrupting the payload, so the reference is made VISIBLE instead.
    const db = usageDb({ body: 1, collections: 1 });
    const result = await clearMediaRefs(db, "blog/abc.jpg", CMS.usageQueries);

    expect(result.cleared).toEqual([]);
    // Two of them here: a Markdown body reference is unclearable for the same
    // reason — blind string surgery either breaks the image or eats a sentence.
    expect(result.unclearable).toEqual(["Bilder i inlägg", "Listor"]);
    expect(db.queries.filter((q) => /^\s*(UPDATE|DELETE)/i.test(q.sql))).toEqual([]);
  });

  it("runs no mutation for a query that matched nothing", async () => {
    const db = usageDb({});
    const result = await clearMediaRefs(db, "blog/abc.jpg", CMS.usageQueries);
    expect(result).toEqual({ cleared: [], unclearable: [] });
    expect(db.queries.filter((q) => /^\s*(UPDATE|DELETE)/i.test(q.sql))).toEqual([]);
  });

  it("handles a config with no usage queries at all", async () => {
    const none: UsageQuery[] = [];
    expect(await clearMediaRefs(fakeD1([]), "blog/abc.jpg", none)).toEqual({
      cleared: [],
      unclearable: [],
    });
  });
});
