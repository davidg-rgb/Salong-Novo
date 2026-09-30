import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { experimental_AstroContainer } from "astro/container";
import { getProducts, getProductsSyncedAt } from "~/lib/content";
import { keuneGenericLink } from "~/lib/keune";
import ProductGrid from "~/components/ProductGrid.astro";
import StaffGrid from "~/components/StaffGrid.astro";
import BrandGrid from "~/components/BrandGrid.astro";
import ButikPage from "~/pages/butik.astro";
import ShopPage from "~/pages/en/shop.astro";

/**
 * The Keune surfaces as RENDERED HTML (Astro's Container API), so the
 * component-level branches are driven for real rather than grepped for:
 * a blank image, an unreadable price, a missing `_synced`, unknown and
 * duplicate picks, and the sponsored rel on kickback links only.
 *
 * `resolveCollection` is mocked per collection: a fixture list when a test sets
 * one, the real resolver (bindings-less ⇒ JSON defaults) otherwise. The vitest
 * config wraps Astro's Vite config (`getViteConfig`, `configFile: false`) so
 * `.astro` files compile here — see vitest.config.ts.
 */
const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[] | undefined>,
  calls: [] as string[],
}));

vi.mock("~/lib/collections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/collections")>();
  return {
    ...actual,
    resolveCollection: vi.fn(async (db: Parameters<typeof actual.resolveCollection>[0], def: Parameters<typeof actual.resolveCollection>[1]) => {
      state.calls.push(def.name);
      const rows = state.rows[def.name];
      return rows ? { items: rows, source: "d1" as const } : actual.resolveCollection(db, def);
    }),
  };
});

vi.mock("~/lib/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/content")>();
  return { ...actual, getProductsSyncedAt: vi.fn(actual.getProductsSyncedAt) };
});

const locals = { db: null, getCms: async () => ({ kv: null, source: "fallback" as const }) };
let container: experimental_AstroContainer;

beforeAll(async () => {
  container = await experimental_AstroContainer.create();
});

beforeEach(() => {
  state.rows = {};
  state.calls = [];
  vi.mocked(getProductsSyncedAt).mockClear();
});

const render = (component: unknown, locale: "sv" | "en" = "sv") =>
  container.renderToString(component as never, { props: { locale }, locals: locals as never });

// ── Tiny HTML readers: enough for attribute assertions, no DOM dependency.
const decode = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
function attrs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of source.matchAll(/([^\s=/]+)(?:="([^"]*)")?/g)) out[match[1]!] = decode(match[2] ?? "");
  return out;
}
const anchors = (html: string) => [...html.matchAll(/<a\s([^>]*)>/g)].map((m) => attrs(m[1]!));
const images = (html: string) => [...html.matchAll(/<img\s([^>]*)>/g)].map((m) => attrs(m[1]!));
const buttons = (html: string) => [...html.matchAll(/<button\s([^>]*)>/g)].map((m) => attrs(m[1]!));
/** One chunk of markup per product card, in render order. */
const cards = (html: string) => html.split(/<li class="product"/).slice(1);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Every rule a salon-attributed link must satisfy, on one href. */
function expectKickbackInvariants(href: string, campaign: RegExp) {
  expect(href.startsWith("https://www.keune.com/salon/6451330/?"), href).toBe(true);
  const url = new URL(href);
  expect([...url.searchParams.keys()].at(-1), href).toBe("source");
  expect(url.searchParams.get("source"), href).toBe("novo");
  expect(url.searchParams.get("utm_source")).toBe("salongnovo.se");
  expect(url.searchParams.get("utm_medium")).toBe("referral");
  expect(url.searchParams.get("utm_campaign"), href).toMatch(campaign);
  const decoded = decodeURIComponent(href);
  expect(decoded, decoded).not.toMatch(/fromKickbackFeeCode/i);
  expect(decoded.split("?").length - 1, decoded).toBe(1);
}

