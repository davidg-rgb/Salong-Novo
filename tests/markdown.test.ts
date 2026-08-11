import { describe, it, expect } from "vitest";
import { renderMarkdown, excerpt, readingTimeMinutes } from "../src/lib/markdown";

describe("renderMarkdown — security", () => {
  it("never emits author-supplied raw HTML / scripts", () => {
    const out = renderMarkdown("Hej <script>alert('xss')</script> där");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
  it("escapes inline event-handler HTML into inert text (no live tag)", () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)">');
    // No live <img> element and no executable handler attribute survives...
    expect(out).not.toMatch(/<img[^>]*onerror/);
    // ...because the whole thing is escaped to harmless text.
    expect(out).toContain("&lt;img");
  });
  it("renders standard markdown", () => {
    expect(renderMarkdown("**fett**")).toContain("<strong>fett</strong>");
    expect(renderMarkdown("## Rubrik")).toContain("<h2>");
  });
  it("hardens external links with rel=noopener and target=_blank", () => {
    const out = renderMarkdown("[Voady](https://bokning.voady.se/novo)");
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });
});

describe("excerpt", () => {
  it("strips markdown and truncates on a word boundary", () => {
    const ex = excerpt("# Title\n\nDetta är **en** [länk](/x) i texten.", 20);
    expect(ex).not.toContain("#");
    expect(ex).not.toContain("**");
    expect(ex.length).toBeLessThanOrEqual(21);
  });
  it("returns full text when short", () => {
    expect(excerpt("Kort text")).toBe("Kort text");
  });
});

describe("readingTimeMinutes", () => {
  it("is at least one minute", () => {
    expect(readingTimeMinutes("ett ord")).toBe(1);
  });
  it("scales with word count", () => {
    const words = Array(400).fill("ord").join(" ");
    expect(readingTimeMinutes(words)).toBe(2);
  });
});
