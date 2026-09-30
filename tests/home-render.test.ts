import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { experimental_AstroContainer } from "astro/container";
import { asStylist, isOwnerRow, getStaff } from "~/lib/content";
import { t, localizePath, type Locale } from "~/i18n";
import type { ContentKvRow, KvMap } from "~/lib/cms/content";
import Home from "~/components/Home.astro";
import SiteFooter from "~/components/SiteFooter.astro";

/**
 * The home refresh (2026-09-30) as RENDERED HTML. Everything the kit's script
 * used to inject — the scroll cue, the strip heading, the caption numbers, the
 * owner tag — is server-rendered now, so it is asserted here, in both locales,
 * without a browser. The motion itself is the Playwright suite's
 * (tests/e2e/home-refresh.spec.ts).
 *
 * `resolveCollection` is mocked the same way as in keune-render.test.ts: a
 * fixture roster when a test sets one, the real resolver (bindings-less ⇒ the
 * JSON defaults) otherwise.
 */
const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[] | undefined>,
}));

vi.mock("~/lib/collections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/collections")>();
  return {
    ...actual,
    resolveCollection: vi.fn(async (db: Parameters<typeof actual.resolveCollection>[0], def: Parameters<typeof actual.resolveCollection>[1]) => {
      const rows = state.rows[def.name];
      return rows ? { items: rows, source: "d1" as const } : actual.resolveCollection(db, def);
    }),
  };
});

let container: experimental_AstroContainer;
let kv: KvMap | null = null;

beforeAll(async () => {
  container = await experimental_AstroContainer.create();
});

beforeEach(() => {
  state.rows = {};
  kv = null;
});

const render = (component: unknown, locale: Locale = "sv") =>
  container.renderToString(component as never, {
    props: { locale },
    locals: { db: null, getCms: async () => ({ kv, source: kv ? "d1" : "fallback" }) } as never,
  });

// ── Tiny HTML readers (no DOM dependency), same idiom as keune-render.test.ts.
const decode = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const count = (html: string, re: RegExp) => [...html.matchAll(re)].length;
/** The markup between an element's opening tag (found by `open`) and the first `close` after it. */
function section(html: string, open: RegExp, close: string): string {
  const match = open.exec(html);
  if (!match) return "";
  const start = match.index;
  const end = html.indexOf(close, start);
  return html.slice(start, end === -1 ? undefined : end + close.length);
}
/** One chunk per team-grid card, in render order. */
const teamCards = (html: string) =>
  section(html, /<ul class="team-grid"/, "</ul>")
    .split(/<li(?=[\s>])/)
    .slice(1);

const row = (over: Record<string, unknown>) => ({
  slug: "fx",
  name: "Fixture Stylist",
  role: "Frisör",
  bio_sv: "Bio",
  bio_en: "Bio",
  ...over,
});
/** 17 stylists, none an owner by role or by flag. */
const noOwners = () => Array.from({ length: 17 }, (_, i) => row({ slug: `s${i}`, name: `Stylist ${i}` }));

describe("the refresh's new strings", () => {
  // `t()` echoes a missing key, so the render assertions below (which compare to
  // `t()`) would pass on a missing label. This pins that each one really exists.
  it.each(["sv", "en"] as const)("exist in the %s dictionary", (locale) => {
    for (const key of ["labels.scroll", "labels.coOwner", "cta.allAwards", "home.galleryHeading"]) {
      expect(t(locale, key), `${locale}:${key}`).not.toBe(key);
    }
    if (locale === "en") expect(t("en", "labels.coOwner")).not.toBe(t("sv", "labels.coOwner"));
  });
});

