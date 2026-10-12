#!/usr/bin/env node
/**
 * WebP variants for the build-shipped photography (2026-10-11, performance pass).
 *
 * The JPEGs under public/images/ ship as-is (one size, no WebP), so a phone on
 * /tavlingar paid full 1000×1400 JPEGs for 200px-wide tiles. This writes
 * `${stem}-${w}.webp` beside each JPEG — the same stem convention the R2 upload
 * path uses (`variantKey` in src/lib/images.ts) — and a manifest the front end
 * reads (`src/lib/static-image-variants.json`), so <Pic> only ever emits a
 * srcset for files that exist. The JPEG stays the <img> fallback and the stable
 * path: nothing that links to it changes.
 *
 * Widths per folder (never upscaled: a width above the source is capped AT the
 * source width, so the largest variant is always the full-resolution WebP).
 * Quality 80 throughout; a file that bands at 80 gets its own entry in QUALITY.
 *
 * Staleness is by CONTENT, not mtime: the manifest records a short SHA-1 of each
 * source, and a variant is rebuilt when that hash moves (the client replacing
 * `staff/chriss-berner.jpg` in place). mtimes are not trustworthy after a git
 * checkout, which stamps every file with the checkout time.
 *
 * Usage (from the project root; committed output, never run from `astro build`):
 *   node scripts/image-variants.mjs           # write missing/stale variants + the manifest
 *   node scripts/image-variants.mjs --check   # exit 1 if any variant or manifest entry is missing or stale
 *
 * Environment (tests only): IMAGE_VARIANTS_ROOT — a project root to work in
 * instead of this one (the test suite points it at a temp copy).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = process.env.IMAGE_VARIANTS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = join(ROOT, "public", "images");
const MANIFEST = join(ROOT, "src", "lib", "static-image-variants.json");

/** Folder → requested widths. Logos (PNG) and keune/ (already WebP) are not listed. */
const FOLDERS = {
  staff: [480, 800],
  "awards-2025": [480, 800, 1200],
  "awards-2026": [480, 800, 1200],
  "nordic-hairshot-2025": [480, 800, 1200],
  brands: [450, 900],
  textures: [768, 1536],
  story: [480, 800, 1200],
};
const DEFAULT_QUALITY = 80;
/** Per-file quality overrides (`folder/file.jpg` → q), for a file that bands at 80. */
const QUALITY = {};

/** The widths actually written for a source: requested widths capped at the source, deduped, ascending. */
function capWidths(requested, sourceWidth) {
  return [...new Set(requested.map((w) => Math.min(w, sourceWidth)))].sort((a, b) => a - b);
}

const sha = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);

async function plan() {
  const entries = [];
  for (const [folder, widths] of Object.entries(FOLDERS)) {
    const dir = join(IMAGES, folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort()) {
      const path = join(dir, file);
      const buf = readFileSync(path);
      const { width } = await sharp(buf).metadata();
      const stem = file.replace(/\.[a-z0-9]+$/i, "");
      entries.push({
        key: `/images/${folder}/${file}`,
        path,
        buf,
        hash: sha(buf),
        width,
        quality: QUALITY[`${folder}/${file}`] ?? DEFAULT_QUALITY,
        variants: capWidths(widths, width).map((w) => ({ w, path: join(dir, `${stem}-${w}.webp`) })),
      });
    }
  }
  return entries;
}

function manifestFor(entries) {
  const out = {};
  for (const e of entries) out[e.key] = { width: e.width, hash: e.hash, variants: e.variants.map((v) => v.w) };
  return JSON.stringify(out, null, 2) + "\n";
}

const readManifest = () => (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {});

async function main() {
  const check = process.argv.includes("--check");
  const entries = await plan();
  const old = readManifest();
  const problems = [];
  let written = 0;
  for (const e of entries) {
    const fresh = old[e.key]?.hash === e.hash;
    for (const v of e.variants) {
      if (fresh && existsSync(v.path)) continue;
      if (check) {
        problems.push(`${existsSync(v.path) ? "STALE" : "MISSING"} ${e.key} -> ${v.w}w`);
        continue;
      }
      await sharp(e.buf).resize({ width: v.w, withoutEnlargement: true }).webp({ quality: e.quality }).toFile(v.path);
      written++;
    }
  }
  const next = manifestFor(entries);
  // EOL-blind: a checkout with core.autocrlf hands the manifest back with CRLF.
  const current = existsSync(MANIFEST) ? readFileSync(MANIFEST, "utf8").replace(/\r\n/g, "\n") : "";
  if (check) {
    if (current !== next) problems.push(`MANIFEST out of date: ${MANIFEST}`);
    for (const p of problems) console.log(p);
    const total = entries.reduce((n, e) => n + e.variants.length, 0);
    console.log(problems.length ? `image-variants: ${problems.length} problem(s)` : `image-variants: OK (${entries.length} sources, ${total} variants)`);
    process.exit(problems.length ? 1 : 0);
  }
  if (current !== next) writeFileSync(MANIFEST, next);
  console.log(`image-variants: ${written} written, ${entries.length} sources`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
