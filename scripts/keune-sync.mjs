#!/usr/bin/env node
/**
 * Keep the curated Keune product wall (`content/products.json`, `/butik`) honest
 * against Keune's own public sources: the SE sitemap (is every slug still a live
 * product URL?), the Shopify feed (has the price moved?) and each product's page
 * on keune.com (what is the image?). The feed's images are never used — see
 * `scripts/keune-sync.lib.mjs`. The join, parsing and reporting live in that lib,
 * which is unit-tested offline; this file only wires in `fetch` and the filesystem.
 *
 * NEVER run from `astro build` — a build must not depend on Keune being up. Run
 * it by hand (or on a schedule) and commit what it changes.
 *
 * It edits the JSON DEFAULTS only. Once the client has saved the product list in
 * the admin, D1 wins and these defaults stop rendering; nothing here writes D1.
 *
 * Usage (from the project root):
 *   node scripts/keune-sync.mjs --check              # report sitemap/feed/price per row; exit 1 if a slug left the sitemap
 *   node scripts/keune-sync.mjs --update [--dry-run] # rewrite matched rows' `price` + `_synced` (blurbs, images, order untouched)
 *   node scripts/keune-sync.mjs --images [--dry-run] [--force]
 *                                                    # per row: fetch keune.com/se/p/<slug>/, take the gallery's hero
 *                                                    # render (else og:image) off Contentful as a 1200px WebP, and save
 *                                                    # it as public/images/keune/<slug>.webp; prints gallery|og|MISSING
 *                                                    # per slug (existing files are skipped unless --force; a slug that
 *                                                    # is not ^[a-z0-9-]+$ is refused before any URL or path is built;
 *                                                    # a download that is not a WebP is never written)
 *
 * Environment (tests only — both default to the real project paths):
 *   KEUNE_PRODUCTS_JSON  the products document to read (and, for --update, write)
 *   KEUNE_IMAGE_DIR      the folder --images writes into
 * The test suite points both at a temp dir, so no test can touch content/ or public/.
 *
 * Exit codes: 0 ok · 1 check failed, a fetch failed, a download failed, a page had no image
 * (MISSING) or a slug was refused · 2 usage.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROWSER_UA,
  FEED_PAGE_SIZE,
  FEED_URL,
  SITEMAP_URL,
  applyPriceUpdates,
  checkRows,
  collectFeed,
  contentfulWebp,
  extractProductImage,
  formatReport,
  isSafeSlug,
  parseArgs,
  parseSitemapSlugs,
  productPageUrl,
  summarize,
  todayIso,
  webpSize,
} from "./keune-sync.lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS_JSON = process.env.KEUNE_PRODUCTS_JSON
  ? path.resolve(process.env.KEUNE_PRODUCTS_JSON)
  : path.join(ROOT, "content", "products.json");
const IMAGE_DIR = process.env.KEUNE_IMAGE_DIR
  ? path.resolve(process.env.KEUNE_IMAGE_DIR)
  : path.join(ROOT, "public", "images", "keune");
const HEADERS = { "User-Agent": "salongnovo.se keune-sync (+https://salongnovo.se)" };
const PAGE_HEADERS = { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" };

const args = parseArgs(process.argv.slice(2));
if ("error" in args) {
  console.error(`keune-sync: ${args.error}`);
  console.error("usage: node scripts/keune-sync.mjs --check | --update [--dry-run] | --images [--dry-run] [--force]");
  process.exit(2);
}

async function fetchOk(url, headers = HEADERS) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res;
}

const fetchFeed = () =>
  collectFeed(async (page) => (await fetchOk(`${FEED_URL}?limit=${FEED_PAGE_SIZE}&page=${page}`)).json());

async function main() {
  const doc = JSON.parse(readFileSync(PRODUCTS_JSON, "utf8"));
  const rows = doc.products;

  if (args.mode === "images") {
    // The product page, not the Shopify feed: the feed's images are regenerated
    // junk (see the lib's header). The page is fetched even for a file that
    // exists, so every run — a dry run included — reports each slug's source.
    mkdirSync(IMAGE_DIR, { recursive: true });
    const count = { downloaded: 0, skipped: 0, failed: 0, gallery: 0, og: 0, missing: 0 };
    for (const row of rows) {
      const slug = String(row?.slug ?? "");
      // Refused before a URL or a path exists: the slug becomes both, and a
      // hand-edited row must never be able to write outside IMAGE_DIR.
      if (!isSafeSlug(slug)) {
        console.error(`${JSON.stringify(slug)}  unsafe slug (not ^[a-z0-9-]+$) — refused`);
        count.failed++;
        continue;
      }
      const page = productPageUrl(slug);
      let found;
      try {
        found = extractProductImage(await (await fetchOk(page, PAGE_HEADERS)).text());
      } catch (error) {
        console.error(`${slug}  page FAILED: ${error.message}`);
        count.failed++;
        continue;
      }
      if (!found) {
        console.error(`${slug}  MISSING — no gallery image or og:image on ${page}`);
        count.missing++;
        count.failed++;
        continue;
      }
      count[found.source]++;
      const src = contentfulWebp(found.url);
      const file = `${slug}.webp`;
      const target = path.join(IMAGE_DIR, file);
      const rel = `/images/keune/${file}`;
      const note = row.image && row.image !== rel ? ` (row references ${row.image})` : "";
      if (existsSync(target) && !args.force) {
        console.log(`${slug}  ${found.source}  exists — skipped${note}`);
        count.skipped++;
        continue;
      }
      if (args.dryRun) {
        console.log(`${slug}  ${found.source}  would download ${src} -> ${rel}${note}`);
        continue;
      }
      try {
        const bytes = Buffer.from(await (await fetchOk(src, PAGE_HEADERS)).arrayBuffer());
        // Checked before the write: an error page or a format Contentful chose
        // not to convert must never land under a .webp name.
        const size = webpSize(bytes);
        if (!size) throw new Error(`not a WebP (${bytes.length} bytes)`);
        writeFileSync(target, bytes);
        console.log(`${slug}  ${found.source}  downloaded ${bytes.length} bytes, ${size.width}×${size.height} -> ${rel}${note}`);
        count.downloaded++;
      } catch (error) {
        console.error(`${slug}  ${found.source}  download FAILED: ${error.message}`);
        count.failed++;
      }
    }
    console.log(
      `KEUNE-IMAGES: ${count.downloaded} downloaded · ${count.skipped} skipped · ${count.failed} failed · ` +
        `${count.gallery} gallery · ${count.og} og · ${count.missing} MISSING${args.dryRun ? " (dry run)" : ""}`,
    );
    return count.failed > 0 ? 1 : 0;
  }

  const [sitemapXml, feed] = await Promise.all([
    fetchOk(SITEMAP_URL).then((res) => res.text()),
    fetchFeed(),
  ]);
  const sitemapSlugs = parseSitemapSlugs(sitemapXml);
  if (sitemapSlugs.size === 0) throw new Error(`${SITEMAP_URL} lists no /se/p/ product URLs`);
  const entries = checkRows(rows, sitemapSlugs, feed);

  if (args.mode === "check") {
    for (const line of formatReport(entries)) console.log(line);
    const { missingFromSitemap } = summarize(entries);
    if (missingFromSitemap.length) {
      console.error(`keune-sync: ${missingFromSitemap.length} curated slug(s) no longer in Keune's sitemap: ${missingFromSitemap.join(", ")}`);
      return 1;
    }
    return 0;
  }

  // --update
  const { doc: next, changed } = applyPriceUpdates(doc, entries, todayIso());
  for (const change of changed) console.log(`${change.slug}  ${change.from} -> ${change.to}`);
  const unmatched = summarize(entries).missingFromFeed;
  if (unmatched.length) console.log(`not in feed (price kept): ${unmatched.join(", ")}`);
  if (args.dryRun) {
    console.log(`KEUNE-UPDATE: ${changed.length} price change(s), _synced -> ${next._synced} (dry run, nothing written)`);
    return 0;
  }
  writeFileSync(PRODUCTS_JSON, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`KEUNE-UPDATE: ${changed.length} price change(s), _synced -> ${next._synced}, wrote ${path.relative(ROOT, PRODUCTS_JSON)}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`keune-sync: ${error.message}`);
    process.exit(1);
  },
);
