/**
 * Editor core — pure, caret-correct form/transform helpers for the admin post
 * editor. NO DOM, NO fetch. The vanilla controller (`src/admin/editor.client.ts`)
 * reads `{value, start, end}` off the textarea, calls these, and writes the
 * result back (restoring the selection). See ARCHITECTURE §10.6 / §10.9.
 *
 * Every caret transform takes a `Selection` and returns an `EditResult` — the new
 * string plus the new selection range so the controller can restore it exactly.
 */
import { slugify } from "./slug";
import type { PostWriteRequest } from "./admin-api";

export interface Selection {
  value: string;
  start: number;
  end: number;
}
export interface EditResult {
  value: string;
  start: number;
  end: number;
}

/** Clamp an index into the valid [0, len] range. */
function clamp(n: number, len: number): number {
  if (n < 0) return 0;
  if (n > len) return len;
  return n;
}

/** Normalize a selection so start <= end and both are in range. */
function normalize(sel: Selection): { value: string; start: number; end: number } {
  const value = sel.value ?? "";
  let start = clamp(sel.start ?? 0, value.length);
  let end = clamp(sel.end ?? 0, value.length);
  if (start > end) [start, end] = [end, start];
  return { value, start, end };
}

/**
 * Bold/italic. Toggles: if the selection (or the chars immediately surrounding
 * an empty/zero-width selection) is already wrapped in `marker`, unwrap; else
 * wrap the selection (or insert `placeholder` wrapped, caret inside, if empty).
 */
export function wrapInline(
  sel: Selection,
  marker: string,
  placeholder: string,
): EditResult {
  const { value, start, end } = normalize(sel);
  const m = marker;
  const mLen = m.length;
  const selected = value.slice(start, end);

  // Case 1: selection itself begins+ends with the marker → unwrap inside.
  if (
    selected.length >= 2 * mLen &&
    selected.startsWith(m) &&
    selected.endsWith(m)
  ) {
    const inner = selected.slice(mLen, selected.length - mLen);
    const next = value.slice(0, start) + inner + value.slice(end);
    return { value: next, start, end: start + inner.length };
  }

  // Case 2: markers sit immediately OUTSIDE the selection → unwrap (strip them).
  const before = value.slice(start - mLen, start);
  const after = value.slice(end, end + mLen);
  if (before === m && after === m) {
    const next = value.slice(0, start - mLen) + selected + value.slice(end + mLen);
    return { value: next, start: start - mLen, end: end - mLen };
  }

  // Case 3: empty selection → insert placeholder wrapped, caret around placeholder.
  if (start === end) {
    const insert = m + placeholder + m;
    const next = value.slice(0, start) + insert + value.slice(start);
    const innerStart = start + mLen;
    return { value: next, start: innerStart, end: innerStart + placeholder.length };
  }

  // Case 4: wrap the selection.
  const wrapped = m + selected + m;
  const next = value.slice(0, start) + wrapped + value.slice(end);
  return { value: next, start: start + mLen, end: end + mLen };
}

/** Find the [lineStart, lineEnd) char range of every line touched by [start,end]. */
function lineRangesIn(
  value: string,
  start: number,
  end: number,
): Array<{ from: number; to: number }> {
  // Expand to the start of the first line and the end of the last line.
  let blockStart = start;
  while (blockStart > 0 && value[blockStart - 1] !== "\n") blockStart--;
  let blockEnd = end;
  // A zero-width selection at a line start should still target that one line.
  while (blockEnd < value.length && value[blockEnd] !== "\n") blockEnd++;
  // If selection ends exactly at a line boundary (end is on a newline that began
  // a new line via a trailing selection), don't pull in the following empty line:
  // blockEnd currently points at the newline (or EOF). Good.

  const ranges: Array<{ from: number; to: number }> = [];
  let from = blockStart;
  for (let i = blockStart; i <= blockEnd; i++) {
    if (i === blockEnd || value[i] === "\n") {
      ranges.push({ from, to: i });
      from = i + 1;
    }
  }
  return ranges;
}

