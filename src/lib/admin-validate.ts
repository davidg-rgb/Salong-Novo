/**
 * Pure validation + normalization of the untrusted admin write body
 * (ARCHITECTURE §10.5, B3). No DB, no env, no I/O — the route handler owns the
 * author-default precedence (which needs `locals`) and the slug/publish policy
 * (which need the DB). This module only proves the shape and coerces it.
 */
import { isLocale, type Locale } from "../i18n/routes";
import type { PostStatus } from "./posts";

/** A single field-level validation failure (mirrors the `ApiError` envelope). */
export interface ValidationFailure {
  error: string;
  field: string;
}

/** The normalized, trusted write payload the route works with. */
export interface NormalizedPostWrite {
  id?: number;
  title: string;
  locale: Locale;
  status: PostStatus;
  body: string;
  excerpt: string;
  coverImage: string | null;
  author: string;
  seoTitle: string | null;
  seoDesc: string | null;
  slugOverride?: string;
}

/** Coerce an unknown to a trimmed string ("" when absent/non-string). */
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Coerce an unknown to a string-or-null (null when empty/absent/non-string). */
function asStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Reduce a cover-image value to its bare R2 key.
 *
 * Accepts a raw key (`blog/uuid.ext`) or a full/absolute URL and strips it to
 * the key: everything after the last `/api/media/` segment, else the URL path
 * with any leading slash removed. Empty/non-string → null.
 */
function normalizeCoverImage(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const raw = v.trim();
  if (raw === "") return null;

  const marker = "/api/media/";
  const idx = raw.lastIndexOf(marker);
  if (idx !== -1) return raw.slice(idx + marker.length) || null;

  // A full URL (http(s)://host/path...) → strip origin to the path.
  const m = raw.match(/^https?:\/\/[^/]+\/(.+)$/i);
  if (m) return m[1] || null;

  // Otherwise treat as a key; drop a stray leading slash.
  return raw.replace(/^\/+/, "") || null;
}

/** Is this a positive integer (for `id`)? */
function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/**
 * Parse + normalize an untrusted admin write body.
 *
 * Rules: `title` required non-empty string; `locale` must pass `isLocale`
 * (no silent `"sv"` default — B3); `status` ∈ {draft,published}; `id`, if
 * present, a positive integer; `coverImage` a key/URL stripped to its key, or
 * null; `slugOverride` set ONLY when `raw.slug` is a non-empty (trimmed) string;
 * other text fields coerced to string/null; `body` may be empty.
 */
export function parsePostWrite(
  raw: unknown,
): { ok: true; value: NormalizedPostWrite } | { ok: false; fail: ValidationFailure } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, fail: { error: "title_required", field: "title" } };
  }
  const r = raw as Record<string, unknown>;

  // title — required non-empty string
  if (typeof r.title !== "string" || r.title.trim() === "") {
    return { ok: false, fail: { error: "title_required", field: "title" } };
  }
  const title = r.title.trim();

  // locale — must be a valid Locale (no silent default)
  if (typeof r.locale !== "string" || !isLocale(r.locale)) {
    return { ok: false, fail: { error: "invalid_locale", field: "locale" } };
  }
  const locale: Locale = r.locale;

  // status — must be draft|published
  if (r.status !== "draft" && r.status !== "published") {
    return { ok: false, fail: { error: "invalid_status", field: "status" } };
  }
  const status: PostStatus = r.status;

  // id — optional, positive int when present
  let id: number | undefined;
  if (r.id !== undefined && r.id !== null) {
    if (!isPositiveInt(r.id)) {
      return { ok: false, fail: { error: "invalid_id", field: "id" } };
    }
    id = r.id;
  }

  // slugOverride — only when raw.slug is a non-empty trimmed string
  let slugOverride: string | undefined;
  if (typeof r.slug === "string" && r.slug.trim() !== "") {
    slugOverride = r.slug.trim();
  }

  const value: NormalizedPostWrite = {
    ...(id !== undefined ? { id } : {}),
    title,
    locale,
    status,
    body: asString(r.body),
    excerpt: asString(r.excerpt),
    coverImage: normalizeCoverImage(r.coverImage),
    author: asString(r.author),
    seoTitle: asStringOrNull(r.seoTitle),
    seoDesc: asStringOrNull(r.seoDesc),
    ...(slugOverride !== undefined ? { slugOverride } : {}),
  };
  return { ok: true, value };
}