describe.each(["sv", "en"] as const)("Home — rendered (%s)", (locale) => {
  it("renders exactly one scroll cue, aria-hidden, labelled from i18n", async () => {
    const html = await render(Home, locale);
    expect(count(html, /class="scroll-cue"/g)).toBe(1);
    const cue = section(html, /<div class="scroll-cue"/, "</div>");
    expect(cue).toMatch(/aria-hidden="true"/);
    expect(text(cue)).toBe(t(locale, "labels.scroll"));
    // Inside the hero, not after it.
    expect(section(html, /<section class="hero"/, "</section>")).toContain('class="scroll-cue"');
  });

  it("renders exactly one strip head: kicker, heading, and a localized link to the awards page", async () => {
    const html = await render(Home, locale);
    expect(count(html, /class="strip-head"/g)).toBe(1);
    const head = section(html, /<div class="strip-head"/, "</div>");
    const h2 = section(head, /<h2/, "</h2>");
    expect(text(h2)).toContain(t(locale, "home.galleryHeading"));
    expect(text(section(h2, /<small/, "</small>"))).toBe(t(locale, "nav.competitions"));
    const hrefs = [...head.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([localizePath("competitions", locale)]);
    expect(text(section(head, /<a\s/, "</a>"))).toBe(t(locale, "cta.allAwards"));
    // It sits in the strip, before the track.
    const strip = section(html, /<section class="strip"/, "</section>");
    expect(strip.indexOf('class="strip-head"')).toBeLessThan(strip.indexOf('class="strip-track"'));
  });

  it("numbers the five captions 01–05 in order, and keeps them aria-hidden", async () => {
    const html = await render(Home, locale);
    const caps = [...html.matchAll(/<span class="cap"([^>]*)>/g)].map((m) => m[1]!);
    expect(caps.map((attrs) => /data-n="(\d+)"/.exec(attrs)?.[1])).toEqual(["01", "02", "03", "04", "05"]);
    for (const attrs of caps) expect(attrs).toMatch(/aria-hidden="true"/);
  });

  it("flags exactly the two owners, each with the i18n role tag, and no one else", async () => {
    const html = await render(Home, locale);
    const cards = teamCards(html);
    expect(cards).toHaveLength(17);
    const owners = cards.filter((card) => /^[^>]*\bdata-owner\b/.test(card));
    expect(owners).toHaveLength(2);
    for (const card of owners) {
      expect(card).toMatch(/^[^>]*class="owner\b/);
      expect(text(section(card, /<span class="role-tag"/, "</span>"))).toBe(t(locale, "labels.coOwner"));
      // The visible tag is in the accessible name too.
      expect(decode(/aria-label="([^"]*)"/.exec(card)?.[1] ?? "")).toMatch(new RegExp(`, ${t(locale, "labels.coOwner")}$`));
    }
    expect(count(html, /class="role-tag"/g)).toBe(2);
    expect(owners.map((card) => /aria-label="([^",]*)/.exec(card)?.[1])).toEqual(["Chriss Berner", "Jannie Olofsson"]);
  });
});

describe("Home — rosters the grid must survive", () => {
  it("a roster with no owners renders 17 plain cards: no data-owner, no role tag", async () => {
    state.rows.staff = noOwners();
    const html = await render(Home);
    const cards = teamCards(html);
    expect(cards).toHaveLength(17);
    expect(html).not.toMatch(/data-owner/);
    expect(html).not.toMatch(/class="role-tag"/);
  });

  it("an owner can come from the explicit flag alone", async () => {
    state.rows.staff = [row({ slug: "a", name: "Flag Owner", role: "Frisör", owner: true }), row({ slug: "b", name: "Plain" })];
    const cards = teamCards(await render(Home));
    expect(cards.map((card) => /^[^>]*\bdata-owner\b/.test(card))).toEqual([true, false]);
  });

  it("an owner can come from the role alone — a roster seeded before the flag existed", async () => {
    state.rows.staff = [row({ slug: "a", name: "Plain" }), row({ slug: "b", name: "Role Owner", role: "Delägare" })];
    const cards = teamCards(await render(Home));
    expect(cards.map((card) => /^[^>]*\bdata-owner\b/.test(card))).toEqual([false, true]);
  });

  it("three owners are three wide cards (the grid does not cap them)", async () => {
    state.rows.staff = [1, 2, 3].map((n) => row({ slug: `o${n}`, name: `Owner ${n}`, owner: true }));
    expect(count(await render(Home), /class="role-tag"/g)).toBe(3);
  });

  it("a malformed row (non-string role, no name) renders without throwing", async () => {
    state.rows.staff = [{ role: 42, owner: "true" }, row({ slug: "ok", name: "Fine" })];
    const cards = teamCards(await render(Home));
    expect(cards).toHaveLength(2);
    expect(cards.some((card) => /data-owner/.test(card))).toBe(false);
  });

  it("an empty roster still renders every section, with an empty grid", async () => {
    state.rows.staff = [];
    const html = await render(Home);
    for (const cls of ["hero", "strip", "story", "team"]) expect(html).toContain(`<section class="${cls}"`);
    expect(teamCards(html)).toHaveLength(0);
    expect(count(html, /class="scroll-cue"/g)).toBe(1);
  });
});