/**
 * Block prefix ("## ", "> "). Toggles per selected line: removes the prefix if
 * present on a line, else adds it. Idempotent (apply twice → back to start).
 * The selection is widened to cover the full transformed block.
 */
export function prefixBlock(sel: Selection, prefix: string): EditResult {
  const { value, start, end } = normalize(sel);
  const ranges = lineRangesIn(value, start, end);
  if (ranges.length === 0) {
    return { value, start, end };
  }

  // Decide direction: add only if at least one line is missing the prefix; if
  // every line already has it, remove. (Mirrors how list/heading toggles feel.)
  const lines = ranges.map((r) => value.slice(r.from, r.to));
  const allHave = lines.every((l) => l.startsWith(prefix));
  const adding = !allHave;

  const outLines: string[] = [];
  let delta = 0; // total length change, to shift selection end
  for (const line of lines) {
    let nextLine: string;
    if (adding) {
      nextLine = line.startsWith(prefix) ? line : prefix + line;
    } else {
      nextLine = line.startsWith(prefix) ? line.slice(prefix.length) : line;
    }
    delta += nextLine.length - line.length;
    outLines.push(nextLine);
  }
  const out = outLines.join("\n");

  const blockStart = ranges[0]!.from;
  const blockEnd = ranges[ranges.length - 1]!.to;
  const next = value.slice(0, blockStart) + out + value.slice(blockEnd);
  // Select the whole transformed block.
  return { value: next, start: blockStart, end: blockEnd + delta };
}

/** Insert a Markdown link. text || selection || "länk" as the label. */
export function insertLink(sel: Selection, url: string, text?: string): EditResult {
  const { value, start, end } = normalize(sel);
  const selected = value.slice(start, end);
  const label = (text && text.length > 0 ? text : selected) || "länk";
  const link = `[${label}](${url})`;
  const next = value.slice(0, start) + link + value.slice(end);
  // Place caret to select the label (so the user can retype it immediately).
  const labelStart = start + 1; // after "["
  return { value: next, start: labelStart, end: labelStart + label.length };
}

/** Insert an image at the caret: ![alt](key). Uses the raw key/url passed. */
export function insertImage(sel: Selection, key: string, alt: string): EditResult {
  const { value, start, end } = normalize(sel);
  const img = `![${alt}](${key})`;
  const next = value.slice(0, start) + img + value.slice(end);
  const caret = start + img.length;
  return { value: next, start: caret, end: caret };
}

/**
 * List toggle. Per line: unordered `- ` or ordered `1. ` (ordered renumbers).
 * Toggles: if every touched line already carries the matching list marker,
 * strip it; else apply it. Idempotent round-trip.
 */
export function toggleList(sel: Selection, ordered: boolean): EditResult {
  const { value, start, end } = normalize(sel);
  const ranges = lineRangesIn(value, start, end);
  if (ranges.length === 0) {
    return { value, start, end };
  }
  const lines = ranges.map((r) => value.slice(r.from, r.to));

  const unorderedRe = /^- /;
  const orderedRe = /^\d+\. /;
  const matcher = ordered ? orderedRe : unorderedRe;
  const allHave = lines.every((l) => matcher.test(l));
  const adding = !allHave;

  const outLines: string[] = [];
  let delta = 0;
  let counter = 1;
  for (const line of lines) {
    let nextLine: string;
    if (adding) {
      // Strip the OTHER list marker first so toggling between list types is clean.
      const stripped = line.replace(unorderedRe, "").replace(orderedRe, "");
      nextLine = ordered ? `${counter}. ${stripped}` : `- ${stripped}`;
      counter++;
    } else {
      nextLine = line.replace(matcher, "");
    }
    delta += nextLine.length - line.length;
    outLines.push(nextLine);
  }
  const out = outLines.join("\n");

  const blockStart = ranges[0]!.from;
  const blockEnd = ranges[ranges.length - 1]!.to;
  const next = value.slice(0, blockStart) + out + value.slice(blockEnd);
  return { value: next, start: blockStart, end: blockEnd + delta };
}