const product = (over: Record<string, unknown>) => ({
  slug: "fx",
  line: "care",
  title: "Fixture",
  price: "299.00",
  image: "",
  blurb_sv: "Fixturtext",
  blurb_en: "Fixture text",
  ...over,
});

describe("ProductGrid — rendered", () => {
  it("the shipped wall: 24 cards + the full-range button = 25 anchors, every one a valid sponsored salon link", async () => {
    const html = await render(ProductGrid);
    const links = anchors(html);
    expect(links).toHaveLength(25);
    for (const link of links) {
      expect(link.rel, link.href).toBe("noopener sponsored");
      expect(link.target, link.href).toBe("_blank");
      expectKickbackInvariants(link.href!, /^butik-(care|style|1922|so-pure|all)$/);
    }
    // Each card's CTA deep-links to that card's product, tagged with its line.
    const expected = getProducts();
    const ctas = links.slice(0, 24);
    ctas.forEach((link, index) => {
      const url = new URL(link.href!);
      expect(url.searchParams.get("pageSlug")).toBe(`/p/${expected[index]!.slug}/`);
      expect(url.searchParams.get("utm_campaign")).toBe(`butik-${expected[index]!.line}`);
    });
    // The last anchor is the generic, product-less link.
    expect(links[24]!.href).toBe(keuneGenericLink("butik-all"));
    expect(cards(html)).toHaveLength(24);
    expect(images(html)).toHaveLength(24);
    expect([...html.matchAll(/<h2 class="line-heading"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual([
      "Vård",
      "Styling",
      "1922 — för män",
      "So Pure",
    ]);
    expect(text(html)).toContain("Pris hos keune.com · 2026-09-29");
    expect(html).not.toContain("NaN");
  });

  it("renders the English locale's strings", async () => {
    const html = await render(ProductGrid, "en");
    expect(html.match(/Shop at Keune/g)).toHaveLength(24);
    expect(text(html)).toContain("See the full range at Keune");
    expect(text(html)).toContain("Price at keune.com · 2026-09-29");
    expect(text(html)).toContain(getProducts()[0]!.blurb_en);
    expect(text(html)).not.toContain(getProducts()[0]!.blurb_sv);
  });

  it("(a) a blank image renders the typeset frame — and no <img> — for that card only", async () => {
    state.rows.products = [
      product({ slug: "fx-imaged", title: "Fixture Imaged", image: "/images/keune/style-air-flow.webp" }),
      product({ slug: "fx-blank", title: "Fixture Blank", image: "" }),
    ];
    const html = await render(ProductGrid);
    const [imaged, blank] = cards(html);
    expect(images(imaged!)).toEqual([expect.objectContaining({ src: "/images/keune/style-air-flow.webp", alt: "" })]);
    expect(imaged).not.toContain("shot--type");
    expect(images(blank!)).toEqual([]);
    expect(blank).toMatch(/class="shot shot--type"[^>]*aria-hidden="true"[^>]*>\s*<span[^>]*>Fixture Blank<\/span>/);
  });

  it("(b) an empty price and an empty blurb are omitted; an unreadable price never prints NaN kr", async () => {
    state.rows.products = [
      product({ slug: "fx-empty", title: "Fixture Empty", price: "", blurb_sv: "", blurb_en: "" }),
      product({ slug: "fx-junk", title: "Fixture Junk", price: "abc" }),
      product({ slug: "fx-number", title: "Fixture Number", price: 349 }),
      product({ slug: "fx-ok", title: "Fixture Ok", price: "1299.50" }),
    ];
    const html = await render(ProductGrid);
    const [empty, junk, number, ok] = cards(html);
    expect(empty).not.toContain('class="price"');
    expect(empty).not.toContain('class="desc"');
    expect(junk).not.toContain('class="price"');
    expect(junk).toContain('class="desc"');
    expect(text(number!)).toContain("349 kr");
    expect(text(ok!)).toContain("1 299,50 kr");
    expect(html).not.toMatch(/NaN|undefined|null kr/);
    // A CTA still renders on every card, pointing at its own product.
    for (const [card, slug] of [[empty, "fx-empty"], [junk, "fx-junk"]] as const) {
      const [cta] = anchors(card!);
      expect(new URL(cta!.href!).searchParams.get("pageSlug")).toBe(`/p/${slug}/`);
    }
  });

  it("(c) a missing _synced date omits the price note entirely", async () => {
    vi.mocked(getProductsSyncedAt).mockReturnValueOnce("");
    const html = await render(ProductGrid);
    expect(vi.mocked(getProductsSyncedAt)).toHaveBeenCalledTimes(1);
    expect(html).not.toContain('class="synced"');
    expect(text(html)).not.toContain("Pris hos keune.com");
    // The full-range button does not depend on the date.
    expect(anchors(html).at(-1)!.href).toBe(keuneGenericLink("butik-all"));
  });

  it("an unknown line is not rendered, an empty line prints no heading, and a blank slug links generically", async () => {
    state.rows.products = [
      product({ slug: "fx-color", title: "Fixture Colour Line", line: "color" }),
      product({ slug: "", title: "Fixture No Slug", line: "style" }),
    ];
    const html = await render(ProductGrid);
    expect(html).not.toContain("Fixture Colour Line");
    expect([...html.matchAll(/<h2 class="line-heading"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(["Styling"]);
    const [cta] = anchors(cards(html)[0]!);
    expect(new URL(cta!.href!).searchParams.get("pageSlug")).toBeNull();
    expectKickbackInvariants(cta!.href!, /^butik-style$/);
  });

  it("an empty list renders no cards and no headings, and still offers the full range", async () => {
    state.rows.products = [];
    const html = await render(ProductGrid);
    expect(cards(html)).toHaveLength(0);
    expect(html).not.toContain("line-heading");
    expect(anchors(html)).toHaveLength(1);
  });
});

describe("StaffGrid — stylist picks, rendered", () => {
  const stylist = (over: Record<string, unknown>) => ({
    name: "Test Stylist",
    slug: "test-stylist",
    role: "Frisör",
    specialty: "",
    instagram: "",
    awards: [],
    bio_sv: "Bio",
    bio_en: "Bio",
    picks: [],
    ...over,
  });

  it("2 known + 1 unknown pick ⇒ data-picks carries exactly the 2 resolved salon links", async () => {
    state.rows.staff = [
      stylist({ name: "Chriss Berner", slug: "chriss-berner", picks: ["style-air-flow", "no-such-product", "style-sea-foam"] }),
      stylist({ name: "Anna Test", slug: "anna-test", picks: [] }),
    ];
    const html = await render(StaffGrid);
    const [chriss, anna] = buttons(html).filter((b) => (b.class ?? "").includes("staff-card"));
    const picks = JSON.parse(chriss!["data-picks"]!) as { title: string; href: string }[];
    expect(picks.map((p) => p.title)).toEqual(["Air Flow", "Sea Foam"]);
    for (const pick of picks) expectKickbackInvariants(pick.href, /^personal-chriss-berner$/);
    expect(picks.map((p) => new URL(p.href).searchParams.get("pageSlug"))).toEqual([
      "/p/style-air-flow/",
      "/p/style-sea-foam/",
    ]);
    expect(chriss!["data-picks-heading"]).toBe("Chriss favoriter");
    // Empty picks ⇒ no attribute at all, so the modal stays exactly as it was.
    expect(anna).not.toHaveProperty("data-picks");
    expect(anna).not.toHaveProperty("data-picks-heading");
    // The links the modal builds from that JSON open sponsored, in a new tab.
    expect(html).toContain('link.rel = "noopener sponsored"');
    expect(html).toContain('link.target = "_blank"');
    // The picks block ships hidden; the script reveals it only for a non-empty list.
    expect(html).toMatch(/<div class="sm-picks" id="sm-picks" hidden/);
  });

  it("the English card uses the English genitive", async () => {
    state.rows.staff = [stylist({ name: "Jannie Olofsson", slug: "jannie-olofsson", picks: ["style-claytime"] })];
    const html = await render(StaffGrid, "en");
    const [card] = buttons(html).filter((b) => (b.class ?? "").includes("staff-card"));
    expect(card!["data-picks-heading"]).toBe("Jannie's picks");
  });

  it("when nobody has picked anything, no card carries data-picks and the product list is never read", async () => {
    // The shipped roster: 17 stylists, every picks list empty.
    const html = await render(StaffGrid);
    const cardsWithPicks = buttons(html).filter((b) => "data-picks" in b);
    expect(buttons(html).filter((b) => (b.class ?? "").includes("staff-card"))).toHaveLength(17);
    expect(cardsWithPicks).toEqual([]);
    expect(state.calls).toEqual(["staff"]);
  });

  it("the product list IS read once somebody has a pick", async () => {
    state.rows.staff = [stylist({ picks: ["style-air-flow"] })];
    await render(StaffGrid);
    expect(state.calls).toEqual(["staff", "products"]);
  });
});

describe("BrandGrid — sponsored rel on kickback links only, rendered", () => {
  it("the shipped Keune card is sponsored; every other brand link stays plain", async () => {
    const html = await render(BrandGrid);
    const links = anchors(html);
    expect(links.map((l) => [l.href, l.rel])).toEqual([
      [keuneGenericLink("varumarken"), "noopener sponsored"],
      ["https://www.ghdhair.com", "noopener"],
      ["https://dc-hair.com", "noopener"],
      ["https://richyhair.se", "noopener"],
    ]);
  });

  it("a plain keune.com link is not a kickback link, and a blank url renders no anchor", async () => {
    state.rows.brands = [
      { slug: "a", name: "Plain Keune", desc_sv: "x", desc_en: "x", url: "https://www.keune.com/se/", logo: "", product: "" },
      { slug: "b", name: "Salon Keune", desc_sv: "x", desc_en: "x", url: "https://www.keune.com/salon/6451330/", logo: "", product: "" },
      { slug: "c", name: "No Link", desc_sv: "x", desc_en: "x", url: "", logo: "", product: "" },
    ];
    const html = await render(BrandGrid);
    expect(anchors(html).map((l) => l.rel)).toEqual(["noopener", "noopener sponsored"]);
    expect(html).toContain("No Link");
  });
});

describe("the shop pages, rendered", () => {
  const renderPage = (page: unknown, path: string) =>
    container.renderToString(page as never, {
      locals: locals as never,
      request: new Request(`https://salongnovo.se${path}`),
    });

  for (const [page, path, kicker, heading, bookingLabel] of [
    [ButikPage, "/butik", "N° 11 — Butik", "Keune — att ta med hem.", "Boka tid"],
    [ShopPage, "/en/shop", "N° 11 — Shop", "Keune — to take home.", "Book now"],
  ] as const) {
    it(`${path}: N° 11 kicker, the shop heading, both paragraphs, the grid — and no booking CTA in the article`, async () => {
      const html = await renderPage(page, path);
      const article = html.slice(html.indexOf('<section class="article'), html.indexOf("</section>", html.indexOf('<section class="article')));
      expect(text(article)).toContain(kicker);
      expect([...article.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1])).toEqual([heading]);
      expect(article.match(/<p[^>]*>/g)!.length).toBeGreaterThanOrEqual(2);
      expect(cards(article)).toHaveLength(24);
      // booking={false}: the only booking buttons are the header's, never the article's.
      expect(text(article)).not.toContain(bookingLabel);
      // The nav marks this page as current.
      const current = anchors(html).filter((a) => a["aria-current"] === "page");
      expect(current.map((a) => a.href)).toContain(path);
    });
  }
});
