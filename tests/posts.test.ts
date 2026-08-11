import { describe, it, expect } from "vitest";
import {
  type Post,
  isPublished,
  publishedPosts,
  findBySlug,
  paginate,
  nextPublishedAt,
} from "../src/lib/posts";

function post(p: Partial<Post>): Post {
  return {
    id: 1,
    slug: "x",
    locale: "sv",
    title: "T",
    excerpt: "",
    body: "",
    coverImage: null,
    author: "",
    status: "published",
    seoTitle: null,
    seoDesc: null,
    publishedAt: "2026-01-01",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...p,
  };
}

describe("isPublished", () => {
  it("requires status + publishedAt", () => {
    expect(isPublished(post({}))).toBe(true);
    expect(isPublished(post({ status: "draft" }))).toBe(false);
    expect(isPublished(post({ publishedAt: null }))).toBe(false);
  });
});

describe("publishedPosts", () => {
  const posts = [
    post({ id: 1, slug: "a", publishedAt: "2026-01-01" }),
    post({ id: 2, slug: "b", publishedAt: "2026-03-01" }),
    post({ id: 3, slug: "c", status: "draft", publishedAt: null }),
    post({ id: 4, slug: "d", locale: "en", publishedAt: "2026-02-01" }),
  ];
  it("filters by locale + status and sorts newest first", () => {
    const out = publishedPosts(posts, "sv");
    expect(out.map((p) => p.slug)).toEqual(["b", "a"]);
  });
  it("respects the locale", () => {
    expect(publishedPosts(posts, "en").map((p) => p.slug)).toEqual(["d"]);
  });
});

describe("findBySlug", () => {
  const posts = [post({ slug: "a", locale: "sv" }), post({ slug: "a", locale: "en" })];
  it("matches locale + slug", () => {
    expect(findBySlug(posts, "en", "a")?.locale).toBe("en");
    expect(findBySlug(posts, "sv", "missing")).toBeUndefined();
  });
});

describe("nextPublishedAt", () => {
  const NOW = "2026-06-01T00:00:00Z";

  it("create draft → null", () => {
    expect(nextPublishedAt(null, "draft", NOW)).toBeNull();
  });
  it("create published → now", () => {
    expect(nextPublishedAt(null, "published", NOW)).toBe(NOW);
  });
  it("draft → published → now", () => {
    const existing = post({ status: "draft", publishedAt: null });
    expect(nextPublishedAt(existing, "published", NOW)).toBe(NOW);
  });
  it("published re-save (still published) → preserves existing publishedAt", () => {
    const existing = post({ status: "published", publishedAt: "2026-01-10" });
    expect(nextPublishedAt(existing, "published", NOW)).toBe("2026-01-10");
  });
  it("published → draft → null", () => {
    const existing = post({ status: "published", publishedAt: "2026-01-10" });
    expect(nextPublishedAt(existing, "draft", NOW)).toBeNull();
  });
  it("draft → draft → null", () => {
    const existing = post({ status: "draft", publishedAt: null });
    expect(nextPublishedAt(existing, "draft", NOW)).toBeNull();
  });
  it("republish (was draft/unpublished) → now", () => {
    const existing = post({ status: "draft", publishedAt: "2026-01-10" });
    expect(nextPublishedAt(existing, "published", NOW)).toBe(NOW);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);
  it("slices the right page", () => {
    const p = paginate(items, 1, 9);
    expect(p.items).toHaveLength(9);
    expect(p.totalPages).toBe(3);
    expect(p.hasNext).toBe(true);
    expect(p.hasPrev).toBe(false);
  });
  it("clamps out-of-range pages", () => {
    const p = paginate(items, 99, 9);
    expect(p.page).toBe(3);
    expect(p.items).toEqual([19, 20, 21, 22, 23, 24, 25]);
    expect(p.hasNext).toBe(false);
  });
});
