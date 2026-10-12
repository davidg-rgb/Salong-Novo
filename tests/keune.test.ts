import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  KEUNE_SALON_NO,
  isKickbackLink,
  keuneGenericLink,
  keuneLink,
  keuneSlug,
} from "~/lib/keune";
import {
  MAX_PICKS,
  PRODUCT_LINES,
  asProduct,
  asStylist,
  getBrands,
  getProducts,
  getProductsSyncedAt,
  getStaff,
  groupProducts,
  possessiveFirstName,
  productBlurb,
  productPrice,
  stylistPicks,
  type Product,
} from "~/lib/content";
import { PRODUCTS, STAFF, CMS } from "~/cms.config";
import { validateCollectionItem } from "~/lib/cms/collections";
import { t } from "~/i18n";
import { localizePath } from "~/i18n/routes";
import { shop } from "~/lib/pagecopy";
import {
  applyPriceUpdates,
  checkRows,
  collectFeed,
  contentfulWebp,
  extractProductImage,
  feedPrice,
  formatReport,
  isSafeSlug,
  matchProduct,
  parseArgs,
  parseSitemapSlugs,
  productPageUrl,
  stripNumericSuffix,
  summarize,
  todayIso,
  webpSize,
} from "../scripts/keune-sync.lib.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const NBSP = String.fromCharCode(0xa0);

/** The decoded query of a built link, in order. */
const params = (href: string) => [...new URL(href).searchParams.entries()];
const pageSlug = (href: string) => new URL(href).searchParams.get("pageSlug");

/**
 * A minimal but valid WebP header (30 bytes) declaring `width`×`height` in one
 * of the three formats — what `webpSize` reads, and what the script's stubbed
 * Contentful answers with.
 */
function webpHeader(kind: "VP8X" | "VP8 " | "VP8L", width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  const le = (value: number, at: number, bytes: number) => {
    for (let i = 0; i < bytes; i++) b[at + i] = (value >>> (8 * i)) & 0xff;
  };
  b.set(latin("RIFF"), 0);
  le(22, 4, 4);
  b.set(latin("WEBP"), 8);
  b.set(latin(kind), 12);
  if (kind === "VP8X") {
    le(width - 1, 24, 3);
    le(height - 1, 27, 3);
  } else if (kind === "VP8 ") {
    b.set([0x9d, 0x01, 0x2a], 23);
    le(width, 26, 2);
    le(height, 28, 2);
  } else {
    b[20] = 0x2f;
    le((((height - 1) << 14) | (width - 1)) >>> 0, 21, 4);
  }
  return b;
}

