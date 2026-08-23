/**
 * The competition record, shaped for the page (`/tavlingar`, `/en/competitions`).
 *
 * `content/awards.json` reads year → competition → items because that is how the
 * salon talks about it; `flatAwards()` flattens that away so every result is an
 * editable `collection_items` row. This module puts the grouping back — from the
 * FLAT rows, so the page renders identically whether the list came from the JSON
 * defaults or from D1 after the client reordered it in the admin.
 *
 * Pure and defensive by construction: a stored row is a JSON document the admin
 * wrote, so `year` may arrive as a string, `images` may hold anything, and a
 * missing field is a blank rather than a crashed page.
 */
import type { AwardRow } from "./content";

export type AwardCompetitionGroup = {
  competition: string;
  items: AwardRow[];
};

export type AwardYearGroup = {
  /** `NaN` when the row's year could not be read — such groups sort last. */
  year: number;
  competitions: AwardCompetitionGroup[];
};

/** The five result classes the page styles a pill for. */
export type ResultTone = "winner" | "nominated" | "finalist" | "entry" | "other";

/**
 * D1 hands back whatever SQLite stored, and the admin's number field round-trips
 * through a text input, so a year is a number OR a numeric string. Anything that
 * is neither becomes `NaN` rather than `0` — a bogus year must not sort itself
 * to the bottom of a list that starts at 2013.
 */
function toYear(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string" && value.trim() !== "") return Number(value.trim());
  return Number.NaN;
}

/**
 * Group flat rows into years (descending) → competitions → results.
 *
 * Within a year, competitions and their items keep FIRST-SEEN order — which is
 * JSON order for the defaults and `sort_order` for D1. That is the whole reason
 * the admin's drag-to-reorder means anything on this page: the only ordering
 * this function imposes is the one nobody wants to hand-maintain (newest year
 * first).
 */
export function groupAwards(rows: AwardRow[]): AwardYearGroup[] {
  const years = new Map<number, Map<string, AwardRow[]>>();

  for (const row of rows) {
    const year = toYear((row as { year: unknown }).year);
    // NaN !== NaN, so every unreadable year would open its own group under a
    // plain Map. Key them together under one sentinel instead.
    const key = Number.isNaN(year) ? Number.NEGATIVE_INFINITY : year;
    let competitions = years.get(key);
    if (!competitions) {
      competitions = new Map<string, AwardRow[]>();
      years.set(key, competitions);
    }
    const competition = String(row.competition ?? "");
    const items = competitions.get(competition);
    if (items) items.push(row);
    else competitions.set(competition, [row]);
  }

  return [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([key, competitions]) => ({
      year: key === Number.NEGATIVE_INFINITY ? Number.NaN : key,
      competitions: [...competitions.entries()].map(([competition, items]) => ({
        competition,
        items,
      })),
    }));
}

/**
 * Classify a Swedish result word so the page can style it.
 *
 * Prefix, not equality: the Nordic Hairshot row reads "Finalist (Sverige)", and
 * the client will write "Vinnare 2027" or "Nominerad (final)" sooner or later.
 * An unrecognised word is `"other"` and still renders — the pill is a garnish,
 * never a filter.
 */
export function resultTone(result: string): ResultTone {
  const word = (result ?? "").trim().toLowerCase();
  if (word.startsWith("vinnare")) return "winner";
  if (word.startsWith("nominerad")) return "nominated";
  if (word.startsWith("finalist")) return "finalist";
  if (word.startsWith("bidrag")) return "entry";
  return "other";
}

/**
 * The word on the result pill.
 *
 * SWEDISH IS THE AUTHOR'S. `result` is a free-text field the client edits in
 * Swedish, so on the SV page her own wording wins verbatim — the Nordic
 * Hairshot row reads "Finalist (Sverige)" and a lookup table would quietly
 * throw the qualifier away. English has no such source, so it takes the
 * translated tone word, falling back to the raw value when the tone is
 * unrecognised (better an untranslated word than a blank pill).
 *
 * `translated` is passed in rather than looked up here: this module stays free
 * of the dictionary, the same way the rest of `src/lib` does.
 */
export function resultLabel(result: string, locale: string, translated: string): string {
  const raw = (result ?? "").trim();
  return locale === "sv" ? raw || translated : translated || raw;
}

/**
 * Our own R2 namespace (`blog/<uuid>.jpg`) and a bundled asset shipped with the
 * build (`/images/awards-2025/dam-1.jpg`).
 *
 * These are COPIES of the two shapes `validateCollectionItem` accepts for an
 * `image` field (FORGE-MANIFEST divergence #15). The core keeps them private and
 * the core is vendored — not ours to edit — so they are restated here rather
 * than reached into. Keep them identical: a value the admin was allowed to SAVE
 * and this function then refuses to RENDER is a field that silently does
 * nothing, which is the exact failure mode #15 exists to prevent.
 */
const MEDIA_KEY = /^[a-z0-9][a-z0-9/_.-]*\.[a-z0-9]+$/i;
const STATIC_ASSET = /^\/[a-z0-9][a-z0-9/_.-]*\.[a-z0-9]+$/i;

/**
 * The renderable images on a result row, in order.
 *
 * Everything else is dropped in silence: an absolute `https://…` URL and a
 * protocol-relative `//host/x.jpg` are both refused (the character after a
 * leading slash must be alphanumeric), so a stored row cannot point the page's
 * `<img src>` at a third-party host. Resolution to a URL is `assetUrl`'s job —
 * this only decides what is ours to render.
 */
export function awardImages(row: { images?: unknown }): string[] {
  const raw = row?.images;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => STATIC_ASSET.test(entry) || MEDIA_KEY.test(entry));
}

/**
 * The names on a result, as one line. `separator` because the page wants a
 * typographic middot between them and the alt text wants a comma — a screen
 * reader saying "middot" between two names is noise.
 */
export function peopleLine(people: string[] | undefined, separator = " · "): string {
  if (!Array.isArray(people)) return "";
  return people
    .map((name) => String(name).trim())
    .filter((name) => name !== "")
    .join(separator);
}
