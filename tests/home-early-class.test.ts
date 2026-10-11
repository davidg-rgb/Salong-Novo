import { describe, it, expect, beforeAll } from "vitest";
import { experimental_AstroContainer } from "astro/container";
import Home from "~/pages/index.astro";
import HomeEn from "~/pages/en/index.astro";
import Staff from "~/pages/personal.astro";

/**
 * html.nr-home before first paint (2026-10-11). Set by refresh.ts at boot, it moved
 * the hero up 74px after the first paint (the header goes sticky → fixed): desktop
 * CLS 0.056. Base.astro now marks the home page with `data-nr-home` and the head
 * script adds the class from that, independent of reduced motion — and never adds
 * `nr`, which is boot()'s idempotency guard.
 */
const locals = { db: null, getCms: async () => ({ kv: null, source: "fallback" as const }) };
let container: experimental_AstroContainer;
beforeAll(async () => {
  container = await experimental_AstroContainer.create();
});

const render = (page: unknown, path: string) =>
  container.renderToString(page as never, { locals: locals as never, request: new Request(`https://salongnovo.se${path}`) });
const htmlTag = (html: string) => html.match(/<html[^>]*>/)![0];
const headScript = (html: string) => {
  const head = html.slice(0, html.indexOf("</head>"));
  const scripts = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).filter((s) => s.includes("classList"));
  expect(scripts).toHaveLength(1);
  return scripts[0]!;
};

/** Run the head script against a minimal <html> stand-in. */
function runHead(script: string, opts: { homeAttr: boolean; reduce: boolean }): string[] {
  const classes = new Set<string>();
  const root = {
    hasAttribute: (name: string) => name === "data-nr-home" && opts.homeAttr,
    classList: { add: (c: string) => classes.add(c) },
  };
  const matchMedia = (q: string) => ({ matches: q === "(prefers-reduced-motion: reduce)" && opts.reduce });
  new Function("document", "matchMedia", script)({ documentElement: root }, matchMedia);
  return [...classes].sort();
}

describe("data-nr-home on <html>", () => {
  it("is rendered on / and /en", async () => {
    for (const [page, path] of [[Home, "/"], [HomeEn, "/en"]] as const) {
      expect(htmlTag(await render(page, path))).toMatch(/\sdata-nr-home(="")?[\s>]/);
    }
  });

  it("is NOT rendered on an inner page (/personal)", async () => {
    expect(htmlTag(await render(Staff, "/personal"))).not.toContain("data-nr-home");
  });
});

describe("the head script", () => {
  it("adds nr-home only when the attribute is present, regardless of reduced motion", async () => {
    const script = headScript(await render(Home, "/"));
    expect(runHead(script, { homeAttr: true, reduce: false })).toEqual(["nr-home", "nr-motion"]);
    expect(runHead(script, { homeAttr: true, reduce: true })).toEqual(["nr-home"]);
    expect(runHead(script, { homeAttr: false, reduce: false })).toEqual(["nr-motion"]);
    expect(runHead(script, { homeAttr: false, reduce: true })).toEqual([]);
  });

  it("never adds nr (boot()'s guard) in any combination", async () => {
    const script = headScript(await render(Home, "/"));
    for (const homeAttr of [true, false]) {
      for (const reduce of [true, false]) expect(runHead(script, { homeAttr, reduce })).not.toContain("nr");
    }
  });
});
