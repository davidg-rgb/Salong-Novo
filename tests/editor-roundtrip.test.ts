// @vitest-environment happy-dom
/**
 * The parser-mismatch pin (2026-10-10). The in-place editor parses Markdown with
 * `marked` (via @tiptap/markdown) and serialises it back; the public site renders
 * with markdown-it (`renderMarkdown`, html:false). If the two ever disagree on a
 * construct the toolbar produces, a post would change on the site just by being
 * opened and saved. These tests drive the exact extension set the admin ships
 * (`richExtensions`) through load → getMarkdown and compare the RENDERED HTML.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { richExtensions } from "../src/admin/rich-editor";
import { renderMarkdown } from "../src/lib/markdown";

const FIXTURE = [
  "## Rubrik på sidan",
  "",
  "### En underrubrik",
  "",
  "Ett stycke med **fet text**, *kursiv text* och en [länk](https://example.com).",
  "",
  "![Salongen i Vasastan](/api/media/abc.webp)",
  "",
  "- första punkten",
  "- andra punkten",
  "",
  "1. steg ett",
  "2. steg två",
  "",
  "> Ett citat från en kund.",
  "",
  "Pris #1 kostar 2 * 3 kronor, och 4*5 är tjugo.",
].join("\n");

const editors: Editor[] = [];
function load(markdown: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({ element, extensions: richExtensions(), content: markdown, contentType: "markdown" });
  editors.push(editor);
  return editor;
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
  document.body.innerHTML = "";
});

describe("Markdown round-trip through the in-place editor", () => {
  it("(a) renders the same public HTML after load → getMarkdown", () => {
    const out = load(FIXTURE).getMarkdown();
    expect(renderMarkdown(out)).toBe(renderMarkdown(FIXTURE));
  });

  it("(b) is idempotent: a second round-trip is byte-identical to the first", () => {
    const first = load(FIXTURE).getMarkdown();
    const second = load(first).getMarkdown();
    expect(second).toBe(first);
  });

  it("(c) writes ATX headings and `-` bullets", () => {
    const out = load(FIXTURE).getMarkdown();
    expect(out).toMatch(/^## Rubrik på sidan$/m);
    expect(out).toMatch(/^### En underrubrik$/m);
    expect(out).toMatch(/^- första punkten$/m);
    expect(out).toMatch(/^1\. steg ett$/m);
    expect(out).not.toMatch(/^\* /m);
  });

  it("(d) keeps literal # and * as text (escaping preserved)", () => {
    const para = "Pris #1 kostar 2 * 3 kronor, och 4*5 är tjugo.";
    const html = renderMarkdown(load(para).getMarkdown());
    expect(html).toBe(renderMarkdown(para));
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("<h1>");
  });

  it("keeps the image src exactly as inserted (the public URL the picker returns)", () => {
    const out = load("![Alt](/api/media/abc.webp)").getMarkdown();
    expect(out.trim()).toBe("![Alt](/api/media/abc.webp)");
  });

  it("empty body: loads and serialises to an empty string", () => {
    const editor = load("");
    expect(editor.getMarkdown().trim()).toBe("");
    expect(editor.isEmpty).toBe(true);
  });

  it("malformed Markdown never throws and still renders the same on the site", () => {
    const broken = "**unclosed bold and [half link](\n\n- \n\n####### seven hashes";
    const out = load(broken).getMarkdown();
    expect(typeof out).toBe("string");
    expect(renderMarkdown(out)).toBe(renderMarkdown(broken));
  });

  it("known, accepted loss: an EMPTY quote (`> ` alone) is dropped; it renders nothing visible", () => {
    // markdown-it emits `<blockquote></blockquote>` (zero height); the editor has
    // no empty-quote node, so it disappears on save. Pinned so a change is seen.
    const out = load("Text\n\n> \n\nMer").getMarkdown();
    expect(renderMarkdown(out)).toBe(renderMarkdown("Text\n\nMer"));
  });
});
