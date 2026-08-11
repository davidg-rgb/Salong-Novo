import type { Locale } from "../i18n/routes";

export type PostStatus = "draft" | "published";

export interface Post {
  id: number;
  slug: string;
  locale: Locale;
  title: string;
  excerpt: string;
  body: string; // Markdown
  coverImage: string | null; // R2 key
  author: string;
  status: PostStatus;
  seoTitle: string | null;
  seoDesc: string | null;
  publishedAt: string | null; // ISO
  createdAt: string;
  updatedAt: string;
}

export function isPublished(p: Post): boolean {
  return p.status === "published" && !!p.publishedAt;
}

function byDateDesc(a: Post, b: Post): number {
  return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
}

/** Published posts for a locale, newest first. */
export function publishedPosts(posts: Post[], locale: Locale): Post[] {
  return posts.filter((p) => isPublished(p) && p.locale === locale).sort(byDateDesc);
}

export function findBySlug(
  posts: Post[],
  locale: Locale,
  slug: string,
): Post | undefined {
  return posts.find((p) => p.locale === locale && p.slug === slug);
}

/**
 * The publish-transition table (ARCHITECTURE §10.9). Decides the `published_at`
 * value for a write given the existing row (or null on create) and the next
 * status:
 *
 * | transition                         | result                |
 * |------------------------------------|-----------------------|
 * | create draft / →draft / draft→draft| `null`                |
 * | create published                   | `now`                 |
 * | draft→published / republish        | `now`                 |
 * | published re-save (still published)| existing.publishedAt  |
 * | published→draft                    | `null`                |
 *
 * Drafts always clear the timestamp; a publish preserves an already-published
 * post's original date, otherwise stamps `now`.
 */
export function nextPublishedAt(
  existing: Post | null,
  nextStatus: PostStatus,
  now: string,
): string | null {
  if (nextStatus !== "published") return null;
  if (existing && existing.status === "published" && existing.publishedAt) {
    return existing.publishedAt;
  }
  return now;
}

export interface Page<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function paginate<T>(items: T[], page = 1, perPage = 9): Page<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: current,
    perPage,
    total,
    totalPages,
    hasPrev: current > 1,
    hasNext: current < totalPages,
  };
}
