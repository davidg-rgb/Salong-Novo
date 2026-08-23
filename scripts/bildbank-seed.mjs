#!/usr/bin/env node
/**
 * Seed the admin "Bildbank" (media library) with every photograph the public site
 * ships as a static asset, so the client can pick them in the CMS without
 * re-uploading. Mirrors the contract of `src/pages/api/admin/upload.ts` exactly:
 * one R2 object per image (`httpMetadata.contentType` set) + one `media` row
 * (`r2_key, alt, mime, bytes, created_at`). Idempotent: R2 `put` overwrites the
 * same key, the SQL is `INSERT OR IGNORE` on the UNIQUE `r2_key`.
 *
 * Keys are HUMAN, not UUIDs (`bildbank/personal/chriss-berner.jpg`) — the media
 * page shows the key as the caption, and these are curated library images, not
 * editor uploads. Alt text is derived from the same content documents the site
 * renders from, in Swedish, so a picked image carries a sensible default.
 *
 * Usage (from the project root, with CLOUDFLARE_API_TOKEN in the environment):
 *   node scripts/bildbank-seed.mjs --remote        # upload to R2 + insert rows in remote D1
 *   node scripts/bildbank-seed.mjs --local         # same against the local wrangler store
 *   node scripts/bildbank-seed.mjs --dry-run       # print the plan + write the SQL, touch nothing
 *
 * Re-run safely at any time (e.g. on the client's account at handover).
 */
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const BUCKET = "novo-images";
const DB = "novo_db";
const PREFIX = "bildbank";

const args = new Set(process.argv.slice(2));
const mode = args.has("--remote") ? "remote" : args.has("--local") ? "local" : args.has("--dry-run") ? "dry" : null;
if (!mode) {
  console.error("usage: node scripts/bildbank-seed.mjs --remote | --local | --dry-run");
  process.exit(2);
}

const staff = JSON.parse(readFileSync(path.join(ROOT, "content/staff.json"), "utf8"));
const awards = JSON.parse(readFileSync(path.join(ROOT, "content/awards.json"), "utf8"));

/** @type {{ key: string, file: string, alt: string }[]} */
const plan = [];

// ── 1. Staff portraits — keyed by slug, alt from the stylist's name.
for (const s of staff.stylists) {
  if (!s.photo || !s.photo.startsWith("/images/")) continue;
  plan.push({
    key: `${PREFIX}/personal/${path.basename(s.photo)}`,
    file: s.photo,
    alt: `${s.name} – frisör på Salong NOVO`,
  });
}

