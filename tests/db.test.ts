import { describe, it, expect } from "vitest";
import {
  type Database,
  type PreparedStatement,
  type PostRow,
  type MediaRow,
  mapRow,
  listPublished,
  getBySlug,
  listAll,
  getById,
  takenSlugs,
  listAdmin,
  listMedia,
  insertMedia,
  deleteMediaRow,
  mediaUsage,
  insertPost,
  updatePost,
  deletePost,
} from "../src/lib/db";

/** Records the last SQL + binds, returns canned rows. */
class FakeDB implements Database {
  lastSql = "";
  lastBinds: unknown[] = [];
  constructor(private rows: unknown[] = []) {}
  prepare(sql: string): PreparedStatement {
    this.lastSql = sql;
    const self = this;
    const stmt: PreparedStatement = {
      bind(...values: unknown[]) {
        self.lastBinds = values;
        return stmt;
      },
      async all<T>() {
        return { results: self.rows as unknown as T[] };
      },
      async first<T>() {
        return (self.rows[0] ?? null) as T | null;
      },
      async run() {
        return {};
      },
    };
    return stmt;
  }
}

const row: PostRow = {
  id: 7,
  slug: "hartrender-2026",
  locale: "sv",
  title: "Hårtrender 2026",
  excerpt: "Curtain bangs",
  body: "**hej**",
  cover_image: "blog/x.webp",
  author: "Ellen",
  status: "published",
  seo_title: null,
  seo_desc: null,
  published_at: "2026-01-10",
  created_at: "2026-01-01",
  updated_at: "2026-01-09",
};

describe("mapRow", () => {
  it("maps snake_case row to a camelCase Post", () => {
    const p = mapRow(row);
    expect(p.coverImage).toBe("blog/x.webp");
    expect(p.publishedAt).toBe("2026-01-10");
    expect(p.locale).toBe("sv");
    expect(p.status).toBe("published");
  });
  it("defaults unknown locale/status safely", () => {
    const p = mapRow({ ...row, locale: "fr", status: "weird" });
    expect(p.locale).toBe("sv");
    expect(p.status).toBe("draft");
  });
});

describe("listPublished", () => {
  it("queries published rows for the locale and maps them", async () => {
    const db = new FakeDB([row]);
    const out = await listPublished(db, "sv", 10, 0);
    expect(db.lastSql).toContain("status = 'published'");
    expect(db.lastSql).toContain("ORDER BY published_at DESC");
    expect(db.lastBinds).toEqual(["sv", 10, 0]);
    expect(out[0]!.slug).toBe("hartrender-2026");
  });
  it("excludes published rows with a null published_at (defensive)", async () => {
    const db = new FakeDB([row]);
    await listPublished(db, "sv");
    expect(db.lastSql).toContain("published_at IS NOT NULL");
  });
});

describe("getBySlug", () => {
  it("returns null when not found", async () => {
    const db = new FakeDB([]);
    expect(await getBySlug(db, "sv", "nope")).toBeNull();
  });
  it("only matches PUBLISHED posts (drafts are not public)", async () => {
    const db = new FakeDB([row]);
    await getBySlug(db, "sv", "hartrender-2026");
    expect(db.lastSql).toContain("status = 'published'");
    expect(db.lastBinds).toEqual(["sv", "hartrender-2026"]);
  });
});

describe("listAll", () => {
  it("returns every post ordered by most-recently-updated (admin dashboard)", async () => {
    const db = new FakeDB([row]);
    const out = await listAll(db);
    expect(db.lastSql).toContain("ORDER BY updated_at DESC");
    expect(db.lastSql).not.toContain("status =");
    expect(out[0]!.id).toBe(7);
  });
});

