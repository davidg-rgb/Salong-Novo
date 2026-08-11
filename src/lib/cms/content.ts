/**
 * The `content_kv` layer (ARCHITECTURE §6.6).
 *
 * ROW EXISTENCE IS PROVENANCE. No row → the developer default (JSON /
 * dictionary) applies. A row present → the client has edited it and the row is
 * authoritative — including when its values are blank, which is exactly the
 * "hide this model-sheet row" signal.
 *
 * That single rule splits into TWO resolution primitives, and the split is
 * load-bearing:
 *
 *   `site.*` keys have no dictionary behind them, so `overrideValue` resolves a
 *   WHOLE ROW: both sides blank means intentional blank (`""`), and within a
 *   non-blank row a blank side borrows the other one — the site-wide
 *   never-half-translated convention.
 *
 *   `copy.*` keys DO have a dictionary behind them, so `overrideSide` resolves
 *   PER SIDE: a blank English side returns null and falls through to the English
 *   dictionary. An SV-only client edit must never shadow a real translation.
 */
import type { Database } from "./db";
import type { ApiError } from "./http";
import type { CmsConfig, FieldKind } from "./config-types";
// The locale set is hardwired to sv/en throughout the core — ADR-01's named v1
// limitation, not an oversight. A non-sv/en project pays a core generalization.
import type { Locale } from "../../i18n/routes";

export type ContentKvRow = {
  key: string;
  value_sv: string;
  value_en: string;
  updated_at: string;
  updated_by: string;
};

export type KvEntry = Pick<ContentKvRow, "key" | "value_sv" | "value_en">;

export type KvMap = Map<string, ContentKvRow>;

/** The per-request content bundle handed to pages through `Astro.locals`. */
export type CmsContent = {
  kv: KvMap | null;
  source: "d1" | "fallback";
};

/**
 * Whole-table read. The table is ≤ ~100 rows and there is no cache by design
 * (ADR-06: "publish → visible immediately" is the product), so this is one
 * query per SSR render.
 */
