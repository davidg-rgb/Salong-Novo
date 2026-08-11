import type { Post, PostStatus } from "./posts";
import type { Locale } from "../i18n/routes";
import type { MediaItem } from "./admin-api";
import { originalUrl } from "./images";

/**
 * Minimal D1-compatible interface so the query layer is testable with a fake
 * (Cloudflare's real `D1Database` satisfies this shape at runtime).
 */
export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(sql: string): PreparedStatement;
}

/** Raw DB row (snake_case as stored in D1). */
export interface PostRow {
  id: number;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  body: string;
  cover_image: string | null;
  author: string | null;
  status: string;
  seo_title: string | null;
  seo_desc: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw DB row for the `media` table (snake_case as stored in D1). */
export interface MediaRow {
  id: number;
  post_id: number | null;
  r2_key: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  variants: string | null; // JSON array of widths
  created_at: string;
}

/** Map a stored row to the domain `Post`. */
export function mapRow(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    locale: (row.locale === "en" ? "en" : "sv") as Locale,
    title: row.title,
    excerpt: row.excerpt ?? "",
    body: row.body,
    coverImage: row.cover_image,
    author: row.author ?? "",
    status: (row.status === "published" ? "published" : "draft") as PostStatus,
    seoTitle: row.seo_title,
    seoDesc: row.seo_desc,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = "SELECT * FROM posts";

export async function listPublished(
  db: Database,
  locale: Locale,
  limit = 50,
  offset = 0,
): Promise<Post[]> {
  const { results } = await db
    .prepare(
      `${SELECT} WHERE status = 'published' AND published_at IS NOT NULL AND locale = ? ORDER BY published_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(locale, limit, offset)
    .all<PostRow>();
  return results.map(mapRow);
}

/**
 * Public blog lookup: returns a post only if it is PUBLISHED. Drafts must never
 * be readable by slug on the public site (the admin preview uses an id-based,
 * Access-gated lookup instead). See ARCHITECTURE §10 (admin preview route).
 */
export async function getBySlug(
  db: Database,
  locale: Locale,
  slug: string,
): Promise<Post | null> {
  const row = await db
    .prepare(`${SELECT} WHERE locale = ? AND slug = ? AND status = 'published' LIMIT 1`)
    .bind(locale, slug)
    .first<PostRow>();
  return row ? mapRow(row) : null;
}

/** All posts for the admin dashboard (any status). */
export async function listAll(db: Database): Promise<Post[]> {
  const { results } = await db
    .prepare(`${SELECT} ORDER BY updated_at DESC`)
    .all<PostRow>();
  return results.map(mapRow);
}

/**
 * Admin lookup by primary key (any status). Used by the editor edit-form load
 * and the Access-gated draft preview — both need drafts, which `getBySlug`
 * deliberately hides from the public site.
 */
export async function getById(db: Database, id: number): Promise<Post | null> {
  const row = await db
    .prepare(`${SELECT} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<PostRow>();
  return row ? mapRow(row) : null;
}

/**
 * Slugs already taken in a locale, optionally excluding one post id (so an edit
 * doesn't collide with its own current slug). Feeds `uniqueSlug`/`resolveSlug`.
 */
export async function takenSlugs(
  db: Database,
  locale: Locale,
  excludeId?: number,
): Promise<string[]> {
  let sql = `SELECT slug FROM posts WHERE locale = ?`;
  const binds: unknown[] = [locale];
  if (excludeId !== undefined) {
    sql += ` AND id != ?`;
    binds.push(excludeId);
  }
  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<{ slug: string }>();
  return results.map((r) => r.slug);
}

/**
 * Filtered admin listing (dashboard / client refresh). Builds a parameterized
 * dynamic WHERE from optional locale/status/title-contains filters; newest
 * updated first.
 */
export async function listAdmin(
  db: Database,
  filters: { locale?: Locale; status?: PostStatus; q?: string },
): Promise<Post[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filters.locale) {
    where.push("locale = ?");
    binds.push(filters.locale);
  }
  if (filters.status) {
    where.push("status = ?");
    binds.push(filters.status);
  }
  if (filters.q) {
    where.push("lower(title) LIKE '%' || lower(?) || '%'");
    binds.push(filters.q);
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { results } = await db
    .prepare(`${SELECT}${clause} ORDER BY updated_at DESC`)
    .bind(...binds)
    .all<PostRow>();
  return results.map(mapRow);
}

export interface PostInput {
  slug: string;
  locale: Locale;
  title: string;
  excerpt?: string;
  body: string;
  coverImage?: string | null;
  author?: string;
  status: PostStatus;
  seoTitle?: string | null;
  seoDesc?: string | null;
  publishedAt?: string | null;
}

/**
 * Insert a post and return the stored row (via `RETURNING *`) mapped to a
 * `Post` — the editor needs the new `id` to switch subsequent saves to PUT and
 * the server-resolved slug. (Callers that ignore the return value still compile.)
 */
export async function insertPost(
  db: Database,
  input: PostInput,
  now: string,
): Promise<Post> {
  const row = await db
    .prepare(
      `INSERT INTO posts
        (slug, locale, title, excerpt, body, cover_image, author, status, seo_title, seo_desc, published_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       RETURNING *`,
    )
    .bind(
      input.slug,
      input.locale,
      input.title,
      input.excerpt ?? "",
      input.body,
      input.coverImage ?? null,
      input.author ?? "",
      input.status,
      input.seoTitle ?? null,
      input.seoDesc ?? null,
      input.status === "published" ? (input.publishedAt ?? now) : null,
      now,
      now,
    )
    .first<PostRow>();
  return mapRow(row!);
}

/**
 * Update a post and return the stored row (via `RETURNING *`) mapped to a
 * `Post` — so the editor can refresh its model (e.g. a resolved slug) from the
 * authoritative row. (Callers that ignore the return value still compile.)
 */
export async function updatePost(
  db: Database,
  id: number,
  input: PostInput,
  now: string,
): Promise<Post> {
  const row = await db
    .prepare(
      `UPDATE posts SET
        slug=?, locale=?, title=?, excerpt=?, body=?, cover_image=?, author=?,
        status=?, seo_title=?, seo_desc=?, published_at=?, updated_at=?
       WHERE id=?
       RETURNING *`,
    )
    .bind(
      input.slug,
      input.locale,
      input.title,
      input.excerpt ?? "",
      input.body,
      input.coverImage ?? null,
      input.author ?? "",
      input.status,
      input.seoTitle ?? null,
      input.seoDesc ?? null,
      input.status === "published" ? (input.publishedAt ?? now) : null,
      now,
      id,
    )
    .first<PostRow>();
  return mapRow(row!);
}

export async function deletePost(db: Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM posts WHERE id = ?`).bind(id).run();
}

/** Served URL for a media key without depending on the env-coupled `media.ts`. */
function servedKeyUrl(base: string, key: string): string {
  return base ? originalUrl(base, key) : `/api/media/${key}`;
}

/** Parse a `media.variants` JSON column to a number[] ([] on null/garbage). */
function parseVariantWidths(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

/** Map a raw media row to the shared `MediaItem` shape (url via `base`). */
function mapMediaRow(row: MediaRow, base: string): MediaItem {
  return {
    id: row.id,
    key: row.r2_key,
    url: servedKeyUrl(base, row.r2_key),
    alt: row.alt ?? "",
    variants: parseVariantWidths(row.variants),
    createdAt: row.created_at,
  };
}

/** Recent media for the picker (newest first). `base` injected → lib stays env-free. */
export async function listMedia(
  db: Database,
  base: string,
  limit = 100,
  offset = 0,
): Promise<MediaItem[]> {
  const { results } = await db
    .prepare(`SELECT * FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(limit, offset)
    .all<MediaRow>();
  return results.map((r) => mapMediaRow(r, base));
}

/** Insert a media row (after a successful R2 upload). */
export async function insertMedia(
  db: Database,
  row: { r2_key: string; alt: string; post_id?: number | null; variants?: string },
  now: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO media (post_id, r2_key, alt, width, height, variants, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .bind(
      row.post_id ?? null,
      row.r2_key,
      row.alt,
      null,
      null,
      row.variants ?? "[]",
      now,
    )
    .run();
}

/** Delete a media row by its R2 key (the R2 object is removed separately). */
export async function deleteMediaRow(db: Database, key: string): Promise<void> {
  await db.prepare(`DELETE FROM media WHERE r2_key = ?`).bind(key).run();
}

/**
 * Post ids that reference a media key — either as a cover image or anywhere in
 * the Markdown body. Powers the soft in-use warning on media delete.
 */
export async function mediaUsage(db: Database, key: string): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT id FROM posts WHERE cover_image = ? OR body LIKE '%' || ? || '%'`,
    )
    .bind(key, key)
    .all<{ id: number }>();
  return results.map((r) => r.id);
}
