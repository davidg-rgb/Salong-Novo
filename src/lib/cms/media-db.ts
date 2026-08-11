/**
 * The `media` table (ARCHITECTURE §6.11), against migration 0001's shape:
 * `r2_key, alt, width, height, mime, bytes, created_at`. Note what is NOT there
 * — no `variants`, no `post_id`. Salong's columns are deliberately not ported
 * (ADR-05 drops responsive variants; there are no posts here).
 *
 * ALT PRECEDENCE (§6.11): `media.alt` is MONOLINGUAL and admin-internal — an
 * upload-time convenience shown in the library so an image is identifiable in a
 * grid of UUID filenames. Public rendering always uses the bilingual per-item
 * fields (`poster_alt_sv`/`poster_alt_en` through `posterAlt()`, which falls
 * back to the item title). The library alt never reaches a public `<img>`.
 */
import type { Database } from "./db";
import type { UsageQuery } from "./config-types";
import { servedUrl } from "./media";

export type MediaItem = {
  id: number;
  key: string;
  url: string;
  alt: string;
  mime: string;
  bytes: number | null;
  createdAt: string;
};

/** The raw SELECT row. Kept private — callers traffic in `MediaItem`. */
type MediaDbRow = {
  id: number;
  r2_key: string;
  alt: string;
  mime: string;
  bytes: number | null;
  created_at: string;
};

const SELECT_COLUMNS = `id, r2_key, alt, mime, bytes, created_at`;

function toMediaItem(row: MediaDbRow, base: string): MediaItem {
  return {
    id: row.id,
    key: row.r2_key,
    url: servedUrl(base, row.r2_key),
    alt: row.alt ?? "",
    mime: row.mime ?? "",
    bytes: row.bytes ?? null,
    createdAt: row.created_at,
  };
}

/**
 * The library listing, newest first. `id DESC` breaks ties because a batch
 * upload can stamp several rows with the same ISO second.
 */
export async function listMediaRows(
  db: Database,
  base: string,
  limit = 100,
  offset = 0,
): Promise<MediaItem[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM media
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all<MediaDbRow>();
  return results.map((row) => toMediaItem(row, base));
}

/**
 * Insert and hand back the new id via `RETURNING` — one round trip, where
 * salong needed a SELECT after the INSERT to recover it.
 */
export async function insertMediaRow(
  db: Database,
  row: { r2_key: string; alt: string; mime: string; bytes: number | null },
  now: string,
): Promise<number> {
  const inserted = await db
    .prepare(
      `INSERT INTO media (r2_key, alt, mime, bytes, created_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(row.r2_key, row.alt, row.mime, row.bytes, now)
    .first<{ id: number }>();
  return inserted?.id ?? 0;
}

/**
 * Existence check behind the 404s on media PUT/DELETE — the void-returning
 * mutations below cannot signal not-found on their own.
 *
 * `base` is optional because the two callers that need a 404 don't care about
 * the served URL; pass it when the row is going to be rendered.
 */
export async function getMediaRow(
  db: Database,
  key: string,
  base = "",
): Promise<MediaItem | null> {
  const row = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM media WHERE r2_key = ? LIMIT 1`)
    .bind(key)
    .first<MediaDbRow>();
  return row ? toMediaItem(row, base) : null;
}

export async function updateMediaAlt(db: Database, key: string, alt: string): Promise<void> {
  await db.prepare(`UPDATE media SET alt = ? WHERE r2_key = ?`).bind(alt, key).run();
}

export async function deleteMediaRow(db: Database, key: string): Promise<void> {
  await db.prepare(`DELETE FROM media WHERE r2_key = ?`).bind(key).run();
}

/**
 * Count what still references this key, per the project's configured
 * `UsageQuery` list — this is what powers the soft in-use warning (F-011).
 *
 * BIND CONTRACT (§6.11, test-enforced in `tests/cms-config.test.ts`): every
 * `sql` is `SELECT COUNT(*) AS n …` taking EXACTLY ONE bind — the media key,
 * referenced as `?1` however many times it appears. Only non-zero hits come
 * back; a query that finds nothing is not news.
 */
export async function mediaUsage(
  db: Database,
  key: string,
  queries: UsageQuery[],
): Promise<{ label: string; count: number }[]> {
  const hits: { label: string; count: number }[] = [];
  for (const query of queries) {
    const row = await db.prepare(query.sql).bind(key).first<{ n: number }>();
    const count = Number(row?.n ?? 0);
    if (count > 0) hits.push({ label: query.label, count });
  }
  return hits;
}

/**
 * Release every reference this key still has, on the force-delete path.
 *
 * Poster references go to NULL so the card falls back to `MediaFrame`'s
 * placeholder plate — MediaFrame branches on `src` being null
 * (MediaFrame.astro:38-48), NOT on an image failing to load, which is exactly
 * why the refs must be cleared rather than left dangling.
 *
 * A `UsageQuery` with no `clearSql` is UN-CLEARABLE by design (nicole's
 * collection-data query: SQL string surgery on a JSON document risks corrupting
 * the payload). Its label comes back in `unclearable` so a human sees the
 * reference instead of it silently breaking. Both lists report only queries that
 * actually matched — a zero-hit label in the warning is noise.
 */
export async function clearMediaRefs(
  db: Database,
  key: string,
  queries: UsageQuery[],
): Promise<{ cleared: { label: string; count: number }[]; unclearable: string[] }> {
  const cleared: { label: string; count: number }[] = [];
  const unclearable: string[] = [];

  for (const query of queries) {
    const row = await db.prepare(query.sql).bind(key).first<{ n: number }>();
    const count = Number(row?.n ?? 0);
    if (count === 0) continue;

    if (!query.clearSql) {
      unclearable.push(query.label);
      continue;
    }
    await db.prepare(query.clearSql).bind(key).run();
    cleared.push({ label: query.label, count });
  }

  return { cleared, unclearable };
}
