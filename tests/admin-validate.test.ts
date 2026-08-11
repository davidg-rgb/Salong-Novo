import { describe, it, expect } from "vitest";
import { parsePostWrite } from "../src/lib/admin-validate";

function base(over: Record<string, unknown> = {}) {
  return {
    title: "Hårtrender 2026",
    locale: "sv",
    status: "draft",
    body: "**hej**",
    ...over,
  };
}

describe("parsePostWrite — success", () => {
  it("normalizes a minimal valid body", () => {
    const res = parsePostWrite(base());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.title).toBe("Hårtrender 2026");
    expect(res.value.locale).toBe("sv");
    expect(res.value.status).toBe("draft");
    expect(res.value.body).toBe("**hej**");
    expect(res.value.excerpt).toBe("");
    expect(res.value.coverImage).toBeNull();
    expect(res.value.author).toBe("");
    expect(res.value.seoTitle).toBeNull();
    expect(res.value.seoDesc).toBeNull();
    expect(res.value.slugOverride).toBeUndefined();
    expect(res.value.id).toBeUndefined();
  });

  it("trims the title and keeps optional fields", () => {
    const res = parsePostWrite(
      base({
        title: "  Spaced  ",
        excerpt: "Curtain bangs",
        author: "Ellen",
        seoTitle: "SEO",
        seoDesc: "Desc",
        status: "published",
        locale: "en",
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.title).toBe("Spaced");
    expect(res.value.excerpt).toBe("Curtain bangs");
    expect(res.value.author).toBe("Ellen");
    expect(res.value.seoTitle).toBe("SEO");
    expect(res.value.seoDesc).toBe("Desc");
    expect(res.value.status).toBe("published");
    expect(res.value.locale).toBe("en");
  });

  it("accepts a positive integer id", () => {
    const res = parsePostWrite(base({ id: 42 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.id).toBe(42);
  });

  it("allows an empty body", () => {
    const res = parsePostWrite(base({ body: "" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.body).toBe("");
  });

  it("coerces blank seo fields to null", () => {
    const res = parsePostWrite(base({ seoTitle: "   ", seoDesc: "" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.seoTitle).toBeNull();
    expect(res.value.seoDesc).toBeNull();
  });
});

describe("parsePostWrite — failures", () => {
  it("rejects a non-object body", () => {
    const res = parsePostWrite(null);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fail).toEqual({ error: "title_required", field: "title" });
  });

  it("title_required when title is missing/empty", () => {
    for (const t of [undefined, "", "   ", 5]) {
      const res = parsePostWrite(base({ title: t }));
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.fail).toEqual({ error: "title_required", field: "title" });
    }
  });

  it("invalid_locale (no silent sv default)", () => {
    const res = parsePostWrite(base({ locale: "fr" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fail).toEqual({ error: "invalid_locale", field: "locale" });
  });

  it("invalid_locale when locale absent", () => {
    const res = parsePostWrite(base({ locale: undefined }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fail.error).toBe("invalid_locale");
  });

  it("invalid_status for an unknown status", () => {
    const res = parsePostWrite(base({ status: "archived" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fail).toEqual({ error: "invalid_status", field: "status" });
  });

  it("invalid_id for non-positive / non-integer ids", () => {
    for (const id of [0, -1, 1.5, "3"]) {
      const res = parsePostWrite(base({ id }));
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.fail).toEqual({ error: "invalid_id", field: "id" });
    }
  });
});

describe("parsePostWrite — coverImage URL→key strip", () => {
  it("keeps a bare R2 key", () => {
    const res = parsePostWrite(base({ coverImage: "blog/abc.webp" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.coverImage).toBe("blog/abc.webp");
  });

  it("strips an /api/media/ served URL to the key", () => {
    const res = parsePostWrite(
      base({ coverImage: "https://salongnovo.se/api/media/blog/abc.webp" }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.coverImage).toBe("blog/abc.webp");
  });

  it("strips a relative /api/media/ URL to the key", () => {
    const res = parsePostWrite(base({ coverImage: "/api/media/blog/abc.webp" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.coverImage).toBe("blog/abc.webp");
  });

  it("strips a CDN origin to the key", () => {
    const res = parsePostWrite(
      base({ coverImage: "https://img.salongnovo.se/blog/abc.webp" }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.coverImage).toBe("blog/abc.webp");
  });

  it("null when coverImage is empty/absent", () => {
    expect(parsePostWrite(base({ coverImage: "" })).ok && parsePostWrite(base({ coverImage: "" }))).toBeTruthy();
    const res = parsePostWrite(base({ coverImage: "   " }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.coverImage).toBeNull();
  });
});

describe("parsePostWrite — slugOverride", () => {
  it("set only when raw.slug is a non-empty string", () => {
    const res = parsePostWrite(base({ slug: "  custom-slug " }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.slugOverride).toBe("custom-slug");
  });

  it("omitted when slug is empty/whitespace/absent", () => {
    for (const slug of ["", "   ", undefined, 5]) {
      const res = parsePostWrite(base({ slug }));
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.value.slugOverride).toBeUndefined();
    }
  });
});
