#!/usr/bin/env node
/**
 * Keep the curated Keune product wall (`content/products.json`, `/butik`) honest
 * against Keune's own public sources: the SE sitemap (is every slug still a live
 * product URL?) and the Shopify feed (has the price moved? what is the image?).
 * The join, parsing and reporting live in `scripts/keune-sync.lib.mjs`, which is
 * unit-tested offline; this file only wires in `fetch` and the filesystem.
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
 *                                                    # download each matched product's first image into public/images/keune/
 *                                                    # (existing files are skipped unless --force; a slug that is
 *                                                    # not ^[a-z0-9-]+$ is refused before any path is built)
 *
 * Environment (tests only — both default to the real project paths):
 *   KEUNE_PRODUCTS_JSON  the products document to read (and, for --update, write)
 *   KEUNE_IMAGE_DIR      the folder --images writes into
 * The test suite points both at a temp dir, so no test can touch content/ or public/.
 *
 * Exit codes: 0 ok · 1 check failed, a fetch failed, a download failed or a slug was refused · 2 usage.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FEED_PAGE_SIZE,
  FEED_URL,
  SITEMAP_URL,
  applyPriceUpdates,
  checkRows,
  collectFeed,
  formatReport,
  imageFileName,
  isSafeSlug,
  parseArgs,
  parseSitemapSlugs,
  summarize,
  todayIso,
} from "./keune-sync.lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTS_JSON = process.env.KEUNE_PRODUCTS_JSON
  ? path.resolve(process.env.KEUNE_PRODUCTS_JSON)
  : path.join(ROOT, "content", "products.json");
const IMAGE_DIR = process.env.KEUNE_IMAGE_DIR
  ? path.resolve(process.env.KEUNE_IMAGE_DIR)
  : path.join(ROOT, "public", "images", "keune");
const HEADERS = { "User-Agent": "salongnovo.se keune-sync (+https://salongnovo.se)" };

const args = parseArgs(process.argv.slice(2));
if ("error" in args) {
  console.error(`keune-sync: ${args.error}`);
  console.error("usage: node scripts/keune-sync.mjs --check | --update [--dry-run] | --images [--dry-run] [--force]");
  process.exit(2);
}

async function fetchOk(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res;
}

const fetchFeed = () =>
  collectFeed(async (page) => (await fetchOk(`${FEED_URL}?limit=${FEED_PAGE_SIZE}&page=${page}`)).json());

async function main() {
  const doc = JSON.parse(readFileSync(PRODUCTS_JSON, "utf8"));
  const rows = doc.products;

  if (args.mode === "images") {
    const feed = await fetchFeed();
    const entries = checkRows(rows, new Set(), feed);
    mkdirSync(IMAGE_DIR, { recursive: true });
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    for (const entry of entries) {
      // Refused before a path exists: the slug becomes the file name, and a
      // hand-edited row must never be able to write outside IMAGE_DIR.
      if (!isSafeSlug(entry.slug)) {
        console.error(`${JSON.stringify(entry.slug)}  unsafe slug (not ^[a-z0-9-]+$) — refused`);
        failed++;
        continue;
      }
      if (!entry.image) {
        console.log(`${entry.slug}  no feed image — skipped`);
        skipped++;
        continue;
      }
      const file = imageFileName(entry.slug, entry.image);
      const target = path.join(IMAGE_DIR, file);
      const rel = `/images/keune/${file}`;
      const row = rows.find((r) => r.slug === entry.slug);
      const note = row && row.image && row.image !== rel ? ` (row references ${row.image})` : "";
      if (existsSync(target) && !args.force) {
        console.log(`${entry.slug}  exists — skipped${note}`);
        skipped++;
        continue;
      }
      if (args.dryRun) {
        console.log(`${entry.slug}  would download ${entry.image} -> ${rel}${note}`);
        continue;
      }
      try {
        const bytes = Buffer.from(await (await fetchOk(entry.image)).arrayBuffer());
        writeFileSync(target, bytes);
        console.log(`${entry.slug}  downloaded ${bytes.length} bytes -> ${rel}${note}`);
        downloaded++;
      } catch (error) {
        console.error(`${entry.slug}  download FAILED: ${error.message}`);
        failed++;
      }
    }
    console.log(`KEUNE-IMAGES: ${downloaded} downloaded · ${skipped} skipped · ${failed} failed${args.dryRun ? " (dry run)" : ""}`);
    return failed > 0 ? 1 : 0;
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