describe("updatePost", () => {
  it("binds the row, sets published_at for published posts, and targets WHERE id", async () => {
    const db = new FakeDB([row]);
    await updatePost(
      db,
      7,
      { slug: "p", locale: "sv", title: "P", body: "b", status: "published" },
      "2026-06-01T00:00:00Z",
    );
    expect(db.lastSql).toContain("UPDATE posts");
    expect(db.lastSql).toContain("WHERE id=?");
    expect(db.lastSql).toContain("RETURNING *");
    expect(db.lastBinds[10]).toBe("2026-06-01T00:00:00Z"); // published_at
    expect(db.lastBinds[12]).toBe(7); // id (last bind)
  });
  it("nulls published_at when reverting to draft", async () => {
    const db = new FakeDB([row]);
    await updatePost(
      db,
      7,
      { slug: "p", locale: "sv", title: "P", body: "b", status: "draft" },
      "2026-06-01T00:00:00Z",
    );
    expect(db.lastBinds[10]).toBeNull();
  });
  it("returns the stored row mapped to a Post (RETURNING *)", async () => {
    const db = new FakeDB([row]);
    const out = await updatePost(
      db,
      7,
      { slug: "p", locale: "sv", title: "P", body: "b", status: "published" },
      "2026-06-01T00:00:00Z",
    );
    expect(out.id).toBe(7);
    expect(out.slug).toBe("hartrender-2026");
  });
});

describe("deletePost", () => {
  it("deletes by id", async () => {
    const db = new FakeDB();
    await deletePost(db, 7);
    expect(db.lastSql).toContain("DELETE FROM posts WHERE id = ?");
    expect(db.lastBinds).toEqual([7]);
  });
});

describe("insertPost", () => {
  it("nulls published_at for drafts", async () => {
    const db = new FakeDB([row]);
    await insertPost(
      db,
      { slug: "d", locale: "sv", title: "D", body: "b", status: "draft" },
      "2026-05-31T00:00:00Z",
    );
    // published_at is the 11th bound value (index 10)
    expect(db.lastBinds[10]).toBeNull();
  });
  it("defaults published_at to now for published posts", async () => {
    const db = new FakeDB([row]);
    await insertPost(
      db,
      { slug: "p", locale: "sv", title: "P", body: "b", status: "published" },
      "2026-05-31T00:00:00Z",
    );
    expect(db.lastBinds[10]).toBe("2026-05-31T00:00:00Z");
  });
  it("returns the inserted row mapped to a Post (RETURNING *)", async () => {
    const db = new FakeDB([row]);
    const out = await insertPost(
      db,
      { slug: "d", locale: "sv", title: "D", body: "b", status: "draft" },
      "2026-05-31T00:00:00Z",
    );
    expect(db.lastSql).toContain("RETURNING *");
    expect(out.id).toBe(7);
    expect(out.title).toBe("Hårtrender 2026");
  });
});

describe("getById", () => {
  it("returns the mapped Post by id", async () => {
    const db = new FakeDB([row]);
    const out = await getById(db, 7);
    expect(out?.id).toBe(7);
    expect(out?.slug).toBe("hartrender-2026");
  });
  it("queries WHERE id = ? and binds [id]", async () => {
    const db = new FakeDB([row]);
    await getById(db, 7);
    expect(db.lastSql).toContain("WHERE id = ?");
    expect(db.lastBinds).toEqual([7]);
  });
  it("returns null when not found", async () => {
    const db = new FakeDB([]);
    expect(await getById(db, 999)).toBeNull();
  });
});

describe("takenSlugs", () => {
  it("lists slugs for a locale", async () => {
    const db = new FakeDB([{ slug: "a" }, { slug: "b" }]);
    const out = await takenSlugs(db, "sv");
    expect(db.lastSql).toContain("WHERE locale = ?");
    expect(db.lastSql).not.toContain("id != ?");
    expect(db.lastBinds).toEqual(["sv"]);
    expect(out).toEqual(["a", "b"]);
  });
  it("excludes a given id when provided", async () => {
    const db = new FakeDB([{ slug: "a" }]);
    await takenSlugs(db, "en", 7);
    expect(db.lastSql).toContain("id != ?");
    expect(db.lastBinds).toEqual(["en", 7]);
  });
});

