/**
 * The pure half of `scripts/keune-sync.mjs`: parsing, joining and reporting,
 * with every network call INJECTED so the whole thing runs offline under
 * Vitest (`tests/keune.test.ts`). The script itself only parses flags, wires in
 * `fetch`, and reads/writes files.
 *
 * Three Keune sources, all public (`Planning/KEUNE-KICKBACK.md`):
 *   - the SE pages sitemap — the canonical `/se/p/<slug>/` URLs, i.e. the slugs
 *     `keuneLink()` deep-links to. A curated slug missing here is a dead link.
 *   - the Shopify feed `checkout-se.keune.com/products.json` — prices and
 *     handles ONLY. Its `handle` equals the sitemap slug for most products but
 *     not all (a trailing `-1`/`-2` differs either way), so the join falls back
 *     in steps. Its images are NOT used: they are regenerated files (Sea Foam's
 *     is a 1024×1024 PNG with a fake checkerboard baked into the alpha, 987 KB).
 *   - the product page `www.keune.com/se/p/<slug>/` — the image. Its
 *     `__NEXT_DATA__` carries the gallery keune.com renders, hosted on
 *     Contentful (`images.ctfassets.net`), whose Images API re-encodes on
 *     request (`?fm=webp&w=…&q=…`).
 */

export const SITEMAP_URL = "https://www.keune.com/se/pages_sitemap.xml";
export const FEED_URL = "https://checkout-se.keune.com/products.json";
/** The only host `extractProductImage` accepts, and the one `contentfulWebp` speaks to. */
export const CONTENTFUL_IMAGE_HOST = "images.ctfassets.net";
/**
 * The User-Agent for the product pages and their images. keune.com is a
 * Next.js storefront behind a CDN; a browser-like agent is what it serves the
 * page to without question (the sitemap and the feed keep the script's own).
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
export const FEED_PAGE_SIZE = 250;
/** A runaway guard: 190 products fit on one page today; 20 pages is 5 000. */
export const MAX_FEED_PAGES = 20;

const MODES = ["--check", "--update", "--images"];
const FLAGS = ["--dry-run", "--force"];

/**
 * The script's flags. Exactly one mode; `--dry-run` only with a mode that
 * writes; `--force` only with `--images`. Anything else is a usage error, which
 * the script turns into exit 2 — the same contract as `bildbank-seed.mjs`.
 *
 * @param {string[]} argv
 * @returns {{ mode: "check" | "update" | "images", dryRun: boolean, force: boolean } | { error: string }}
 */
export function parseArgs(argv) {
  const unknown = argv.filter((arg) => !MODES.includes(arg) && !FLAGS.includes(arg));
  if (unknown.length) return { error: `unknown argument: ${unknown.join(" ")}` };
  const modes = argv.filter((arg) => MODES.includes(arg));
  if (modes.length !== 1) return { error: "exactly one of --check, --update, --images is required" };
  const mode = /** @type {"check" | "update" | "images"} */ (modes[0].slice(2));
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");
  if (dryRun && mode === "check") return { error: "--dry-run applies to --update and --images only" };
  if (force && mode !== "images") return { error: "--force applies to --images only" };
  return { mode, dryRun, force };
}

/**
 * Every product slug in the sitemap — the `<slug>` of each
 * `https://www.keune.com/se/p/<slug>/` `<loc>`. Other page types (blog posts,
 * quizzes, category pages) are ignored.
 *
 * @param {string} xml
 * @returns {Set<string>}
 */
