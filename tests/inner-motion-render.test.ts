import { describe, it, expect, beforeAll } from "vitest";
import { experimental_AstroContainer } from "astro/container";
import Staff from "~/pages/personal.astro";
import Competitions from "~/pages/tavlingar.astro";
import Contact from "~/pages/kontakt.astro";
import Privacy from "~/pages/integritet.astro";
import Blog from "~/pages/blogg/index.astro";

/**
 * Inner-page motion (2026-10-11): refresh.ts adds the masthead and reveal classes in
 * the browser, so the HTML the server sends must already be the complete static page
 * — kicker, h1 and lead present as plain text, no word masks, no `nr-` state. That is
 * what a visitor without JS (or with reduced motion) reads. The head script that sets
 * html.nr-motion early must set ONLY that flag: html.nr is boot()'s idempotency guard,
 * and an early `nr` would stop boot() from ever running.
 */
const locals = { db: null, getCms: async () => ({ kv: null, source: "fallback" as const }) };
let container: experimental_AstroContainer;
beforeAll(async () => {
  container = await experimental_AstroContainer.create();
});

const renderPage = (page: unknown, path: string) =>
  container.renderToString(page as never, {
    locals: locals as never,
    request: new Request(`https://salongnovo.se${path}`),
  });

const mainOf = (html: string) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));

describe("inner pages, rendered: the static page is complete", () => {
  it.each([
    [Staff, "/personal", "intro"],
    [Competitions, "/tavlingar", "intro"],
    [Contact, "/kontakt", null],
    [Privacy, "/integritet", "prose"],
    [Blog, "/blogg", "intro"],
  ])("%s carries kicker, h1 and lead with no nr- classes", async (page, path, lead) => {
    const html = await renderPage(page, path);
    const main = mainOf(html);
    expect(main.length).toBeGreaterThan(0);
    expect(main).toMatch(/<p class="kicker"[^>]*>N° \d\d — [^<]+<\/p>/);
    // The h1 is one run of text, not word-mask spans.
    expect(main).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
    if (lead === "intro") expect(main).toMatch(/<p class="intro"[^>]*>[^<]+<\/p>/);
    if (lead === "prose") expect(main).toMatch(/<div class="prose"[^>]*>\s*<p[^>]*>[^<]+<\/p>/);
    // No motion state is rendered: every nr- class is the script's.
    expect(main).not.toMatch(/class="[^"]*\bnr-/);
    expect(main).not.toContain("--d:");
  });

  it("the head script sets html.nr-motion only, behind the reduced-motion test", async () => {
    const html = await renderPage(Staff, "/personal");
    const head = html.slice(0, html.indexOf("</head>"));
    const scripts = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    const early = scripts.filter((s) => s.includes("classList"));
    expect(early).toHaveLength(1);
    expect(early[0]).toContain('matchMedia("(prefers-reduced-motion: reduce)").matches');
    expect(early[0]).toContain('classList.add("nr-motion")');
    expect(early[0]).not.toMatch(/add\("nr"\)/);
    // Before any <link> — since the fonts went self-hosted (2026-10-11) the first one
    // is a font preload, and there is no third-party stylesheet left to anchor on —
    // so it runs ahead of first paint.
    const firstLink = head.indexOf("<link");
    expect(firstLink).toBeGreaterThan(-1);
    expect(head.indexOf("classList.add")).toBeLessThan(firstLink);
  });
});