// ── 2. Competition photographs — one folder per competition+year, alt = the page's own pattern.
function folderFor(competition, year) {
  const slug = competition
    .toLowerCase()
    .replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${slug}-${year}`;
}
for (const group of awards.awards) {
  for (const item of group.items) {
    const images = Array.isArray(item.images) ? item.images : [];
    const people = (item.people ?? []).join(", ");
    // "Årets Nykomling 2026" reads as a title; a generic category like "Final" does
    // not, so those lead with the competition name instead.
    const title = /^Årets /i.test(item.category) ? `${item.category} ${group.year}` : `${group.competition} ${group.year}`;
    images.forEach((src, i) => {
      plan.push({
        key: `${PREFIX}/${folderFor(group.competition, group.year)}/${path.basename(src)}`,
        file: src,
        alt: `${title} — ${people || item.category}, bild ${i + 1} av ${images.length}`,
      });
    });
  }
}

// ── 3. Brand textures (generated, abstract — no people).
plan.push({ key: `${PREFIX}/texturer/hair-band.jpg`, file: "/images/textures/hair-band.jpg", alt: "Hårtextur – dekorband" });
plan.push({ key: `${PREFIX}/texturer/silk-band.jpg`, file: "/images/textures/silk-band.jpg", alt: "Silkestextur – sidfotens bakgrund" });

// ── Validate: every file exists, every key is unique and servable.
const KEY_RE = /^[a-z0-9][a-z0-9/_.-]*\.[a-z0-9]+$/i;
const seen = new Set();
for (const p of plan) {
  const abs = path.join(PUBLIC, p.file);
  if (!existsSync(abs)) throw new Error(`missing file ${p.file}`);
  if (!KEY_RE.test(p.key) || p.key.includes("..")) throw new Error(`bad key ${p.key}`);
  if (seen.has(p.key)) throw new Error(`duplicate key ${p.key}`);
  seen.add(p.key);
  p.abs = abs;
  p.bytes = statSync(abs).size;
  p.mime = /\.jpe?g$/i.test(p.file) ? "image/jpeg" : /\.png$/i.test(p.file) ? "image/png" : /\.webp$/i.test(p.file) ? "image/webp" : null;
  if (!p.mime) throw new Error(`unsupported type ${p.file}`);
}

// ── created_at: stagger one second apart so the library lists portraits first, then
//    the newest competition, etc. (the list orders by created_at DESC).
const base = Date.now();
plan.forEach((p, i) => { p.createdAt = new Date(base - i * 1000).toISOString(); });

const sqlEsc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = [
  `-- Bildbank seed, generated ${new Date(base).toISOString()} by scripts/bildbank-seed.mjs`,
  `-- ${plan.length} rows. INSERT OR IGNORE: re-running never duplicates (r2_key is UNIQUE).`,
  ...plan.map((p) =>
    `INSERT OR IGNORE INTO media (r2_key, alt, mime, bytes, created_at) VALUES (${sqlEsc(p.key)}, ${sqlEsc(p.alt)}, ${sqlEsc(p.mime)}, ${p.bytes}, ${sqlEsc(p.createdAt)});`,
  ),
  "",
].join("\n");

const outDir = path.join(ROOT, ".wrangler");
mkdirSync(outDir, { recursive: true });
const sqlPath = path.join(outDir, `bildbank.${mode}.sql`);
writeFileSync(sqlPath, sql, "utf8");

const totalKb = Math.round(plan.reduce((n, p) => n + p.bytes, 0) / 1024);
console.log(`${plan.length} images, ${totalKb} KB → ${mode}`);
console.log(`SQL written: ${path.relative(ROOT, sqlPath)}`);
if (mode === "dry") {
  for (const p of plan) console.log(`  ${p.key}  ←  ${p.file}  | ${p.alt}`);
  process.exit(0);
}

function wrangler(argv) {
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...argv], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`wrangler ${argv.slice(0, 3).join(" ")} failed (${r.status}):\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

const target = mode === "remote" ? "--remote" : "--local";

// ── R2: one put per object. Slow but dependency-free and resumable (re-run skips nothing,
//    overwrites identically). ~2–3 s per object.
let done = 0;
for (const p of plan) {
  // cwd-relative, forward slashes: the Windows shell splits an absolute path with spaces.
  wrangler(["r2", "object", "put", `${BUCKET}/${p.key}`, "--file", `public${p.file}`, "--content-type", p.mime, target]);
  done += 1;
  if (done % 10 === 0 || done === plan.length) console.log(`  R2 ${done}/${plan.length}`);
}

// ── D1: one batch.
const out = wrangler(["d1", "execute", DB, target, "--file", `.wrangler/bildbank.${mode}.sql`, "-y"]);
const changes = out.match(/"changes":\s*(\d+)/g) ?? [];
console.log(`  D1 executed (${changes.length} statement batches reported)`);

// ── Verify: count rows under the prefix.
// Via a file, not `--command`: the Windows shell would split the SQL into "arguments".
writeFileSync(path.join(outDir, "bildbank.count.sql"), `SELECT COUNT(*) AS n FROM media WHERE r2_key LIKE '${PREFIX}/%';
`, "utf8");
const count = wrangler(["d1", "execute", DB, target, "--file", ".wrangler/bildbank.count.sql", "--json"]);
const n = JSON.parse(count)[0]?.results?.[0]?.n;
console.log(`  media rows under ${PREFIX}/: ${n} (expected ${plan.length})`);
if (n !== plan.length) process.exit(1);