export function parseSitemapSlugs(xml) {
  const slugs = new Set();
  for (const match of String(xml ?? "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const path = match[1].replace(/^https?:\/\/[^/]+/, "");
    const product = path.match(/^\/se\/p\/([^/?#]+)\/?$/);
    if (product) slugs.add(decodeURIComponent(product[1]));
  }
  return slugs;
}

/** A handle or slug without a trailing numeric suffix (`…-clay-1` → `…-clay`). */
export function stripNumericSuffix(value) {
  return String(value ?? "").replace(/-\d+$/, "");
}

const norm = (value) => String(value ?? "").trim().toLowerCase();

/**
 * The feed product a curated row refers to, and how it was found:
 *   1. `handle` — the feed handle IS the slug;
 *   2. `suffix` — equal once a trailing `-\d+` is stripped from both sides;
 *   3. `title`  — case-insensitive title match, the last resort.
 * `null` when none of the three finds it.
 *
 * @param {{ slug?: string, title?: string }} row
 * @param {Array<{ handle?: string, title?: string }>} feed
 */
export function matchProduct(row, feed) {
  const slug = String(row?.slug ?? "");
  if (slug !== "") {
    const exact = feed.find((product) => product.handle === slug);
    if (exact) return { product: exact, via: "handle" };
    const base = stripNumericSuffix(slug);
    const loose = feed.find((product) => stripNumericSuffix(product.handle) === base);
    if (loose) return { product: loose, via: "suffix" };
  }
  const title = norm(row?.title);
  if (title !== "") {
    const byTitle = feed.find((product) => norm(product.title) === title);
    if (byTitle) return { product: byTitle, via: "title" };
  }
  return null;
}

/** The product's price as the feed writes it (`"299.00"`), or null. */
export function feedPrice(product) {
  const price = product?.variants?.[0]?.price;
  return typeof price === "string" && price.trim() !== "" ? price.trim() : null;
}

/**
 * The whole feed, page by page (`page=1, 2, …`) until a page comes back empty.
 * A page without a `products` array is a broken response, not the end — it
 * throws rather than silently checking against half a catalogue.
 *
 * @param {(page: number) => Promise<unknown>} fetchPage resolves the parsed JSON body of one page
 */
export async function collectFeed(fetchPage, maxPages = MAX_FEED_PAGES) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const body = await fetchPage(page);
    const products = body && typeof body === "object" ? body.products : undefined;
    if (!Array.isArray(products)) throw new Error(`feed page ${page} has no products array`);
    if (products.length === 0) return all;
    all.push(...products);
  }
  throw new Error(`feed did not end within ${maxPages} pages`);
}

/**
 * One report line per curated row: is its slug in the sitemap, which feed
 * product it joined to (and how), and whether our price has drifted from the
 * feed's. Row order is preserved.
 *
 * @param {Array<{ slug?: string, title?: string, price?: string }>} rows
 * @param {Set<string>} sitemapSlugs
 * @param {unknown[]} feed
 */
export function checkRows(rows, sitemapSlugs, feed) {
  return rows.map((row) => {
    const match = matchProduct(row, /** @type {any[]} */ (feed));
    const livePrice = match ? feedPrice(match.product) : null;
    const ourPrice = String(row.price ?? "");
    return {
      slug: String(row.slug ?? ""),
      inSitemap: sitemapSlugs.has(String(row.slug ?? "")),
      via: match ? match.via : null,
      handle: match ? String(match.product.handle ?? "") : null,
      price: ourPrice,
      feedPrice: livePrice,
      drift: livePrice !== null && livePrice !== ourPrice,
    };
  });
}

/** @param {ReturnType<typeof checkRows>} entries */
export function summarize(entries) {
  return {
    total: entries.length,
    inSitemap: entries.filter((entry) => entry.inSitemap).length,
    inFeed: entries.filter((entry) => entry.via !== null).length,
    drifted: entries.filter((entry) => entry.drift).length,
    missingFromSitemap: entries.filter((entry) => !entry.inSitemap).map((entry) => entry.slug),
    missingFromFeed: entries.filter((entry) => entry.via === null).map((entry) => entry.slug),
  };
}

/**
 * The human report `--check` prints: one line per row, then a summary. A row
 * the sitemap does not carry is flagged MISSING — that is the failing case.
 *
 * @param {ReturnType<typeof checkRows>} entries
 */
export function formatReport(entries) {
  const s = summarize(entries);
  const lines = entries.map((entry) => {
    const sitemap = entry.inSitemap ? "sitemap ok" : "sitemap MISSING";
    const feed = entry.via ? `feed ok (${entry.via}${entry.via === "handle" ? "" : `: ${entry.handle}`})` : "feed MISSING";
    const price = entry.feedPrice === null
      ? `price ${entry.price || "-"} (no feed price)`
      : entry.drift
        ? `price DRIFT ${entry.price || "-"} -> ${entry.feedPrice}`
        : `price ${entry.price}`;
    return `${entry.slug}  ${sitemap} · ${feed} · ${price}`;
  });
  lines.push(
    `KEUNE-CHECK: ${s.inSitemap}/${s.total} in sitemap · ${s.inFeed}/${s.total} in feed · ${s.drifted} price drift`,
  );
  return lines;
}

/**
 * The products document with every matched row's `price` set to the feed's and
 * `_synced` set to `today`. Nothing else moves — not blurbs, images, order, or
 * the `_` notes — and the input is never mutated. `changed` lists the prices
 * that actually differed.
 *
 * @param {{ products: Array<Record<string, unknown>> } & Record<string, unknown>} doc
 * @param {ReturnType<typeof checkRows>} entries  in the same order as `doc.products`
 * @param {string} today  ISO date (YYYY-MM-DD)
 */
export function applyPriceUpdates(doc, entries, today) {
  const changed = [];
  const products = doc.products.map((row, index) => {
    const entry = entries[index];
    if (!entry || entry.feedPrice === null || entry.slug !== String(row.slug ?? "")) return { ...row };
    if (entry.feedPrice !== row.price) changed.push({ slug: entry.slug, from: row.price, to: entry.feedPrice });
    return { ...row, price: entry.feedPrice };
  });
  return { doc: { ...doc, _synced: today, products }, changed };
}

/**
 * Is `slug` safe to become a file name? Lowercase letters, digits and hyphens
 * only — the shape of every Keune product slug. Anything else (a `/`, a `..`,
 * a space, an uppercase letter, an empty string) is refused BEFORE a path is
 * built from it, so a hand-edited row can never write outside the image folder.
 *
 * @param {unknown} slug
 */
export function isSafeSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9-]+$/.test(slug);
}

