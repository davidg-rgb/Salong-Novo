import { describe, it, expect } from "vitest";
import {
  wrapInline,
  prefixBlock,
  insertLink,
  insertImage,
  toggleList,
  nextSlug,
  validateDraft,
  counter,
  toApiBody,
  isDirty,
  type PostDraft,
} from "../src/lib/editor";

/** A complete, valid baseline draft for the form-model tests. */
function draft(overrides: Partial<PostDraft> = {}): PostDraft {
  return {
    title: "Hårtrender för våren",
    slug: "hartrender-for-varen",
    slugManual: false,
    locale: "sv",
    excerpt: "En kort inledning.",
    coverImage: null,
    body: "Brödtext.",
    author: "NOVO",
    seoTitle: "",
    seoDesc: "",
    status: "draft",
    ...overrides,
  };
}

describe("wrapInline (bold/italic toggle)", () => {
  it("wraps a selection in the marker", () => {
    // "hello world", select "world" (6..11)
    const r = wrapInline({ value: "hello world", start: 6, end: 11 }, "**", "text");
    expect(r.value).toBe("hello **world**");
    // selection should still cover "world"
    expect(r.value.slice(r.start, r.end)).toBe("world");
  });

  it("round-trips: wrapping then unwrapping the same selection returns the original", () => {
    const original = { value: "hello world", start: 6, end: 11 };
    const wrapped = wrapInline(original, "**", "text");
    expect(wrapped.value).toBe("hello **world**");
    // Now the selection covers "world" inside the markers; toggle off.
    const unwrapped = wrapInline(
      { value: wrapped.value, start: wrapped.start, end: wrapped.end },
      "**",
      "text",
    );
    expect(unwrapped.value).toBe("hello world");
    expect(unwrapped.value.slice(unwrapped.start, unwrapped.end)).toBe("world");
  });

  it("unwraps when the markers sit just outside the selection", () => {
    // "hello **world**", select just "world" (8..13)
    const value = "hello **world**";
    const r = wrapInline({ value, start: 8, end: 13 }, "**", "text");
    expect(r.value).toBe("hello world");
    expect(r.value.slice(r.start, r.end)).toBe("world");
  });

  it("inserts a wrapped placeholder on an empty selection, caret around it", () => {
    const r = wrapInline({ value: "ab", start: 1, end: 1 }, "**", "fet");
    expect(r.value).toBe("a**fet**b");
    expect(r.value.slice(r.start, r.end)).toBe("fet");
  });

  it("works for italic with a single-char marker", () => {
    const r = wrapInline({ value: "italic", start: 0, end: 6 }, "_", "text");
    expect(r.value).toBe("_italic_");
    const off = wrapInline({ value: r.value, start: r.start, end: r.end }, "_", "text");
    expect(off.value).toBe("italic");
  });
});

describe("prefixBlock (heading/quote toggle)", () => {
  it("adds the prefix to a single line", () => {
    const r = prefixBlock({ value: "Rubrik", start: 0, end: 0 }, "## ");
    expect(r.value).toBe("## Rubrik");
  });

  it("is idempotent as a toggle: applying twice returns the original", () => {
    const once = prefixBlock({ value: "Rubrik", start: 0, end: 6 }, "## ");
    expect(once.value).toBe("## Rubrik");
    const twice = prefixBlock(
      { value: once.value, start: once.start, end: once.end },
      "## ",
    );
    expect(twice.value).toBe("Rubrik");
  });

  it("applies per line across a multi-line selection", () => {
    const value = "ett\ntva\ntre";
    const r = prefixBlock({ value, start: 0, end: value.length }, "> ");
    expect(r.value).toBe("> ett\n> tva\n> tre");
    // toggle off again
    const off = prefixBlock({ value: r.value, start: r.start, end: r.end }, "> ");
    expect(off.value).toBe("ett\ntva\ntre");
  });

  it("removes the prefix only when every selected line has it", () => {
    // mixed: one line prefixed, one not → adding wins (prefix the bare line)
    const value = "## ett\ntva";
    const r = prefixBlock({ value, start: 0, end: value.length }, "## ");
    expect(r.value).toBe("## ett\n## tva");
  });
});

describe("insertLink", () => {
  it("uses an explicit text label and selects the label", () => {
    const r = insertLink({ value: "see ", start: 4, end: 4 }, "https://x.se", "här");
    expect(r.value).toBe("see [här](https://x.se)");
    expect(r.value.slice(r.start, r.end)).toBe("här");
  });

  it("uses the current selection as the label when no text is given", () => {
    // "click me", select "me" (6..8)
    const r = insertLink({ value: "click me", start: 6, end: 8 }, "https://x.se");
    expect(r.value).toBe("click [me](https://x.se)");
    expect(r.value.slice(r.start, r.end)).toBe("me");
  });

  it('falls back to "länk" when there is no text and no selection', () => {
    const r = insertLink({ value: "", start: 0, end: 0 }, "https://x.se");
    expect(r.value).toBe("[länk](https://x.se)");
    expect(r.value.slice(r.start, r.end)).toBe("länk");
  });
});

describe("insertImage", () => {
  it("produces ![alt](key) at the caret with caret after the insert", () => {
    const r = insertImage({ value: "before after", start: 7, end: 7 }, "blog/x.jpg", "En bild");
    expect(r.value).toBe("before ![En bild](blog/x.jpg)after");
    // caret collapsed right after the inserted markdown
    expect(r.start).toBe(r.end);
    expect(r.value.slice(0, r.start)).toBe("before ![En bild](blog/x.jpg)");
  });

  it("uses the raw key/url verbatim", () => {
    const r = insertImage({ value: "", start: 0, end: 0 }, "https://cdn/media/abc.webp", "alt");
    expect(r.value).toBe("![alt](https://cdn/media/abc.webp)");
  });
});