export async function listContentKv(db: Database): Promise<ContentKvRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM content_kv`)
    .all<ContentKvRow>();
  return results;
}

export function toKvMap(rows: ContentKvRow[]): KvMap {
  return new Map(rows.map((row) => [row.key, row]));
}

/**
 * The per-request bundle. NEVER throws: no binding or a failing query both
 * degrade to `{kv: null, source: "fallback"}`, and every consumer then renders
 * pure JSON/dictionary defaults — byte-identical to the pre-CMS site. That is
 * what makes the Vercel share window and a bindings-less `astro dev` work
 * (F-019) instead of 500ing.
 */
export async function loadCmsContent(db: Database | null): Promise<CmsContent> {
  if (!db) return { kv: null, source: "fallback" };
  try {
    return { kv: toKvMap(await listContentKv(db)), source: "d1" };
  } catch (error) {
    console.warn("[cms] content_kv read failed; falling back to JSON defaults", error);
    return { kv: null, source: "fallback" };
  }
}

/**
 * THE prefixing seam. `CMS.editableCopy` lists BARE dictionary keys
 * ("home.heroTitle") because that is what a developer reads in the dictionary;
 * storage namespaces them under `copy.` so a site fact and a copy override can
 * never collide in the one key space. Every place that crosses that boundary —
 * the allowlist, the admin form, `useT` — goes through this function, so there
 * is one definition of the mapping rather than three string concatenations that
 * have to agree.
 */
export function copyKey(bare: string): string {
  return `copy.${bare}`;
}

/** `site.*` resolution: the whole row decides. */
export function overrideValue(kv: KvMap | null, key: string, locale: Locale): string | null {
  const row = kv?.get(key);
  if (!row) return null;

  const sv = row.value_sv ?? "";
  const en = row.value_en ?? "";
  // Both sides blank is an INTENTIONAL BLANK, not a missing value: it is how the
  // client hides a model-sheet row instead of printing an empty measurement.
  if (sv.trim() === "" && en.trim() === "") return "";

  const [wanted, other] = locale === "sv" ? [sv, en] : [en, sv];
  return wanted.trim() !== "" ? wanted : other;
}

/** `copy.*` resolution: each side answers for itself, or defers to its dictionary. */
export function overrideSide(kv: KvMap | null, key: string, locale: Locale): string | null {
  const row = kv?.get(key);
  if (!row) return null;
  const side = (locale === "sv" ? row.value_sv : row.value_en) ?? "";
  return side.trim() !== "" ? side : null;
}

/**
 * Length caps by field kind. `ContentFieldDef` carries no per-field `maxLen` on
 * purpose: a cap that has to be authored per field is a cap that is forgotten,
 * and the kind already says what the field is for.
 */
const MAX_LEN: Record<FieldKind, number> = {
  text: 300,
  textarea: 2000,
  url: 500,
  number: 32,
  toggle: 8,
  image: 200,
  list: 2000,
};

/** Every writable key, mapped to the kind that decides its length cap. */
function writableKeys(config: CmsConfig): Map<string, FieldKind> {
  const allowed = new Map<string, FieldKind>();
  for (const group of config.contentGroups) {
    for (const field of group.fields) allowed.set(field.key, field.kind);
  }
  for (const page of config.editableCopy) {
    // Copy overrides are always prose; the dictionary has no kinds.
    for (const entry of page.keys) allowed.set(copyKey(entry.key), "textarea");
  }
  return allowed;
}

/**
 * Writes are ALLOWLISTED. The admin form is not the boundary — a hand-rolled PUT
 * naming `site.hacked.key` has to be a 400, because `mergeSiteOverrides` walks
 * whatever path a key names.
 *
 * Blank values pass: they are the intentional-blank signal, and rejecting them
 * would make "hide this row" impossible to express.
 */
export function validateKvEntries(
  config: CmsConfig,
  entries: unknown,
): { ok: true; value: KvEntry[] } | { ok: false; errors: ApiError[] } {
  if (!Array.isArray(entries)) {
    return { ok: false, errors: [{ error: "invalid_input", field: "entries", detail: "bad_shape" }] };
  }

  const allowed = writableKeys(config);
  const errors: ApiError[] = [];
  const value: KvEntry[] = [];

  for (const raw of entries) {
    const entry = raw as Partial<KvEntry> | null;
    const key = typeof entry?.key === "string" ? entry.key : "";
    const kind = allowed.get(key);
    if (kind === undefined) {
      errors.push({ error: "invalid_input", field: key || "key", detail: "unknown" });
      continue;
    }
    if (typeof entry?.value_sv !== "string" || typeof entry?.value_en !== "string") {
      errors.push({ error: "invalid_input", field: key, detail: "bad_shape" });
      continue;
    }
    if (entry.value_sv.length > MAX_LEN[kind] || entry.value_en.length > MAX_LEN[kind]) {
      errors.push({ error: "invalid_input", field: key, detail: "too_long" });
      continue;
    }
    value.push({ key, value_sv: entry.value_sv, value_en: entry.value_en });
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export async function upsertContentKv(
  db: Database,
  entries: KvEntry[],
  email: string,
  now: string,
): Promise<void> {
  for (const entry of entries) {
    await db
      .prepare(
        `INSERT INTO content_kv (key, value_sv, value_en, updated_at, updated_by)
              VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_sv = excluded.value_sv,
                                        value_en = excluded.value_en,
                                        updated_at = excluded.updated_at,
                                        updated_by = excluded.updated_by`,
      )
      .bind(entry.key, entry.value_sv, entry.value_en, now, email)
      .run();
  }
}

/**
 * Deletion is looser than writing on purpose: a key that WAS allowlisted and no
 * longer is still has a row on disk overriding a default nobody can see. Exact
 * matches against existing rows are the escape hatch that keeps such an orphan
 * removable (P1 W-2) without letting an arbitrary string through.
 */
export function validateKvKeys(
  config: CmsConfig,
  keys: unknown,
  existing: readonly string[] = [],
): { ok: true; value: string[] } | { ok: false; errors: ApiError[] } {
  if (!Array.isArray(keys)) {
    return { ok: false, errors: [{ error: "invalid_input", field: "keys", detail: "bad_shape" }] };
  }

  const allowed = writableKeys(config);
  const onDisk = new Set(existing);
  const errors: ApiError[] = [];
  const value: string[] = [];

  for (const raw of keys) {
    const key = typeof raw === "string" ? raw : "";
    if (!allowed.has(key) && !onDisk.has(key)) {
      errors.push({ error: "invalid_input", field: key || "key", detail: "unknown" });
      continue;
    }
    value.push(key);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/**
 * "Återställ till standard" — REMOVE the row rather than blank it. Blanking
 * would store an intentional blank, which is the opposite of what the client
 * asked for; removing it hands authority back to the JSON/dictionary default and
 * makes the F-018 placeholder badge two-way.
 */
export async function deleteContentKv(db: Database, keys: string[]): Promise<number> {
  let removed = 0;
  for (const key of keys) {
    const before = await db.prepare(`SELECT key FROM content_kv WHERE key = ?`).bind(key).first();
    if (!before) continue;
    await db.prepare(`DELETE FROM content_kv WHERE key = ?`).bind(key).run();
    removed += 1;
  }
  return removed;
}

/** Walk a dotted path into a plain object, or null if any hop is missing. */
function containerAt(root: unknown, path: string[]): Record<string, unknown> | null {
  let node: unknown = root;
  for (const part of path) {
    if (!node || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[part];
  }
  return node && typeof node === "object" ? (node as Record<string, unknown>) : null;
}

/**
 * Apply every `site.*` row onto a deep clone of the JSON defaults.
 *
 * PAIRING IS DETECTED FROM THE JSON SHAPE, never from an enumerated field list
 * (P2 Adv-W3): if the target object has a `<leaf>_sv` property the key is a
 * bilingual pair and both sides are written; otherwise the leaf is a plain value
 * and the Swedish side is the value. The real `site.json` mixes the two inside
 * the same object (`brand.name` next to `brand.motto_sv`), which is exactly what
 * an enumeration gets wrong.
 *
 * Generic in the base type so the core stays project-agnostic — it never imports
 * `content/site.json`, it just clones and writes whatever it is handed.
 */
export function mergeSiteOverrides<T>(base: T, kv: KvMap | null): T {
  if (!kv || kv.size === 0) return base;

  const merged = structuredClone(base);
  for (const key of kv.keys()) {
    const parts = key.split(".");
    if (parts.shift() !== "site" || parts.length < 2) continue;

    const leaf = parts.pop()!;
    const target = containerAt(merged, parts);
    // A key naming a path this JSON does not have is config drift. The required
    // config test fails on it in CI; at runtime it is simply not applied.
    if (!target) continue;

    if (`${leaf}_sv` in target) {
      target[`${leaf}_sv`] = overrideValue(kv, key, "sv") ?? "";
      target[`${leaf}_en`] = overrideValue(kv, key, "en") ?? "";
    } else if (leaf in target) {
      target[leaf] = overrideValue(kv, key, "sv") ?? "";
    }
  }
  return merged;
}