/** One byte per character — for the four-letter RIFF/WebP tags. */
function latin(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

describe("keuneLink — the salon-attributed deep link", () => {
  it("is NOVO's salon route", () => {
    expect(KEUNE_SALON_NO).toBe("6451330");
    expect(keuneLink().startsWith("https://www.keune.com/salon/6451330/")).toBe(true);
  });

  it("with no slug: the bare salon route — no query string, not even a trailing '?'", () => {
    expect(keuneGenericLink()).toBe("https://www.keune.com/salon/6451330/");
    expect(keuneGenericLink()).not.toContain("?");
    expect(keuneLink()).toBe(keuneGenericLink());
    expect(keuneLink(undefined)).toBe(keuneGenericLink());
    expect(keuneLink("")).toBe(keuneGenericLink());
    expect(keuneLink("   ")).toBe(keuneGenericLink());
  });

  it("with a slug: pageSlug is /p/<slug>/ (the route adds /se itself) and the ONLY parameter", () => {
    const href = keuneLink("style-air-flow");
    expect(pageSlug(href)).toBe("/p/style-air-flow/");
    expect(params(href)).toEqual([["pageSlug", "/p/style-air-flow/"]]);
    expect(href).toBe("https://www.keune.com/salon/6451330/?pageSlug=%2Fp%2Fstyle-air-flow%2F");
  });

  it("strips a pasted /se/p/ prefix — /se/se/p/… is a 404", () => {
    expect(pageSlug(keuneLink("/se/p/style-air-flow/"))).toBe("/p/style-air-flow/");
    expect(pageSlug(keuneLink("se/p/style-air-flow"))).toBe("/p/style-air-flow/");
  });

  it("strips a /p/ prefix and a bare leading slash", () => {
    expect(pageSlug(keuneLink("/p/style-air-flow"))).toBe("/p/style-air-flow/");
    expect(pageSlug(keuneLink("/style-air-flow"))).toBe("/p/style-air-flow/");
  });

  it("normalises to exactly one trailing slash", () => {
    expect(pageSlug(keuneLink("style-air-flow"))).toBe("/p/style-air-flow/");
    expect(pageSlug(keuneLink("style-air-flow///"))).toBe("/p/style-air-flow/");
  });

  it("an empty, whitespace-only or prefix-only slug means no product: no pageSlug at all", () => {
    for (const slug of ["", "   ", "/se/p/", "/p/", "/"]) {
      expect(pageSlug(keuneLink(slug)), JSON.stringify(slug)).toBeNull();
      expect(keuneLink(slug)).toBe(keuneLink());
    }
    expect(keuneSlug(undefined)).toBe("");
    expect(keuneSlug(null)).toBe("");
  });

  it("trims whitespace around a slug", () => {
    expect(pageSlug(keuneLink("  style-air-flow \n"))).toBe("/p/style-air-flow/");
  });

  it("a pasted address-bar URL, query string or fragment reduces to the bare slug", () => {
    // What a person copies out of the browser: origin, /se/p/ path, Keune's own
    // ?fromKickbackFeeCode= modal trigger, a #fragment. None of it is the slug.
    for (const pasted of [
      "https://www.keune.com/se/p/style-air-flow/",
      "http://keune.com/se/p/style-air-flow",
      "/se/p/style-air-flow/?fromKickbackFeeCode=NOVO",
      "style-air-flow#x",
      "https://www.keune.com/se/p/style-air-flow/?utm_source=x#reviews",
    ]) {
      expect(pageSlug(keuneLink(pasted)), pasted).toBe("/p/style-air-flow/");
      expect(keuneSlug(pasted), pasted).toBe("style-air-flow");
    }
  });

  it("a pasted URL with no product path, or only a query, means no product", () => {
    for (const pasted of ["https://www.keune.com", "https://www.keune.com/", "?fromKickbackFeeCode=NOVO", "#top"]) {
      expect(pageSlug(keuneLink(pasted)), pasted).toBeNull();
    }
  });

  it("carries no UTMs and no `source` — removed 2026-10-12, never in the brief", () => {
    const hrefs = [keuneLink(), keuneLink("style-sea-foam"), keuneGenericLink(), ...getProducts().map((p) => keuneLink(p.slug))];
    for (const href of hrefs) {
      expect(href, href).not.toMatch(/utm_|[?&]source=/);
      expect(params(href).every(([key]) => key === "pageSlug"), href).toBe(true);
    }
  });

  it("never emits fromKickbackFeeCode and never a second '?' — checked on the DECODED href", () => {
    // Decoded, because an encoded `%3FfromKickbackFeeCode%3DNOVO` inside pageSlug
    // would pass a raw-string check and still reach Keune's redirect intact.
    const hrefs = [
      keuneLink(),
      keuneLink("/se/p/style-air-flow/?fromKickbackFeeCode=NOVO"),
      keuneLink("https://www.keune.com/se/p/style-air-flow/?fromKickbackFeeCode=NOVO#x"),
      keuneLink("style-air-flow#fromKickbackFeeCode=NOVO"),
      ...getProducts().map((p) => keuneLink(p.slug)),
    ];
    for (const href of hrefs) {
      const decoded = decodeURIComponent(href);
      expect(decoded, decoded).not.toMatch(/fromKickbackFeeCode/i);
      // The bare route has no '?', a product link exactly one — never two.
      expect(decoded.split("?").length - 1, decoded).toBe(pageSlug(href) === null ? 0 : 1);
      expect(decoded, decoded).not.toContain("#");
    }
  });

  it("recognises a salon-attributed link, and only that, as a kickback link", () => {
    expect(isKickbackLink(keuneGenericLink())).toBe(true);
    expect(isKickbackLink(keuneLink("style-air-flow"))).toBe(true);
    expect(isKickbackLink("https://www.keune.com/salon/novo/")).toBe(true);
    for (const href of ["https://www.keune.com", "https://www.keune.com/se/p/style-air-flow/", "https://www.ghdhair.com", "", null, undefined]) {
      expect(isKickbackLink(href), String(href)).toBe(false);
    }
  });

  it("the brand page's Keune link is the builder's output, pasted as a literal", () => {
    // brands.json carries the literal (it is a client-editable `url` field);
    // this pins it to the one builder so the two cannot drift.
    const keune = getBrands().find((brand) => brand.slug === "keune");
    expect(keune?.url).toBe(keuneGenericLink());
    expect(keune?.url).toBe("https://www.keune.com/salon/6451330/");
  });
});

describe("content/products.json — the curated wall", () => {
  const products = getProducts();

  it("carries the 24 curated products with unique, URL-safe slugs", () => {
    expect(products).toHaveLength(24);
    const slugs = products.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("every row is on one of the four lines the page renders", () => {
    for (const product of products) {
      expect(PRODUCT_LINES as readonly string[], product.slug).toContain(product.line);
    }
  });

  it("every price is Keune's two-decimal text and formats to a real label", () => {
    for (const product of products) {
      expect(product.price, product.slug).toMatch(/^\d+\.\d{2}$/);
      expect(productPrice(product.price), product.slug).toMatch(/kr$/);
    }
  });

  it("every row has a title and a blurb in both locales", () => {
    for (const product of products) {
      expect(product.title.trim(), product.slug).not.toBe("");
      expect(productBlurb(product, "sv").trim(), product.slug).not.toBe("");
      expect(productBlurb(product, "en").trim(), product.slug).not.toBe("");
    }
  });

  it("every image is a bundled /images/keune/<slug>.webp that EXISTS on disk", () => {
    for (const product of products) {
      expect(product.image, product.slug).toBe(`/images/keune/${product.slug}.webp`);
      expect(existsSync(join(PUBLIC_DIR, product.image!)), product.image).toBe(true);
    }
  });

  it("every image is a real WebP, square, at least 1000 px, and under 200 KB", () => {
    // The sanity bar for Keune's Contentful renders (keune-sync --images): the
    // Shopify feed's files these replaced were up to 1.5 MB, one with a fake
    // checkerboard baked in. A 16:9 banner picked by mistake fails "square".
    for (const product of products) {
      const file = join(PUBLIC_DIR, product.image!);
      expect(statSync(file).size, product.image).toBeLessThan(200_000);
      const size = webpSize(readFileSync(file));
      expect(size, `${product.image} is not a WebP`).not.toBeNull();
      const { width, height } = size!;
      expect(Math.max(width, height), product.image).toBeGreaterThanOrEqual(1000);
      expect(Math.abs(width - height), `${product.image} ${width}×${height}`).toBeLessThanOrEqual(Math.max(width, height) * 0.02);
    }
  });

  it("no retired feed PNG is left beside the WebPs", () => {
    expect(readdirSync(join(PUBLIC_DIR, "images", "keune")).filter((f) => !f.endsWith(".webp"))).toEqual([]);
  });

  it("_synced is an ISO date", () => {
    const synced = getProductsSyncedAt();
    expect(synced).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${synced}T00:00:00Z`).toISOString().slice(0, 10)).toBe(synced);
  });

  it("no discount, exclusivity or 'best' claim anywhere in the shop's copy", () => {
    // The three verified facts are the whole claim (same price, a share goes to
    // the salon, checkout at keune.com). Keune's own "exklusiv rabatt" hero is
    // its newsletter offer — repeating it here would be a claim NOVO cannot back.
    const copy = [
      ...products.flatMap((p) => [p.blurb_sv, p.blurb_en]),
      ...Object.values(shop).flatMap((field) => [field.sv, field.en]),
      t("sv", "cta.shopAtKeune"),
      t("en", "cta.shopAtKeune"),
      t("sv", "cta.shopAll"),
      t("en", "cta.shopAll"),
    ];
    const banned = /rabatt|exklusiv|discount|exclusive|billigast|cheapest|bästa|best\b/i;
    expect(copy.filter((line) => banned.test(line))).toEqual([]);
  });

  it("the disclosure says the three verified facts in both locales", () => {
    expect(shop.howItWorks.sv).toMatch(/går en del av köpet till salongen/);
    expect(shop.howItWorks.sv).toMatch(/samma pris/);
    expect(shop.howItWorks.sv).toMatch(/keune\.com/);
    expect(shop.howItWorks.en).toMatch(/part of your purchase goes to the salon/);
    expect(shop.howItWorks.en).toMatch(/same price/);
    expect(shop.howItWorks.en).toMatch(/keune\.com/);
  });
});

describe("products — loader, grouping and price", () => {
  it("reads a stored row back defensively", () => {
    expect(asProduct({})).toEqual({
      slug: "",
      line: "",
      title: "",
      price: "",
      image: undefined,
      blurb_sv: "",
      blurb_en: "",
    });
    const row = asProduct({ slug: " style-air-flow ", line: " Care ", title: 5, price: 299, image: "", blurb_sv: "Text" });
    expect(row.slug).toBe("style-air-flow");
    expect(row.line).toBe("care");
    expect(row.title).toBe("");
    expect(row.price).toBe("299.00");
    expect(row.image).toBeUndefined();
    expect(row.blurb_en).toBe("");
  });

  it("a non-finite numeric price is dropped, not stringified", () => {
    expect(asProduct({ price: Number.NaN }).price).toBe("");
    expect(asProduct({ price: Number.POSITIVE_INFINITY }).price).toBe("");
  });

  it("a default row reads back unchanged", () => {
    const [first] = PRODUCTS.jsonFallback() as Record<string, unknown>[];
    expect(asProduct(first!)).toEqual(getProducts()[0]);
  });

  it("formats Keune's price text as a Swedish label with non-breaking spaces", () => {
    expect(productPrice("299.00")).toBe(`299${NBSP}kr`);
    expect(productPrice("299")).toBe(`299${NBSP}kr`);
    expect(productPrice("299.50")).toBe(`299,50${NBSP}kr`);
    expect(productPrice("299.5")).toBe(`299,50${NBSP}kr`);
    expect(productPrice("299,00")).toBe(`299${NBSP}kr`);
    expect(productPrice(" 1299.00 ")).toBe(`1${NBSP}299${NBSP}kr`);
    expect(productPrice("0299.00")).toBe(`299${NBSP}kr`);
  });

  it("a price that is not a plain amount renders NOTHING — never 'NaN kr'", () => {
    for (const price of ["", "   ", "abc", "NaN", "-5.00", "12.345", "från 299", "299 kr", null, undefined]) {
      expect(productPrice(price), String(price)).toBe("");
    }
  });

  it("groups by line in the fixed order and leaves empty lines out", () => {
    const groups = groupProducts(getProducts());
    expect(groups.map((g) => [g.line, g.items.length])).toEqual([
      ["care", 12],
      ["style", 6],
      ["1922", 4],
      ["so-pure", 2],
    ]);
    const only = (line: string) => ({ ...getProducts()[0]!, line }) as Product;
    expect(groupProducts([only("so-pure"), only("care")]).map((g) => g.line)).toEqual(["care", "so-pure"]);
    expect(groupProducts([])).toEqual([]);
  });

  it("a row on an unknown line is not rendered — there is no heading to put it under", () => {
    const stray = { ...getProducts()[0]!, slug: "x", line: "color" } as Product;
    const groups = groupProducts([stray, getProducts()[0]!]);
    expect(groups.flatMap((g) => g.items.map((p) => p.slug))).not.toContain("x");
  });

  it("every line has a heading in both dictionaries", () => {
    for (const line of PRODUCT_LINES) {
      for (const locale of ["sv", "en"] as const) {
        expect(t(locale, `labels.line.${line}`), `${locale}:${line}`).not.toBe(`labels.line.${line}`);
      }
    }
  });

  it("the shop route resolves in both locales", () => {
    // The rendered pages themselves are asserted in tests/keune-render.test.ts;
    // the prerender flag is build-gates' job for every page.
    expect(localizePath("shop", "sv")).toBe("/butik");
    expect(localizePath("shop", "en")).toBe("/en/shop");
  });

  it("the products collection is registered and its defaults validate as stored", () => {
    expect(CMS.collections).toContain(PRODUCTS);
    for (const row of PRODUCTS.jsonFallback() as Record<string, unknown>[]) {
      expect(validateCollectionItem(PRODUCTS, row, row).ok, String(row.slug)).toBe(true);
    }
  });

  it("the admin refuses a product row with no slug, no line or no title", () => {
    const [first] = PRODUCTS.jsonFallback() as Record<string, unknown>[];
    for (const field of ["slug", "line", "title"]) {
      const result = validateCollectionItem(PRODUCTS, { ...first!, [field]: "" }, first!);
      expect(result.ok, field).toBe(false);
    }
  });

  it("the admin refuses a product image that is neither a bundled asset nor a media key", () => {
    const [first] = PRODUCTS.jsonFallback() as Record<string, unknown>[];
    const result = validateCollectionItem(PRODUCTS, { ...first!, image: "https://cdn.shopify.com/x.png" }, first!);
    expect(result.ok).toBe(false);
  });
});

describe("stylist picks", () => {
  const products = getProducts();

  it("every stylist carries a picks array, and every default is EMPTY — nobody has chosen yet", () => {
    for (const stylist of getStaff()) {
      expect(Array.isArray(stylist.picks), stylist.slug).toBe(true);
      expect(stylist.picks, stylist.slug).toEqual([]);
    }
  });

  it("asStylist: absent, null, a string or an object picks ⇒ []", () => {
    expect(asStylist({ name: "A", slug: "a" }).picks).toEqual([]);
    expect(asStylist({ name: "A", slug: "a", picks: null }).picks).toEqual([]);
    expect(asStylist({ name: "A", slug: "a", picks: "style-air-flow" }).picks).toEqual([]);
    expect(asStylist({ name: "A", slug: "a", picks: { 0: "style-air-flow" } }).picks).toEqual([]);
  });

  it("asStylist: non-string and blank entries are dropped, the rest trimmed", () => {
    const stylist = asStylist({ slug: "a", picks: [" style-air-flow ", 42, "", "   ", null, "style-sea-foam"] });
    expect(stylist.picks).toEqual(["style-air-flow", "style-sea-foam"]);
  });

  it("resolves picks to titles + bare salon deep links (pageSlug only)", () => {
    const picks = stylistPicks({ slug: "chriss-berner", picks: ["style-air-flow"] }, products);
    expect(picks).toHaveLength(1);
    expect(picks[0]!.title).toBe("Air Flow");
    const href = new URL(picks[0]!.href);
    expect(href.searchParams.get("pageSlug")).toBe("/p/style-air-flow/");
    expect([...href.searchParams.keys()]).toEqual(["pageSlug"]);
  });

  it("an unknown slug is dropped silently, never linked", () => {
    expect(stylistPicks({ slug: "a", picks: ["no-such-product"] }, products)).toEqual([]);
    const mixed = stylistPicks({ slug: "a", picks: ["no-such-product", "style-sea-foam"] }, products);
    expect(mixed.map((p) => p.title)).toEqual(["Sea Foam"]);
  });

  it("empty picks, or an empty product list, resolve to nothing", () => {
    expect(stylistPicks({ slug: "a", picks: [] }, products)).toEqual([]);
    expect(stylistPicks({ slug: "a", picks: ["style-air-flow"] }, [])).toEqual([]);
  });

  it("duplicates collapse and the list stops at MAX_PICKS, in the stylist's order", () => {
    const slugs = ["style-claytime", "style-claytime", "style-air-flow", "style-sea-foam", "style-steel-lock"];
    const picks = stylistPicks({ slug: "a", picks: slugs }, products);
    expect(MAX_PICKS).toBe(3);
    expect(picks.map((p) => p.title)).toEqual(["Claytime", "Air Flow", "Sea Foam"]);
  });

  it("the admin caps picks at three", () => {
    const [first] = STAFF.jsonFallback() as Record<string, unknown>[];
    const four = ["style-air-flow", "style-sea-foam", "style-claytime", "style-steel-lock"];
    expect(validateCollectionItem(STAFF, { ...first!, picks: four }, first!).ok).toBe(false);
    const three = validateCollectionItem(STAFF, { ...first!, picks: four.slice(0, 3) }, first!);
    expect(three.ok).toBe(true);
  });

  it("the heading uses the first name in the genitive", () => {
    expect(possessiveFirstName("Chriss Berner", "sv")).toBe("Chriss");
    expect(possessiveFirstName("Iris Paula", "sv")).toBe("Iris");
    expect(possessiveFirstName("Jannie Olofsson", "sv")).toBe("Jannies");
    expect(possessiveFirstName("Max", "sv")).toBe("Max");
    expect(possessiveFirstName("Chriss Berner", "en")).toBe("Chriss's");
    expect(possessiveFirstName("Jannie Olofsson", "en")).toBe("Jannie's");
    expect(possessiveFirstName("   ", "sv")).toBe("");
    expect(t("sv", "labels.picksBy", { name: possessiveFirstName("Jannie Olofsson", "sv") })).toBe("Jannies favoriter");
    expect(t("en", "labels.picksBy", { name: possessiveFirstName("Jannie Olofsson", "en") })).toBe("Jannie's picks");
  });
});

describe("keune-sync lib — flags", () => {
  it("accepts exactly one mode, with the flags that mode allows", () => {
    expect(parseArgs(["--check"])).toEqual({ mode: "check", dryRun: false, force: false });
    expect(parseArgs(["--update", "--dry-run"])).toEqual({ mode: "update", dryRun: true, force: false });
    expect(parseArgs(["--images", "--dry-run", "--force"])).toEqual({ mode: "images", dryRun: true, force: true });
  });

  it("a slug is safe as a file name only when it is ^[a-z0-9-]+$", () => {
    for (const slug of ["style-air-flow", "1922-by-j-m-keune-beard-oil", "a"]) expect(isSafeSlug(slug), slug).toBe(true);
    for (const slug of ["", "../escape", "a/b", "Bad Slug", "UPPER", "dot.png", "semi;colon", "tab\tx", null, undefined, 42]) {
      expect(isSafeSlug(slug), String(slug)).toBe(false);
    }
  });

  it("refuses no mode, two modes, an unknown flag, and a flag its mode does not take", () => {
    for (const argv of [[], ["--check", "--update"], ["--check", "--verbose"], ["--check", "--dry-run"], ["--update", "--force"]]) {
      expect(parseArgs(argv), argv.join(" ")).toHaveProperty("error");
    }
  });
});

describe("keune-sync lib — sitemap, join, feed", () => {
  const SITEMAP = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.keune.com/se/p/style-air-flow/</loc></url>
    <url><loc> https://www.keune.com/se/p/1922-by-j-m-keune-premium-clay/ </loc></url>
    <url><loc>https://www.keune.com/se/p/no-trailing-slash</loc></url>
    <url><loc>https://www.keune.com/se/holiday-looks/</loc></url>
    <url><loc>https://www.keune.com/se/p/</loc></url>
    <url><loc>https://www.keune.com/nl/p/dutch-only/</loc></url>
  </urlset>`;

  it("reads only /se/p/<slug>/ product URLs out of the sitemap", () => {
    expect([...parseSitemapSlugs(SITEMAP)].sort()).toEqual([
      "1922-by-j-m-keune-premium-clay",
      "no-trailing-slash",
      "style-air-flow",
    ]);
  });

  it("an empty or malformed sitemap yields no slugs rather than throwing", () => {
    expect(parseSitemapSlugs("").size).toBe(0);
    expect(parseSitemapSlugs("<html>502 Bad Gateway</html>").size).toBe(0);
    expect(parseSitemapSlugs(undefined as unknown as string).size).toBe(0);
  });

  const FEED = [
    { handle: "style-air-flow", title: "Air Flow", variants: [{ price: "349.00" }], images: [{ src: "https://cdn.shopify.com/a.png?v=1" }] },
    { handle: "1922-by-j-m-keune-premium-clay-1", title: "1922 By J.M. Keune Premium Clay", variants: [{ price: "279.00" }], images: [] },
    { handle: "care-vital-nutrition-shampoo-300ml", title: "Vital Nutrition Shampoo", variants: [{ price: "299.00" }] },
    { handle: "renamed-handle", title: "Sea Foam", variants: [{ price: "349.00" }] },
  ];

  it("joins on the exact handle first", () => {
    expect(matchProduct({ slug: "style-air-flow", title: "whatever" }, FEED)).toMatchObject({ via: "handle", product: FEED[0] });
  });

  it("then with a trailing -<digits> stripped, on either side", () => {
    expect(matchProduct({ slug: "1922-by-j-m-keune-premium-clay" }, FEED)).toMatchObject({ via: "suffix", product: FEED[1] });
    expect(matchProduct({ slug: "care-vital-nutrition-shampoo-300ml-2" }, FEED)).toMatchObject({ via: "suffix", product: FEED[2] });
    expect(stripNumericSuffix("care-vital-nutrition-shampoo-300ml")).toBe("care-vital-nutrition-shampoo-300ml");
  });

  it("then on the title, case-insensitively", () => {
    expect(matchProduct({ slug: "style-sea-foam", title: "  SEA foam " }, FEED)).toMatchObject({ via: "title", product: FEED[3] });
    expect(matchProduct({ slug: "", title: "air flow" }, FEED)).toMatchObject({ via: "title", product: FEED[0] });
  });

  it("an unmatched row is null — reported missing, never guessed", () => {
    expect(matchProduct({ slug: "no-such-thing", title: "No Such Thing" }, FEED)).toBeNull();
    expect(matchProduct({ slug: "", title: "" }, FEED)).toBeNull();
    expect(matchProduct({ slug: "style-air-flow" }, [])).toBeNull();
  });

  it("price is null when the feed has none", () => {
    expect(feedPrice(FEED[0])).toBe("349.00");
    expect(feedPrice({})).toBeNull();
    expect(feedPrice({ variants: [{ price: "  " }] })).toBeNull();
  });

  it("the report carries no feed image — images come from the product page only", () => {
    const [entry] = checkRows([{ slug: "style-air-flow", title: "Air Flow", price: "349.00" }], new Set(), FEED);
    expect(entry).not.toHaveProperty("image");
  });

  it("paginates until a page comes back empty", async () => {
    const calls: number[] = [];
    const pages = [[FEED[0]], [FEED[1], FEED[2]]];
    const all = await collectFeed(async (page: number) => {
      calls.push(page);
      return { products: pages[page - 1] ?? [] };
    });
    expect(all).toHaveLength(3);
    expect(calls).toEqual([1, 2, 3]);
  });

  it("an empty first page is an empty feed", async () => {
    expect(await collectFeed(async () => ({ products: [] }))).toEqual([]);
  });

  it("a page with no products array is a broken response and throws", async () => {
    await expect(collectFeed(async () => ({ errors: "Not Found" }))).rejects.toThrow(/no products array/);
    await expect(collectFeed(async () => null)).rejects.toThrow(/no products array/);
  });

  it("a feed that never ends throws at the page cap", async () => {
    await expect(collectFeed(async () => ({ products: [FEED[0]] }), 3)).rejects.toThrow(/within 3 pages/);
  });

  it("a network failure propagates rather than passing as an empty feed", async () => {
    await expect(collectFeed(async () => Promise.reject(new Error("ECONNRESET")))).rejects.toThrow("ECONNRESET");
  });
});

describe("keune-sync lib — report and update", () => {
  const sitemap = new Set(["style-air-flow", "1922-by-j-m-keune-premium-clay"]);
  const feed = [
    { handle: "style-air-flow", title: "Air Flow", variants: [{ price: "349.00" }], images: [{ src: "https://cdn.shopify.com/a.png" }] },
    { handle: "1922-by-j-m-keune-premium-clay-1", title: "Premium Clay", variants: [{ price: "279.00" }] },
  ];
  const rows = [
    { slug: "style-air-flow", title: "Air Flow", price: "349.00", blurb_sv: "Behåll", image: "/images/keune/style-air-flow.webp" },
    { slug: "1922-by-j-m-keune-premium-clay", title: "Premium Clay", price: "269.00", blurb_sv: "Behåll" },
    { slug: "gone-product", title: "Gone", price: "199.00", blurb_sv: "Behåll" },
  ];

  it("reports sitemap presence, the join and price drift per row", () => {
    const entries = checkRows(rows, sitemap, feed);
    expect(entries.map((e) => [e.slug, e.inSitemap, e.via, e.drift])).toEqual([
      ["style-air-flow", true, "handle", false],
      ["1922-by-j-m-keune-premium-clay", true, "suffix", true],
      ["gone-product", false, null, false],
    ]);
    expect(summarize(entries)).toEqual({
      total: 3,
      inSitemap: 2,
      inFeed: 2,
      drifted: 1,
      missingFromSitemap: ["gone-product"],
      missingFromFeed: ["gone-product"],
    });
  });

  it("the printed report flags MISSING and DRIFT and ends on the summary line", () => {
    const lines = formatReport(checkRows(rows, sitemap, feed));
    expect(lines[1]).toContain("price DRIFT 269.00 -> 279.00");
    expect(lines[2]).toContain("sitemap MISSING");
    expect(lines[2]).toContain("feed MISSING");
    expect(lines.at(-1)).toBe("KEUNE-CHECK: 2/3 in sitemap · 2/3 in feed · 1 price drift");
  });

  it("--update rewrites matched prices and _synced only, without mutating its input", () => {
    const doc = { _note: "keep", _synced: "2026-01-01", products: rows.map((r) => ({ ...r })) };
    const before = JSON.stringify(doc);
    const result = applyPriceUpdates(doc, checkRows(rows, sitemap, feed), "2026-09-29");
    const next = result.doc as { _note?: unknown; _synced: string; products: Record<string, unknown>[] };
    const changed = result.changed;
    expect(JSON.stringify(doc)).toBe(before);
    expect(next._synced).toBe("2026-09-29");
    expect(next._note).toBe("keep");
    expect(next.products.map((p: Record<string, unknown>) => p.price)).toEqual(["349.00", "279.00", "199.00"]);
    expect(changed).toEqual([{ slug: "1922-by-j-m-keune-premium-clay", from: "269.00", to: "279.00" }]);
    // Blurbs, images and order are never touched.
    expect(next.products.map((p: Record<string, unknown>) => p.slug)).toEqual(rows.map((r) => r.slug));
    expect(next.products.every((p: Record<string, unknown>) => p.blurb_sv === "Behåll")).toBe(true);
    expect(next.products[0]?.image).toBe("/images/keune/style-air-flow.webp");
  });

  it("--update leaves a row alone when the report does not line up with it", () => {
    const doc = { products: [{ slug: "style-air-flow", price: "1.00" }] };
    const misaligned = checkRows([{ slug: "other" }], new Set(), [{ handle: "other", variants: [{ price: "9.00" }] }]);
    const { doc: next, changed } = applyPriceUpdates(doc, misaligned, "2026-09-29");
    expect((next.products as Record<string, unknown>[])[0]?.price).toBe("1.00");
    expect(changed).toEqual([]);
  });

  it("today is Stockholm's date, not UTC's", () => {
    expect(todayIso(new Date("2026-09-29T10:00:00Z"))).toBe("2026-09-29");
    expect(todayIso(new Date("2026-09-29T22:30:00Z"))).toBe("2026-09-30");
  });
});

describe("keune-sync lib — the product page image", () => {
  const CF = "https://images.ctfassets.net/9kjqrnn60hxu";
  const HERO = `${CF}/01AOcJwDa42LpSDECUWPKO/038160d170dae65abaf80a3327ec6291/3000x3000__1_.png`;
  const BANNER = `${CF}/7p7DwqljxSTzyHYSYdgrHc/bd3763b8d779c61b9107688e5a581cb8/Banner_2400x1350_-_Sea_Foam.jpg`;
  const OG = `${CF}/5O4UV91B17g83TE6Sbuyzs/b247be0825a9bc92367fe4cdb73bf8fd/60000002-Keune-Style-Sea-Foam-200-online.jpg`;
  const OG_META = `<meta property="og:image" content="${OG}?w=1200&amp;h=600&amp;fit=fill"/>`;
  const asset = (baseUrl: string, title: string, width: number, height: number) => ({
    baseUrl,
    contentType: baseUrl.endsWith(".png") ? "image/png" : "image/jpeg",
    title,
    description: "",
    width,
    height,
    externalLink: null,
  });
  /**
   * The real `__NEXT_DATA__` of keune.com/se/p/style-sea-foam/ (fetched
   * 2026-09-30), trimmed to the keys the extractor walks past: a square hero,
   * then a 16:9 banner, a `thumbnailImage`, and the SEO og image.
   */
  const SEA_FOAM = {
    props: {
      pageProps: {
        page: {
          title: "Sea Foam",
          slug: "style-sea-foam",
          name: "Style Sea Foam",
          productMedia: [
            {
              id: "26GWYKdSfAYOGdRaPSbWZc",
              type: "Image",
              image: {
                mobile: asset(HERO, "Asset - Style Sea Foam 200ml", 3000, 3000),
                desktop: asset(HERO, "Asset - Style Sea Foam 200ml", 3000, 3000),
                description: "",
              },
            },
            {
              id: "1zVOh5R8smUK4ISTQcYzYo",
              type: "Image",
              image: {
                mobile: asset(BANNER, "Image Sea Foam Content", 2400, 1350),
                desktop: asset(BANNER, "Image Sea Foam Content", 2400, 1350),
                description: "",
              },
            },
          ],
          thumbnailImage: { url: HERO, width: 3000, height: 3000, title: "Asset - Style Sea Foam 200ml" },
          seo: { ogImage: `${OG}?w=1200&h=600&fit=fill` },
        },
        locale: "se",
      },
    },
    page: "/[locale]/p/[slug]",
  };
  /** A storefront page: optional head markup, then `__NEXT_DATA__` (object, raw string, or absent). */
  const html = (nextData: unknown, head = "") =>
    `<!DOCTYPE html><html lang="sv"><head><meta charSet="utf-8"/>${head}</head><body><div id="__next"></div>` +
    (nextData === undefined
      ? ""
      : `<script id="__NEXT_DATA__" type="application/json">${typeof nextData === "string" ? nextData : JSON.stringify(nextData)}</script>`) +
    "</body></html>";
  const withMedia = (productMedia: unknown) => ({ props: { pageProps: { page: { slug: "x", productMedia } } } });

  it("gallery: the first productMedia render — not the banner after it, not the og image", () => {
    expect(extractProductImage(html(SEA_FOAM, OG_META))).toEqual({ url: HERO, source: "gallery" });
  });

  it("gallery: a Video entry first is passed over — its thumbnail is a video frame", () => {
    const video = {
      id: "v",
      type: "Video",
      video: { url: "https://videos.ctfassets.net/9kjqrnn60hxu/a/b/how-to.mp4", contentType: "video/mp4" },
      thumbnail: { desktop: asset(`${CF}/f/f/frame.jpg`, "Video thumbnail", 1920, 1080) },
    };
    const page = withMedia([video, SEA_FOAM.props.pageProps.page.productMedia[0]]);
    expect(extractProductImage(html(page))).toEqual({ url: HERO, source: "gallery" });
  });

  it("gallery: the mobile asset stands in when the desktop one is absent", () => {
    const page = withMedia([{ type: "Image", image: { mobile: asset(HERO, "m", 3000, 3000) } }]);
    expect(extractProductImage(html(page))).toEqual({ url: HERO, source: "gallery" });
  });

  it("gallery: a baseUrl off Contentful (or not https) is not a gallery image", () => {
    const shopify = withMedia([
      { type: "Image", image: { desktop: asset("https://cdn.shopify.com/s/files/sea-foam.png", "s", 1024, 1024) } },
      { type: "Image", image: { desktop: asset("http://images.ctfassets.net/x/y/z.png", "h", 3000, 3000) } },
      { type: "Image", image: { desktop: { baseUrl: 42 } } },
      { type: "Image", image: { desktop: { baseUrl: "not a url" } } },
    ]);
    expect(extractProductImage(html(shopify, OG_META))).toEqual({ url: `${OG}?w=1200&h=600&fit=fill`, source: "og" });
    expect(extractProductImage(html(shopify))).toBeNull();
  });

  it("og: the page's og:image when there is no __NEXT_DATA__, &amp; decoded, attribute order free", () => {
    expect(extractProductImage(html(undefined, OG_META))).toEqual({ url: `${OG}?w=1200&h=600&fit=fill`, source: "og" });
    const reversed = `<meta content='${OG}' property='og:image'>`;
    expect(extractProductImage(html(undefined, reversed))).toEqual({ url: OG, source: "og" });
  });

  it("og: also when __NEXT_DATA__ parses but its gallery is empty, or not a list", () => {
    expect(extractProductImage(html(withMedia([]), OG_META))?.source).toBe("og");
    expect(extractProductImage(html(withMedia({ 0: "nope" }), OG_META))?.source).toBe("og");
    expect(extractProductImage(html({ props: {} }, OG_META))?.source).toBe("og");
  });

  it("og: og:image:width and friends are not og:image; an og:image off Contentful is refused", () => {
    const decoys = `<meta property="og:image:width" content="${OG}"/><meta property="og:image" content="https://cdn.shopify.com/og.jpg"/>`;
    expect(extractProductImage(html(undefined, decoys))).toBeNull();
    expect(extractProductImage(html(undefined, `<meta property="og:image"/>`))).toBeNull();
  });

  it("neither: a page with no gallery image and no og:image is null — MISSING, never guessed", () => {
    expect(extractProductImage(html(withMedia([])))).toBeNull();
    expect(extractProductImage("<html><body>502 Bad Gateway</body></html>")).toBeNull();
  });

  it("malformed: __NEXT_DATA__ that does not parse is null, and falls back to og:image when there is one", () => {
    const broken = '{"props":{"pageProps":{"page":{"productMedia":[{"image":';
    expect(extractProductImage(html(broken))).toBeNull();
    expect(extractProductImage(html(broken, OG_META))).toEqual({ url: `${OG}?w=1200&h=600&fit=fill`, source: "og" });
  });

  it("empty or absent input is null, not a throw", () => {
    for (const input of ["", undefined, null, 42, {}]) expect(extractProductImage(input), String(input)).toBeNull();
  });

  it("contentfulWebp REPLACES any existing query and keeps the asset path", () => {
    expect(contentfulWebp(`${OG}?w=1200&h=600&fit=fill`)).toBe(`${OG}?fm=webp&w=1200&q=80`);
    expect(contentfulWebp(HERO)).toBe(`${HERO}?fm=webp&w=1200&q=80`);
    expect(contentfulWebp(`${HERO}?fm=png&q=5#frag`, { w: 800, q: 70 })).toBe(`${HERO}?fm=webp&w=800&q=70`);
    expect(new URL(contentfulWebp(HERO)).pathname).toBe(new URL(HERO).pathname);
  });

  it("contentfulWebp throws on a string that is not a URL", () => {
    expect(() => contentfulWebp("not a url")).toThrow();
  });

  it("the product page is keune.com/se/p/<slug>/", () => {
    expect(productPageUrl("style-sea-foam")).toBe("https://www.keune.com/se/p/style-sea-foam/");
  });

  it("webpSize reads all three WebP headers", () => {
    expect(webpSize(webpHeader("VP8X", 1200, 1200))).toEqual({ width: 1200, height: 1200 });
    expect(webpSize(webpHeader("VP8 ", 1200, 900))).toEqual({ width: 1200, height: 900 });
    expect(webpSize(webpHeader("VP8L", 1024, 1000))).toEqual({ width: 1024, height: 1000 });
    expect(webpSize(Buffer.from(webpHeader("VP8X", 3000, 3000)))).toEqual({ width: 3000, height: 3000 });
  });

  it("webpSize is null for anything that is not a WebP", () => {
    const riffWave = webpHeader("VP8X", 10, 10);
    riffWave.set(latin("WAVE"), 8);
    const otherChunk = webpHeader("VP8X", 10, 10);
    otherChunk.set(latin("ALPH"), 12);
    const badStartCode = webpHeader("VP8 ", 10, 10);
    badStartCode[23] = 0;
    const badSignature = webpHeader("VP8L", 10, 10);
    badSignature[20] = 0;
    const errorPage = new TextEncoder().encode("<html><body>Access denied</body></html>");
    for (const bytes of [riffWave, otherChunk, badStartCode, badSignature, errorPage, webpHeader("VP8X", 10, 10).subarray(0, 29), new Uint8Array(0)]) {
      expect(webpSize(bytes)).toBeNull();
    }
    for (const notBytes of [undefined, null, "RIFF0000WEBPVP8X", 42, {}]) expect(webpSize(notBytes)).toBeNull();
  });
});

/**
 * The script's own exits, driven offline AND SANDBOXED.
 *
 * Offline: a `--import` preload replaces the global `fetch` with a stub
 * configured through `KEUNE_STUB`, so the sitemap, the feed, the product pages,
 * image bytes and a failing network are all fixtures. The stub answers 404 to
 * anything it was not told about, and logs every URL it is asked for, so a test
 * can prove a request was — or was never — made.
 *
 * Sandboxed: every run gets its own temp dir through `KEUNE_PRODUCTS_JSON` and
 * `KEUNE_IMAGE_DIR`, holding a HAND-BUILT products document — never the shipped
 * one — and an empty images folder. `run()` cannot be called without one, so no
 * test in this block can read or write `content/` or `public/`.
 */
describe("keune-sync script — exits (sandboxed)", () => {
  let stubUrl = "";
  const SCRIPT = join(ROOT, "scripts", "keune-sync.mjs");

  type Row = { slug: string; line: string; title: string; price: string; image: string; blurb_sv: string; blurb_en: string };
  const row = (slug: string, title: string, price: string): Row => ({
    slug,
    line: "care",
    title,
    price,
    image: `/images/keune/${slug}.webp`,
    blurb_sv: `Text om ${title}`,
    blurb_en: `Text about ${title}`,
  });
  const FIXTURE = [row("fixture-one", "Fixture One", "100.00"), row("fixture-two", "Fixture Two", "200.00")];
  const sitemapFor = (rows: Row[]) =>
    `<urlset>${rows.map((r) => `<url><loc>https://www.keune.com/se/p/${r.slug}/</loc></url>`).join("")}</urlset>`;
  const feedFor = (rows: Row[]) =>
    rows.map((r) => ({ handle: r.slug, title: r.title, variants: [{ price: r.price }] }));
  /** Product pages as keune.com serves them: the hero in `__NEXT_DATA__`, only an og:image, or neither. */
  const heroOf = (slug: string) => `https://images.ctfassets.net/fixture/${slug}/hero.png`;
  const ogOf = (slug: string) => `https://images.ctfassets.net/fixture/${slug}/og.jpg`;
  const galleryPage = (slug: string) =>
    `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { page: { slug, productMedia: [{ type: "Image", image: { desktop: { baseUrl: heroOf(slug) } } }] } } },
    })}</script></body></html>`;
  const ogPage = (slug: string) =>
    `<html><head><meta property="og:image" content="${ogOf(slug)}?w=1200&amp;h=600&amp;fit=fill"/></head><body></body></html>`;
  const barePage = "<html><head><title>Keune</title></head><body>no media</body></html>";
  const WEBP = webpHeader("VP8X", 1200, 1200);
  const WEBP64 = btoa(String.fromCharCode(...WEBP));
  /** The URLs a run requested, in order (the stub appends one per fetch). */
  const requested = (box: Box) => (existsSync(box.log) ? readFileSync(box.log, "utf8").split("\n").filter(Boolean) : []);

  /** A temp dir with `products.json` and an empty `images/` — all the script ever sees. */
  function sandbox(products: Row[] = FIXTURE) {
    const dir = mkdtempSync(join(tmpdir(), "keune-sync-"));
    expect(dir.startsWith(ROOT), "a sandbox must live outside the project").toBe(false);
    const productsJson = join(dir, "products.json");
    const imageDir = join(dir, "images");
    mkdirSync(imageDir);
    writeFileSync(productsJson, `${JSON.stringify({ _note: "fixture", _synced: "2026-01-01", products }, null, 2)}\n`);
    // The request log sits beside the sandbox, not in it, so "nothing but
    // images/ and products.json in the sandbox" stays checkable.
    const log = `${dir}.requests.log`;
    return { dir, productsJson, imageDir, log };
  }
  type Box = ReturnType<typeof sandbox>;

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), "keune-stub-"));
    const stub = join(dir, "fetch-stub.mjs");
    writeFileSync(
      stub,
      [
        "import { appendFileSync } from 'node:fs';",
        "const cfg = JSON.parse(process.env.KEUNE_STUB || '{}');",
        "const PAGE = 'https://www.keune.com/se/p/';",
        "globalThis.fetch = async (input) => {",
        "  const url = String(input);",
        "  if (cfg.log) appendFileSync(cfg.log, url + String.fromCharCode(10));",
        "  if (cfg.offline) throw new Error('offline (stub)');",
        "  const reply = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });",
        "  if (url.includes('pages_sitemap.xml')) return reply(cfg.sitemapStatus ?? 200, cfg.sitemap ?? '');",
        "  if (url.startsWith(PAGE)) {",
        "    const html = (cfg.pages ?? {})[decodeURIComponent(url.slice(PAGE.length).replace(/[/]$/, ''))];",
        "    return html === undefined ? reply(404, '') : reply(200, html);",
        "  }",
        "  if (url.startsWith('https://images.ctfassets.net/')) {",
        "    if (cfg.imageBase64) return new Response(Buffer.from(cfg.imageBase64, 'base64'), { status: 200 });",
        "    if (cfg.imageText) return reply(200, cfg.imageText);",
        "  }",
        "  if (url.includes('products.json')) {",
        "    const page = Number(new URL(url).searchParams.get('page'));",
        "    return reply(200, { products: (cfg.feedPages ?? [])[page - 1] ?? [] });",
        "  }",
        "  return reply(404, '');",
        "};",
      ].join("\n"),
    );
    stubUrl = pathToFileURL(stub).href;
  });

  const run = (box: Box, args: string[], stub: Record<string, unknown>) =>
    spawnSync(process.execPath, ["--import", stubUrl, SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        KEUNE_STUB: JSON.stringify({ log: box.log, ...stub }),
        KEUNE_PRODUCTS_JSON: box.productsJson,
        KEUNE_IMAGE_DIR: box.imageDir,
      },
    });

  it("--check passes (exit 0) when every curated slug is in the sitemap", () => {
    const box = sandbox();
    const result = run(box, ["--check"], { sitemap: sitemapFor(FIXTURE), feedPages: [feedFor(FIXTURE)] });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("KEUNE-CHECK: 2/2 in sitemap · 2/2 in feed · 0 price drift");
  });

  it("--check fails (exit 1) and names the slug when one left the sitemap", () => {
    const box = sandbox();
    const result = run(box, ["--check"], { sitemap: sitemapFor([FIXTURE[1]!]), feedPages: [feedFor(FIXTURE)] });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("fixture-one");
  });

  it("a sitemap fetch failure (network) exits 1 with the reason", () => {
    const result = run(sandbox(), ["--check"], { offline: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("offline (stub)");
  });

  it("a sitemap HTTP error exits 1 with the status", () => {
    const result = run(sandbox(), ["--check"], { sitemapStatus: 503, sitemap: "down", feedPages: [feedFor(FIXTURE)] });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("HTTP 503");
  });

  it("a sitemap with no product URLs is a failure, not 0 of N passing silently", () => {
    const result = run(sandbox(), ["--check"], { sitemap: "<urlset></urlset>", feedPages: [feedFor(FIXTURE)] });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("lists no /se/p/ product URLs");
  });

  it("--update --dry-run reports and writes nothing", () => {
    const box = sandbox();
    const before = readFileSync(box.productsJson, "utf8");
    const drifted = feedFor(FIXTURE).map((p, i) => (i === 0 ? { ...p, variants: [{ price: "1.00" }] } : p));
    const result = run(box, ["--update", "--dry-run"], { sitemap: sitemapFor(FIXTURE), feedPages: [drifted] });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("fixture-one  100.00 -> 1.00");
    expect(result.stdout).toContain("dry run, nothing written");
    expect(readFileSync(box.productsJson, "utf8")).toBe(before);
  });

  it("--update writes the new price and today's _synced, and nothing else", () => {
    const box = sandbox();
    const drifted = feedFor(FIXTURE).map((p, i) => (i === 0 ? { ...p, variants: [{ price: "1.00" }] } : p));
    const result = run(box, ["--update"], { sitemap: sitemapFor(FIXTURE), feedPages: [drifted] });
    expect(result.status, result.stderr).toBe(0);
    const text = readFileSync(box.productsJson, "utf8");
    const doc = JSON.parse(text) as { _note: string; _synced: string; products: Row[] };
    expect(doc._synced).toBe(todayIso());
    expect(doc._note).toBe("fixture");
    expect(doc.products.map((p) => p.price)).toEqual(["1.00", "200.00"]);
    expect(doc.products.map(({ price: _p, ...rest }) => rest)).toEqual(FIXTURE.map(({ price: _p, ...rest }) => rest));
    // Same formatting the shipped file uses, so a real run makes no noise diff.
    expect(text).toBe(`${JSON.stringify(doc, null, 2)}\n`);
  });

  it("--images sources each slug from its product page: gallery, og fallback, MISSING ⇒ exit 1", () => {
    // fixture-one still references the retired .png: the run says so beside the
    // download. fixture-three's page has no image at all: nothing is written.
    const stale = { ...FIXTURE[0]!, image: "/images/keune/fixture-one.png" };
    const box = sandbox([stale, FIXTURE[1]!, row("fixture-three", "Fixture Three", "300.00")]);
    const result = run(box, ["--images"], {
      pages: { "fixture-one": galleryPage("fixture-one"), "fixture-two": ogPage("fixture-two"), "fixture-three": barePage },
      imageBase64: WEBP64,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "fixture-one  gallery  downloaded 30 bytes, 1200×1200 -> /images/keune/fixture-one.webp (row references /images/keune/fixture-one.png)",
    );
    expect(result.stdout).toContain("fixture-two  og  downloaded 30 bytes, 1200×1200 -> /images/keune/fixture-two.webp");
    expect(result.stderr).toContain("fixture-three  MISSING — no gallery image or og:image on https://www.keune.com/se/p/fixture-three/");
    expect(result.stdout).toContain("KEUNE-IMAGES: 2 downloaded · 0 skipped · 1 failed · 1 gallery · 1 og · 1 MISSING");
    expect(readdirSync(box.imageDir).sort()).toEqual(["fixture-one.webp", "fixture-two.webp"]);
    // Contentful was asked for a WebP, with the og image's own query REPLACED —
    // and the Shopify feed was never asked for anything.
    const urls = requested(box);
    expect(urls).toContain(`${heroOf("fixture-one")}?fm=webp&w=1200&q=80`);
    expect(urls).toContain(`${ogOf("fixture-two")}?fm=webp&w=1200&q=80`);
    expect(urls.some((u) => u.includes("products.json") || u.includes("cdn.shopify.com"))).toBe(false);
  });

  it("--images downloads into the image dir and nowhere else, exit 0", () => {
    // fixture-two has a blank image (the removal path): it still downloads, with no note.
    const box = sandbox([FIXTURE[0]!, { ...FIXTURE[1]!, image: "" }]);
    const result = run(box, ["--images"], {
      pages: { "fixture-one": galleryPage("fixture-one"), "fixture-two": galleryPage("fixture-two") },
      imageBase64: WEBP64,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(box.imageDir).sort()).toEqual(["fixture-one.webp", "fixture-two.webp"]);
    expect([...readFileSync(join(box.imageDir, "fixture-one.webp"))]).toEqual([...WEBP]);
    expect(readdirSync(box.dir).sort()).toEqual(["images", "products.json"]);
    // Rows already pointing at the .webp, or blank, get no "row references" note.
    expect(result.stdout).not.toContain("row references");
    expect(result.stdout).toContain("KEUNE-IMAGES: 2 downloaded · 0 skipped · 0 failed · 2 gallery · 0 og · 0 MISSING");
  });

  it("--images --dry-run still reads every page, skips an existing file, and downloads nothing", () => {
    const box = sandbox();
    writeFileSync(join(box.imageDir, "fixture-two.webp"), "existing");
    const result = run(box, ["--images", "--dry-run"], {
      pages: { "fixture-one": galleryPage("fixture-one"), "fixture-two": ogPage("fixture-two") },
      imageBase64: WEBP64,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `fixture-one  gallery  would download ${heroOf("fixture-one")}?fm=webp&w=1200&q=80 -> /images/keune/fixture-one.webp`,
    );
    expect(result.stdout).toContain("fixture-two  og  exists — skipped");
    expect(result.stdout).toContain("KEUNE-IMAGES: 0 downloaded · 1 skipped · 0 failed · 1 gallery · 1 og · 0 MISSING (dry run)");
    expect(readdirSync(box.imageDir)).toEqual(["fixture-two.webp"]);
    expect(readFileSync(join(box.imageDir, "fixture-two.webp"), "utf8")).toBe("existing");
    expect(requested(box).some((u) => u.startsWith("https://images.ctfassets.net/"))).toBe(false);
  });

  it("--images refuses an unsafe slug before building a URL or a path: warned, never fetched, counted as failed", () => {
    // Hand-built rows the admin could never produce but a hand-edited JSON could:
    // a traversal, a space + capitals, an empty slug. Only the safe row may land,
    // nothing may appear outside the image dir, and no page is requested for
    // the refused rows even though the stub would serve them.
    const box = sandbox([row("../escape", "Escape", "1.00"), row("Bad Slug", "Bad", "1.00"), row("", "Blank Title", "1.00"), FIXTURE[0]!]);
    const result = run(box, ["--images"], {
      pages: { "../escape": galleryPage("escape"), "Bad Slug": galleryPage("bad"), "": galleryPage("blank"), "fixture-one": galleryPage("fixture-one") },
      imageBase64: WEBP64,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"../escape"  unsafe slug');
    expect(result.stderr).toContain('"Bad Slug"  unsafe slug');
    expect(result.stderr).toContain('""  unsafe slug');
    expect(result.stdout).toContain("KEUNE-IMAGES: 1 downloaded · 0 skipped · 3 failed · 1 gallery · 0 og · 0 MISSING");
    expect(readdirSync(box.imageDir)).toEqual(["fixture-one.webp"]);
    expect(existsSync(join(box.dir, "escape.webp"))).toBe(false);
    expect(readdirSync(box.dir).sort()).toEqual(["images", "products.json"]);
    expect(requested(box)).toEqual([
      "https://www.keune.com/se/p/fixture-one/",
      `${heroOf("fixture-one")}?fm=webp&w=1200&q=80`,
    ]);
  });

  it("--images: a product page that fails to load exits 1, and the other rows still run", () => {
    const box = sandbox();
    const result = run(box, ["--images"], { pages: { "fixture-two": galleryPage("fixture-two") }, imageBase64: WEBP64 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("fixture-one  page FAILED: https://www.keune.com/se/p/fixture-one/ -> HTTP 404");
    expect(result.stdout).toContain("KEUNE-IMAGES: 1 downloaded · 0 skipped · 1 failed · 1 gallery · 0 og · 0 MISSING");
    expect(readdirSync(box.imageDir)).toEqual(["fixture-two.webp"]);
  });

  it("--images: a network failure on the page is a page failure, exit 1, nothing written", () => {
    const box = sandbox([FIXTURE[0]!]);
    const result = run(box, ["--images"], { offline: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("fixture-one  page FAILED: offline (stub)");
    expect(readdirSync(box.imageDir)).toEqual([]);
  });

  it("--images --force exits 1 when a download fails, and writes nothing for it", () => {
    // No image in the stub: Contentful answers 404, so the failure path runs
    // before any write and the existing file keeps its bytes.
    const box = sandbox([FIXTURE[0]!]);
    const target = join(box.imageDir, "fixture-one.webp");
    writeFileSync(target, "ORIGINAL");
    const result = run(box, ["--images", "--force"], { pages: { "fixture-one": galleryPage("fixture-one") } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("fixture-one  gallery  download FAILED:");
    expect(result.stderr).toContain("HTTP 404");
    expect(readFileSync(target, "utf8")).toBe("ORIGINAL");
  });

  it("--images --force refuses a download that is not a WebP, and writes nothing for it", () => {
    const box = sandbox([FIXTURE[0]!]);
    const target = join(box.imageDir, "fixture-one.webp");
    writeFileSync(target, "ORIGINAL");
    const result = run(box, ["--images", "--force"], {
      pages: { "fixture-one": galleryPage("fixture-one") },
      imageText: "<html><body>Access denied</body></html>",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("fixture-one  gallery  download FAILED: not a WebP (39 bytes)");
    expect(readFileSync(target, "utf8")).toBe("ORIGINAL");
  });

  it("no mode is a usage error (exit 2)", () => {
    const result = run(sandbox(), [], {});
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });
});