describe("Home — the strip heading is client copy", () => {
  const override = (value_sv: string, value_en: string): KvMap =>
    new Map<string, ContentKvRow>([
      ["copy.home.galleryHeading", { key: "copy.home.galleryHeading", value_sv, value_en, updated_at: "", updated_by: "" }],
    ]);

  it("a content_kv override replaces the default heading", async () => {
    kv = override("Årets Frisör 2027", "Hairdresser of the Year 2027");
    expect(text(section(await render(Home, "sv"), /<div class="strip-head"/, "</div>"))).toContain("Årets Frisör 2027");
    expect(text(section(await render(Home, "en"), /<div class="strip-head"/, "</div>"))).toContain("Hairdresser of the Year 2027");
  });

  it("a blank English side falls through to the English default, not the Swedish override", async () => {
    kv = override("Årets Frisör 2027", "");
    const head = text(section(await render(Home, "en"), /<div class="strip-head"/, "</div>"));
    expect(head).toContain("Hairdresser of the Year 2026");
    expect(head).not.toContain("2027");
  });

  it("with no kv at all the defaults render", async () => {
    kv = null;
    expect(text(section(await render(Home, "sv"), /<div class="strip-head"/, "</div>"))).toContain("Årets Frisör 2026");
  });
});

describe("SiteFooter — the booking band heading", () => {
  it.each(["sv", "en"] as const)("renders the heading text unchanged (%s): the italic last word is JS-side", async (locale) => {
    const html = await render(SiteFooter, locale);
    const head = section(html, /<h2 class="fc-head"/, "</h2>");
    expect(text(head)).toBe(t(locale, "closing.heading"));
    expect(head).not.toMatch(/nr-em|nr-w/);
  });
});

describe("isOwnerRow / asStylist — who counts as an owner", () => {
  it.each([
    ["Delägare", true],
    ["delägare", true],
    ["Delagare", true],
    ["Co-owner", true],
    ["co owner", true],
    ["Frisör", false],
    ["", false],
  ])("role %j ⇒ %s", (role, expected) => {
    expect(isOwnerRow({ role })).toBe(expected);
    expect(asStylist({ name: "X", role }).owner).toBe(expected);
  });

  it("a missing role is not an owner", () => {
    expect(isOwnerRow({})).toBe(false);
    expect(asStylist({}).owner).toBe(false);
  });

  it("a non-string role is not an owner, and does not throw", () => {
    expect(isOwnerRow({ role: 42 })).toBe(false);
    expect(isOwnerRow({ role: null })).toBe(false);
    expect(isOwnerRow({ role: ["Delägare"] })).toBe(false);
  });

  it("the explicit flag wins over a non-owner role", () => {
    expect(isOwnerRow({ role: "Frisör", owner: true })).toBe(true);
  });

  it("only a real boolean true counts: the string \"true\" is not an owner", () => {
    expect(isOwnerRow({ role: "Frisör", owner: "true" })).toBe(false);
    expect(isOwnerRow({ role: "Frisör", owner: 1 })).toBe(false);
    expect(isOwnerRow({ role: "Frisör", owner: false })).toBe(false);
  });

  it("the shipped roster has exactly the two co-owners, flagged in the JSON", () => {
    const owners = getStaff().filter((s) => s.owner);
    expect(owners.map((s) => s.slug)).toEqual(["chriss-berner", "jannie-olofsson"]);
  });
});