describe("listAdmin", () => {
  it("no filters → no WHERE, ordered by updated_at DESC", async () => {
    const db = new FakeDB([row]);
    const out = await listAdmin(db, {});
    expect(db.lastSql).not.toContain("WHERE");
    expect(db.lastSql).toContain("ORDER BY updated_at DESC");
    expect(db.lastBinds).toEqual([]);
    expect(out[0]!.id).toBe(7);
  });
  it("locale filter only", async () => {
    const db = new FakeDB([row]);
    await listAdmin(db, { locale: "sv" });
    expect(db.lastSql).toContain("WHERE locale = ?");
    expect(db.lastBinds).toEqual(["sv"]);
  });
  it("status filter only", async () => {
    const db = new FakeDB([row]);
    await listAdmin(db, { status: "draft" });
    expect(db.lastSql).toContain("WHERE status = ?");
    expect(db.lastBinds).toEqual(["draft"]);
  });
  it("q filter uses a case-insensitive LIKE", async () => {
    const db = new FakeDB([row]);
    await listAdmin(db, { q: "Trend" });
    expect(db.lastSql).toContain("lower(title) LIKE '%' || lower(?) || '%'");
    expect(db.lastBinds).toEqual(["Trend"]);
  });
  it("combines all filters in order locale, status, q", async () => {
    const db = new FakeDB([row]);
    await listAdmin(db, { locale: "en", status: "published", q: "x" });
    expect(db.lastSql).toContain("WHERE locale = ? AND status = ? AND lower(title) LIKE '%' || lower(?) || '%'");
    expect(db.lastBinds).toEqual(["en", "published", "x"]);
  });
});

const mediaRow: MediaRow = {
  id: 3,
  post_id: 7,
  r2_key: "blog/uuid.webp",
  alt: "En bild",
  width: null,
  height: null,
  variants: "[480,960]",
  created_at: "2026-02-01",
};

describe("listMedia", () => {
  it("orders by created_at DESC and binds limit/offset", async () => {
    const db = new FakeDB([mediaRow]);
    await listMedia(db, "", 50, 10);
    expect(db.lastSql).toContain("FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?");
    expect(db.lastBinds).toEqual([50, 10]);
  });
  it("maps a row, parses variants JSON, and joins the served URL (empty base)", async () => {
    const db = new FakeDB([mediaRow]);
    const out = await listMedia(db, "");
    expect(out[0]).toEqual({
      id: 3,
      key: "blog/uuid.webp",
      url: "/api/media/blog/uuid.webp",
      alt: "En bild",
      variants: [480, 960],
      createdAt: "2026-02-01",
    });
  });
  it("uses originalUrl when a base is supplied", async () => {
    const db = new FakeDB([mediaRow]);
    const out = await listMedia(db, "https://img.salongnovo.se");
    expect(out[0]!.url).toBe("https://img.salongnovo.se/blog/uuid.webp");
  });
  it("defaults variants to [] on garbage/null JSON", async () => {
    const db = new FakeDB([{ ...mediaRow, variants: "not json" }, { ...mediaRow, variants: null }]);
    const out = await listMedia(db, "");
    expect(out[0]!.variants).toEqual([]);
    expect(out[1]!.variants).toEqual([]);
  });
});

describe("insertMedia", () => {
  it("inserts a media row with defaults", async () => {
    const db = new FakeDB();
    await insertMedia(db, { r2_key: "blog/x.webp", alt: "alt" }, "2026-02-01");
    expect(db.lastSql).toContain("INSERT INTO media");
    // [post_id, r2_key, alt, width, height, variants, created_at]
    expect(db.lastBinds).toEqual([null, "blog/x.webp", "alt", null, null, "[]", "2026-02-01"]);
  });
  it("carries post_id and variants when supplied", async () => {
    const db = new FakeDB();
    await insertMedia(
      db,
      { r2_key: "blog/x.webp", alt: "alt", post_id: 9, variants: "[480]" },
      "2026-02-01",
    );
    expect(db.lastBinds).toEqual([9, "blog/x.webp", "alt", null, null, "[480]", "2026-02-01"]);
  });
});

describe("deleteMediaRow", () => {
  it("deletes by r2_key", async () => {
    const db = new FakeDB();
    await deleteMediaRow(db, "blog/x.webp");
    expect(db.lastSql).toContain("DELETE FROM media WHERE r2_key = ?");
    expect(db.lastBinds).toEqual(["blog/x.webp"]);
  });
});

describe("mediaUsage", () => {
  it("returns post ids referencing the key (cover or body)", async () => {
    const db = new FakeDB([{ id: 7 }, { id: 9 }]);
    const out = await mediaUsage(db, "blog/x.webp");
    expect(db.lastSql).toContain("cover_image = ?");
    expect(db.lastSql).toContain("body LIKE '%' || ? || '%'");
    expect(db.lastBinds).toEqual(["blog/x.webp", "blog/x.webp"]);
    expect(out).toEqual([7, 9]);
  });
  it("returns [] when no post references the key", async () => {
    const db = new FakeDB([]);
    expect(await mediaUsage(db, "blog/x.webp")).toEqual([]);
  });
});
