/**
 * Slugs (ARCHITECTURE §6.9) — the public URL fragment of a content item.
 *
 * THE RULE THAT MATTERS: a slug is immutable once its item has been published.
 * The moment a page is live, its URL can be in a DM, an email signature, a
 * brand's brief or a search index, and renaming it because someone fixed a typo
 * in the title breaks all of those silently. Drafts have no such history, so
 * they re-slug freely and dedupe with a numeric suffix.
 *
 * Pure functions — the caller supplies the taken list and the publish state, so
 * this module never touches a database and every rule is a unit test.
 */

/**
 * `"Kvällsrutin för Åhléns"` → `"kvallsrutin-for-ahlens"`.
 *
 * Diacritics are stripped through NFD decomposition, which covers å/ä/ö and the
 * rest of the accented Latin range in one pass. The two characters that do NOT
 * decompose (ø, æ) are mapped by hand — a Scandinavian title should not end up
 * with a dash where a vowel was.
 */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // An all-punctuation or all-CJK title still needs an addressable URL; the
  // suffix pass in resolveSlug turns repeats into item-2, item-3, …
  return slug === "" ? "item" : slug;
}

/**
 * The slug an item should carry after this save.
 *
 * @param desired  Free text the slug derives from (the Swedish title).
 * @param taken    Every slug already in use, EXCLUDING this item's own.
 * @param state    Whether the item is already published, and its current slug.
 */
export function resolveSlug(
  desired: string,
  taken: string[],
  state: { published: boolean; currentSlug: string | null },
): string {
  // Published means public. The title can change; the URL cannot.
  if (state.published && state.currentSlug) return state.currentSlug;

  const base = slugify(desired);
  const used = new Set(taken);
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