export interface PostDraft {
  id?: number;
  title: string;
  slug: string;
  slugManual: boolean;
  locale: "sv" | "en";
  excerpt: string;
  coverImage: string | null;
  body: string;
  author: string;
  seoTitle: string;
  seoDesc: string;
  status: "draft" | "published";
}

/** Resolved client-side slug: manual override verbatim, else slugify(title). */
export function nextSlug(draft: PostDraft): string {
  return draft.slugManual ? draft.slug : slugify(draft.title);
}

export type FieldError = { field: keyof PostDraft; code: string };

/**
 * Client-side draft validation (the server re-validates authoritatively).
 * - title always required (`title_required`)
 * - locale must be sv|en (`invalid_locale`)
 * - publishing requires non-empty body (`body_required`) + excerpt (`excerpt_required`)
 * Returns every applicable error.
 */
export function validateDraft(draft: PostDraft): FieldError[] {
  const errors: FieldError[] = [];
  if (!draft.title || draft.title.trim().length === 0) {
    errors.push({ field: "title", code: "title_required" });
  }
  if (draft.locale !== "sv" && draft.locale !== "en") {
    errors.push({ field: "locale", code: "invalid_locale" });
  }
  if (draft.status === "published") {
    if (!draft.body || draft.body.trim().length === 0) {
      errors.push({ field: "body", code: "body_required" });
    }
    if (!draft.excerpt || draft.excerpt.trim().length === 0) {
      errors.push({ field: "excerpt", code: "excerpt_required" });
    }
  }
  return errors;
}

/**
 * Character counter with a four-state band:
 * - len 0            → "empty"
 * - ideal[0]..ideal[1] (inclusive) → "ok"
 * - >0 and outside ideal but ≤ hard → "warn"
 * - > hard           → "over"
 */
export function counter(
  text: string,
  ideal: [number, number],
  hard: number,
): { len: number; state: "empty" | "ok" | "warn" | "over" } {
  const len = (text ?? "").length;
  if (len === 0) return { len, state: "empty" };
  if (len > hard) return { len, state: "over" };
  if (len >= ideal[0] && len <= ideal[1]) return { len, state: "ok" };
  return { len, state: "warn" };
}

/**
 * Serialize a draft into the API write payload. ALWAYS sends an explicit slug
 * (= nextSlug(draft)). `id` is included only when present (create omits it).
 */
export function toApiBody(draft: PostDraft): PostWriteRequest {
  const body: PostWriteRequest = {
    title: draft.title,
    locale: draft.locale,
    body: draft.body,
    excerpt: draft.excerpt,
    coverImage: draft.coverImage,
    author: draft.author,
    status: draft.status,
    seoTitle: draft.seoTitle,
    seoDesc: draft.seoDesc,
    slug: nextSlug(draft),
  };
  if (draft.id !== undefined) {
    body.id = draft.id;
  }
  return body;
}

/** Deep-compare the meaningful draft fields. True when `current` differs from `saved`. */
export function isDirty(current: PostDraft, saved: PostDraft): boolean {
  return (
    current.id !== saved.id ||
    current.title !== saved.title ||
    current.slug !== saved.slug ||
    current.slugManual !== saved.slugManual ||
    current.locale !== saved.locale ||
    current.excerpt !== saved.excerpt ||
    current.coverImage !== saved.coverImage ||
    current.body !== saved.body ||
    current.author !== saved.author ||
    current.seoTitle !== saved.seoTitle ||
    current.seoDesc !== saved.seoDesc ||
    current.status !== saved.status
  );
}