describe("toggleList", () => {
  it("adds unordered markers per line and toggles them off", () => {
    const value = "a\nb\nc";
    const on = toggleList({ value, start: 0, end: value.length }, false);
    expect(on.value).toBe("- a\n- b\n- c");
    const off = toggleList({ value: on.value, start: on.start, end: on.end }, false);
    expect(off.value).toBe("a\nb\nc");
  });

  it("adds ordered markers and renumbers", () => {
    const value = "first\nsecond\nthird";
    const on = toggleList({ value, start: 0, end: value.length }, true);
    expect(on.value).toBe("1. first\n2. second\n3. third");
    const off = toggleList({ value: on.value, start: on.start, end: on.end }, true);
    expect(off.value).toBe("first\nsecond\nthird");
  });

  it("converts between list types cleanly", () => {
    const unordered = "- a\n- b";
    const ordered = toggleList(
      { value: unordered, start: 0, end: unordered.length },
      true,
    );
    expect(ordered.value).toBe("1. a\n2. b");
  });
});

describe("nextSlug", () => {
  it("auto-derives from the title when slug is not manual", () => {
    expect(nextSlug(draft({ title: "Nya Frisyrer 2026", slugManual: false }))).toBe(
      "nya-frisyrer-2026",
    );
  });

  it("uses the manual slug verbatim when slugManual is true", () => {
    expect(
      nextSlug(draft({ title: "Whatever", slug: "min-egen-slug", slugManual: true })),
    ).toBe("min-egen-slug");
  });
});

describe("validateDraft", () => {
  it("requires a non-empty title", () => {
    const errs = validateDraft(draft({ title: "   " }));
    expect(errs).toContainEqual({ field: "title", code: "title_required" });
  });

  it("flags an invalid locale", () => {
    const errs = validateDraft(draft({ locale: "de" as unknown as "sv" }));
    expect(errs).toContainEqual({ field: "locale", code: "invalid_locale" });
  });

  it("publishing requires non-empty body AND excerpt", () => {
    const errs = validateDraft(
      draft({ status: "published", body: "", excerpt: "" }),
    );
    expect(errs).toContainEqual({ field: "body", code: "body_required" });
    expect(errs).toContainEqual({ field: "excerpt", code: "excerpt_required" });
  });

  it("passes when published with everything filled", () => {
    const errs = validateDraft(
      draft({ status: "published", body: "Text", excerpt: "Utdrag" }),
    );
    expect(errs).toEqual([]);
  });

  it("does not require body/excerpt for a draft", () => {
    const errs = validateDraft(draft({ status: "draft", body: "", excerpt: "" }));
    expect(errs).toEqual([]);
  });
});

describe("counter thresholds", () => {
  const ideal: [number, number] = [30, 60];
  const hard = 70;

  it("empty at length 0", () => {
    expect(counter("", ideal, hard).state).toBe("empty");
  });
  it("warn just above 0 but below ideal[0]", () => {
    expect(counter("a".repeat(29), ideal, hard).state).toBe("warn");
  });
  it("ok at the lower ideal boundary", () => {
    expect(counter("a".repeat(30), ideal, hard).state).toBe("ok");
  });
  it("ok at the upper ideal boundary", () => {
    expect(counter("a".repeat(60), ideal, hard).state).toBe("ok");
  });
  it("warn above ideal but at/below hard", () => {
    expect(counter("a".repeat(61), ideal, hard).state).toBe("warn");
    expect(counter("a".repeat(70), ideal, hard).state).toBe("warn");
  });
  it("over above hard", () => {
    expect(counter("a".repeat(71), ideal, hard).state).toBe("over");
  });
  it("reports the length", () => {
    expect(counter("abc", ideal, hard).len).toBe(3);
  });
});

describe("isDirty", () => {
  it("is false when current equals saved", () => {
    const d = draft();
    expect(isDirty(d, { ...d })).toBe(false);
  });
  it("is true when any meaningful field changes", () => {
    const saved = draft();
    expect(isDirty(draft({ title: "Changed" }), saved)).toBe(true);
    expect(isDirty(draft({ body: "new body" }), saved)).toBe(true);
    expect(isDirty(draft({ status: "published" }), saved)).toBe(true);
    expect(isDirty(draft({ coverImage: "blog/x.jpg" }), saved)).toBe(true);
  });
});

describe("toApiBody", () => {
  it("always includes an explicit slug (auto-derived)", () => {
    const body = toApiBody(draft({ title: "Min Titel", slugManual: false }));
    expect(body.slug).toBe("min-titel");
  });

  it("uses the manual slug when slugManual is set", () => {
    const body = toApiBody(
      draft({ slug: "manuell-slug", slugManual: true, title: "Annat" }),
    );
    expect(body.slug).toBe("manuell-slug");
  });

  it("omits id on create and includes it on edit", () => {
    expect(toApiBody(draft()).id).toBeUndefined();
    expect(toApiBody(draft({ id: 42 })).id).toBe(42);
  });

  it("passes through the content fields", () => {
    const body = toApiBody(
      draft({
        title: "T",
        locale: "en",
        body: "B",
        excerpt: "E",
        coverImage: "blog/c.jpg",
        author: "A",
        status: "published",
        seoTitle: "ST",
        seoDesc: "SD",
      }),
    );
    expect(body).toMatchObject({
      title: "T",
      locale: "en",
      body: "B",
      excerpt: "E",
      coverImage: "blog/c.jpg",
      author: "A",
      status: "published",
      seoTitle: "ST",
      seoDesc: "SD",
    });
  });
});
