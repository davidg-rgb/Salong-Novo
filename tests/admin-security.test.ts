import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/lib/markdown";
import { insertLink, insertImage } from "../src/lib/editor";
import { mediaMarkdown, escapeAltForMarkdown } from "../src/lib/media";

/**
 * Adversarial: the admin editor's own output paths (toolbar link/image insertion,
 * image-picker alt text) must never let a non-technical author smuggle executable
 * HTML onto the public page. The security boundary is `renderMarkdown` (markdown-it
 * `html:false`), which ESCAPES every author-supplied `<`, `>` and `"`. The
 * consequence — proven below against EDITOR-SHAPED input (the exact strings the
 * toolbar/picker produce) — is that a payload can only ever survive as inert,
 * escaped text inside an attribute value or text node; it can never become a live
 * tag or an event-handler attribute. See ARCHITECTURE §10.8 / §10.9.
 */

const caretAt = (value: string) => ({ value, start: value.length, end: value.length });

/**
 * Universal invariants that hold no matter what the author typed. These check for
 * a real BREAKOUT — a live dangerous tag or a live `javascript:` link — not for the
 * mere textual presence of a scary substring inside an escaped attribute value
 * (which is harmless and expected when the payload is neutralized).
 */
function expectNoLiveDanger(html: string) {
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<iframe/i);
  expect(html).not.toMatch(/<object/i);
  expect(html).not.toMatch(/<embed/i);
  // markdown-it's validateLink strips javascript:/vbscript: — no live scheme survives.
  expect(html).not.toMatch(/<a[^>]+href=["']?\s*(?:javascript|vbscript):/i);
  expect(html).not.toMatch(/<img[^>]+src=["']?\s*(?:javascript|vbscript):/i);
}

describe("admin security — editor output cannot smuggle executable HTML", () => {
  it("a javascript: link inserted via the toolbar does not render a live href", () => {
    const md = insertLink(caretAt("Klicka "), "javascript:alert(document.cookie)", "Klicka här").value;
    const html = renderMarkdown(md);
    expectNoLiveDanger(html);
    // The scheme is gone entirely (no href, or rendered as inert text).
    expect(html).not.toContain('href="javascript:');
  });

  it("an onerror breakout in alt text (image toolbar) is neutralized to escaped text", () => {
    const md = insertImage(caretAt(""), "blog/abc.jpg", '"><img src=x onerror=alert(1)>').value;
    const html = renderMarkdown(md);
    expectNoLiveDanger(html);
    // The payload survives ONLY as escaped text inside the alt value — never as a
    // second, live <img> element with a handler.
    expect(html).not.toContain('"><img'); // the literal breakout sequence
    expect(html).not.toContain("<img src=x onerror"); // a raw second tag
    expect(html).toContain("&lt;img"); // proof it was escaped, not rendered
  });

  it("alt text with ] / ( cannot break out of the markdown image syntax", () => {
    const hostile = "caption] (javascript:alert(1)) [x";
    const md = mediaMarkdown(hostile, "/api/media/blog/x.jpg");
    // The real link target is intact: the closing ]( binds to OUR url, and the
    // hostile bracket is backslash-escaped so it is not a syntax delimiter.
    expect(md).toContain("](/api/media/blog/x.jpg)");
    expect(md).toContain("\\]"); // the author's ] was escaped
    const html = renderMarkdown(md);
    expectNoLiveDanger(html);
    expect(html).toContain('src="/api/media/blog/x.jpg"');
  });

  it("escapeAltForMarkdown backslash-escapes the bracket breakers and flattens newlines", () => {
    const out = escapeAltForMarkdown("a]b[c\nd");
    // Every ] / [ is preceded by a backslash (inert), and newlines are collapsed.
    expect(out).not.toMatch(/(^|[^\\])[\]\[]/); // no UNescaped bracket
    expect(out).not.toMatch(/\r|\n/);
  });

  it("a raw <script> typed into the body is escaped to inert text", () => {
    const html = renderMarkdown("## Rubrik\n\nHej <script>alert(1)</script>");
    expectNoLiveDanger(html);
    expect(html).toContain("&lt;script&gt;");
  });

  it("a data: text/html URI in an image src does not produce a live document", () => {
    const md = insertImage(caretAt(""), "blog/ok.jpg", "ok").value.replace(
      "blog/ok.jpg",
      "data:text/html,<script>alert(1)</script>",
    );
    const html = renderMarkdown(md);
    expectNoLiveDanger(html);
  });
});
