import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug, resolveSlug } from "../src/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });
  it("transliterates Swedish characters", () => {
    expect(slugify("Hårtrender för Våren")).toBe("hartrender-for-varen");
    expect(slugify("Köpenhamn & Stockholm")).toBe("kopenhamn-stockholm");
  });
  it("collapses and trims separators", () => {
    expect(slugify("  --Multiple   spaces-- ")).toBe("multiple-spaces");
  });
  it("strips emoji and punctuation", () => {
    expect(slugify("Balayage 💇‍♀️ 2026!")).toBe("balayage-2026");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("Nytt Inlägg", [])).toBe("nytt-inlagg");
  });
  it("appends a counter on collision", () => {
    expect(uniqueSlug("Trender", ["trender"])).toBe("trender-2");
    expect(uniqueSlug("Trender", ["trender", "trender-2"])).toBe("trender-3");
  });
  it("falls back to 'post' for empty input", () => {
    expect(uniqueSlug("💇", [])).toBe("post");
  });
});

describe("resolveSlug", () => {
  it("create: slugifies + uniquifies the title", () => {
    expect(resolveSlug(null, undefined, "Hårtrender 2026", [])).toBe("hartrender-2026");
  });
  it("create: an override wins over the title", () => {
    expect(resolveSlug(null, "Min Egen Slug", "Hårtrender 2026", [])).toBe("min-egen-slug");
  });
  it("create: blank/whitespace override falls back to the title", () => {
    expect(resolveSlug(null, "   ", "Hårtrender 2026", [])).toBe("hartrender-2026");
  });
  it("create: de-duplicates against taken slugs", () => {
    expect(resolveSlug(null, undefined, "Trender", ["trender"])).toBe("trender-2");
  });
  it("still-draft edit: recomputes from the (possibly new) title", () => {
    const existing = { slug: "gammal-slug", status: "draft" as const };
    expect(resolveSlug(existing, undefined, "Nytt Namn", [])).toBe("nytt-namn");
  });
  it("still-draft edit: honors an override", () => {
    const existing = { slug: "gammal-slug", status: "draft" as const };
    expect(resolveSlug(existing, "valt", "Nytt Namn", [])).toBe("valt");
  });
  it("published: returns the stored slug UNCHANGED (frozen)", () => {
    const existing = { slug: "publicerad-slug", status: "published" as const };
    expect(resolveSlug(existing, "ignoreras", "Helt Annan Titel", [])).toBe("publicerad-slug");
  });
});
