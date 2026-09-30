/**
 * The pure half of `scripts/keune-sync.mjs`: parsing, joining and reporting,
 * with every network call INJECTED so the whole thing runs offline under
 * Vitest (`tests/keune.test.ts`). The script itself only parses flags, wires in
 * `fetch`, and reads/writes files.
 *
 * Two Keune sources, both public (`Planning/KEUNE-KICKBACK.md`):
 *   - the SE pages sitemap — the canonical `/se/p/<slug>/` URLs, i.e. the slugs
 *     `keuneLink()` deep-links to. A curated slug missing here is a dead link.
 *   - the Shopify feed `checkout-se.keune.com/products.json` — prices and images.
 *     Its `handle` equals the sitemap slug for most products but not all (a
 *     trailing `-1`/`-2` differs either way), so the join falls back in steps.
 */

export const SITEMAP_URL = "https://www.keune.com/se/pages_sitemap.xml";
export const FEED_URL = "https://checkout-se.keune.com/products.json";
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

/** The product's first image URL, or null. */
export function feedImage(product) {
  const src = product?.images?.[0]?.src;
  return typeof src === "string" && src.trim() !== "" ? src.trim() : null;
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
      image: match ? feedImage(match.product) : null,
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

/**
 * The file name an image is saved under: the row's slug plus the extension
 * the CDN URL carries (query string ignored), `png` when it carries none we
 * serve. The format is kept as served — never re-encoded.
 *
 * @param {string} slug
 * @param {string} url
 */
export function imageFileName(slug, url) {
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = "";
  }
  const ext = pathname.match(/\.(png|jpe?g|webp|avif)$/i)?.[1]?.toLowerCase() ?? "png";
  return `${slug}.${ext === "jpeg" ? "jpg" : ext}`;
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
