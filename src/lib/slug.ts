import type { PostStatus } from "./posts";

/** Swedish-aware slugify. Deterministic, URL-safe, lowercase. */
const MAP: Record<string, string> = {
  "å": "a", // å
  "ä": "a", // ä
  "ö": "o", // ö
  "é": "e", // é
  "è": "e", // è
  "ü": "u", // ü
  "ø": "o", // ø
  "æ": "ae", // æ
  "ç": "c", // ç
};

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[åäöéèüøæç]/g, (c) => MAP[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip remaining combining diacritics
    .replace(/[^a-z0-9]+/g, "-") // non-alnum -> hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-"); // collapse runs
}

/** Ensure a slug is unique against an existing set by appending -2, -3, ... */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = slugify(base) || "post";
  if (!set.has(root)) return root;
  let n = 2;
  while (set.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

/**
 * The single slug authority (ARCHITECTURE §10.6 / B7) — immutable-after-publish.
 *
 * - A **published** post's slug is FROZEN: its stored slug is returned unchanged
 *   (live URLs never silently move when the title is edited — AC-6).
 * - On **create**, or editing a **still-draft** post, the slug is (re)computed:
 *   `uniqueSlug(slugify(override?.trim() || title), takenSlugs)` — a non-empty
 *   override wins over the title, then it's de-duplicated against taken slugs.
 *
 * Pure; the route passes `existing` (the loaded row, or null on create), the
 * optional user override, the title, and the locale's already-taken slugs
 * (with the post's own id excluded so an edit doesn't collide with itself).
 */
export function resolveSlug(
  existing: { slug: string; status: PostStatus } | null,
  override: string | undefined,
  title: string,
  takenSlugs: Iterable<string>,
): string {
  if (existing && existing.status === "published") return existing.slug;
  const source = override?.trim() || title;
  return uniqueSlug(slugify(source), takenSlugs);
}