/** The product's page on keune.com — the `/se/p/<slug>/` URL the sitemap lists. */
export function productPageUrl(slug) {
  return `https://www.keune.com/se/p/${encodeURIComponent(String(slug))}/`;
}

/** `value` as an https URL on Contentful's image host, or null. */
function contentfulUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname === CONTENTFUL_IMAGE_HOST ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * `props.pageProps.page` out of the storefront's `<script id="__NEXT_DATA__">`,
 * or null when the tag is absent or its JSON does not parse.
 */
function nextDataPage(html) {
  const match = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1])?.props?.pageProps?.page ?? null;
  } catch {
    return null;
  }
}

/**
 * The hero render: the first `props.pageProps.page.productMedia[i]` carrying
 * `image.desktop.baseUrl` (else `image.mobile.baseUrl`) on Contentful. Read
 * 2026-09-30 off all 24 curated pages: `productMedia[0]` is the square packshot
 * on every one (3000×3000; Claytime 4454×4454). Later entries are 16:9 banners,
 * or `type: "Video"` entries whose only image is `thumbnail.*.baseUrl` (a video
 * frame), which this path never reads. `page.thumbnailImage` is deliberately
 * NOT used: on Vital Nutrition Shampoo it is the conditioner's render.
 */
function galleryImage(page) {
  const media = page?.productMedia;
  if (!Array.isArray(media)) return null;
  for (const entry of media) {
    const url = contentfulUrl(entry?.image?.desktop?.baseUrl) ?? contentfulUrl(entry?.image?.mobile?.baseUrl);
    if (url) return url;
  }
  return null;
}

/**
 * The `content` of `<meta property="og:image">` (attribute order free, `&amp;`
 * decoded), when it is on Contentful. A packshot, but not always the gallery's:
 * the fallback, never the first choice. An og:image anywhere else is refused —
 * `contentfulWebp` cannot re-encode it, so it could not be saved as a WebP.
 */
function ogImage(html) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\b(?:property|name)\s*=\s*["']og:image["']/i.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const url = contentfulUrl((content?.[1] ?? content?.[2] ?? "").replace(/&(?:amp|#38|#x26);/gi, "&"));
    if (url) return url;
  }
  return null;
}

/**
 * The image a product page shows, and where it was found:
 *   1. `gallery` — the hero render in `__NEXT_DATA__` (see `galleryImage`);
 *   2. `og`      — the page's `og:image`, when the gallery yields nothing
 *                  (including when `__NEXT_DATA__` is absent or malformed);
 * `null` when neither is on the page — reported MISSING, never guessed.
 *
 * @param {unknown} html
 * @returns {{ url: string, source: "gallery" | "og" } | null}
 */
export function extractProductImage(html) {
  const text = typeof html === "string" ? html : "";
  const gallery = galleryImage(nextDataPage(text));
  if (gallery) return { url: gallery, source: "gallery" };
  const og = ogImage(text);
  if (og) return { url: og, source: "og" };
  return null;
}

/**
 * The Contentful Images API URL for `url` re-encoded as WebP at width `w` and
 * quality `q`. Any existing query (`?w=1200&h=600&fit=fill` on an og:image) is
 * REPLACED, never merged; the asset path is kept. Contentful never upscales,
 * so `w` is a ceiling. Throws on a string that is not a URL.
 *
 * @param {string} url
 * @param {{ w?: number, q?: number }} [options]
 */
export function contentfulWebp(url, { w = 1200, q = 80 } = {}) {
  const out = new URL(url);
  out.search = "";
  out.hash = "";
  out.searchParams.set("fm", "webp");
  out.searchParams.set("w", String(w));
  out.searchParams.set("q", String(q));
  return out.toString();
}

/**
 * The pixel size a WebP declares in its header, or null when `bytes` is not a
 * WebP: no `RIFF….WEBP` signature, too short, or a first chunk that is none of
 * lossy `VP8 `, lossless `VP8L` or extended `VP8X`. The script refuses to save
 * a download this returns null for.
 *
 * @param {unknown} bytes
 * @returns {{ width: number, height: number } | null}
 */
export function webpSize(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 30) return null;
  const b = bytes;
  const tag = (start) => String.fromCharCode(b[start], b[start + 1], b[start + 2], b[start + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const chunk = tag(12);
  if (chunk === "VP8X") {
    // Canvas width-1 and height-1, 24 bits little-endian each, at 24 and 27.
    return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  if (chunk === "VP8 ") {
    // Frame tag (3 bytes) at 20, start code 9d 01 2a at 23, then 14-bit sizes.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Signature 0x2f at 20, then width-1 and height-1 packed as 14 bits each.
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  return null;
}

/** Today's date in Stockholm as `YYYY-MM-DD` — the date the salon would write. */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
