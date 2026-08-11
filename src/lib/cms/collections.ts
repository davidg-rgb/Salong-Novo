/**
 * Generic lists (ARCHITECTURE §6.7, ADR-04).
 *
 * ONE TABLE, ONE ROUTE, ONE ADMIN PAGE — and a per-project field schema that
 * drives validation and form rendering alike. That is the whole trade: services,
 * testimonials, socials and stats are five-row lists, and a bespoke table each
 * would turn "the next project needs a FAQ" into a migration plus queries plus
 * endpoints. Here it is a `CollectionDef` in `src/cms.config.ts`.
 *
 * THE SCHEMA IS THE VALIDATOR. `validateCollectionItem` reads the same
 * `FieldDef[]` the admin form renders from, so a field that exists on screen is
 * a field that survives a save — and one that does not is stripped rather than
 * stored. That stripping is why `readOnly` carry-forward exists: without it the
 * first save of a seeded service would silently drop its machine `key`.
 */
import type { Database } from "./db";
import type { ApiError } from "./http";
import type { CollectionDef, CollectionItem, FieldDef, FieldKind } from "./config-types";

/** The raw `SELECT *` row: `data` is still JSON text here. */
type CollectionItemDbRow = {
  id: number;
  collection: string;
  data: string;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

/** Default length caps by kind, overridable per field with `maxLen`. */
const MAX_LEN: Record<FieldKind, number> = {
  text: 300,
  textarea: 2000,
  url: 500,
  image: 200,
  /** Per ENTRY, not for the whole list. */
  list: 300,
  number: 32,
  toggle: 8,
};

const DEFAULT_MAX_ITEMS = 20;

/** Our own R2 namespace: `posters/<uuid>.<ext>`. Anything else is not ours to render. */
const MEDIA_KEY = /^[a-z0-9][a-z0-9/_.-]*\.[a-z0-9]+$/i;

/**
 * A bundled asset shipped with the build (`/images/staff/<slug>.jpg`) — the
 * OTHER legal shape for an `image` field, and the one the JSON defaults layer
 * uses (see `stylistPhotoUrl` in `src/lib/content.ts`). Without it a default
 * portrait would be un-saveable: the client opens an unedited row, presses save,
 * and the field she never touched is rejected. The character after the slash
 * must be alphanumeric, so a protocol-relative `//host/x.jpg` is still refused.
 */
const STATIC_ASSET = /^\/[a-z0-9][a-z0-9/_.-]*\.[a-z0-9]+$/i;

function invalid(field: string, detail: string): ApiError {
  return { error: "invalid_input", field, detail };
}

/** The payload property names a field owns — two of them when bilingual. */
function propsOf(field: FieldDef): string[] {
  return field.bilingual ? [`${field.name}_sv`, `${field.name}_en`] : [field.name];
}

/**
 * One scalar property. Returns the value to store, or an error.
 *
 * `required` is checked on the SWEDISH side only for a bilingual field: Swedish
 * is canonical and every renderer falls back to it, so demanding an English
 * translation before a save would block the client on a translation she may not
 * have (R-5).
 */
function scalar(
  field: FieldDef,
  prop: string,
  raw: unknown,
  isPrimarySide: boolean,
): { value: unknown } | { error: ApiError } {
  const max = field.maxLen ?? MAX_LEN[field.kind];

  if (field.kind === "number") {
    const num = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (num === undefined || num === null || num === "") {
      if (field.required) return { error: invalid(prop, "required") };
      return { value: 0 };
    }
    if (typeof num !== "number" || !Number.isFinite(num)) {
      return { error: invalid(prop, "bad_shape") };
    }
    return { value: num };
  }

  if (field.kind === "toggle") {
    if (raw === true || raw === 1 || raw === "1" || raw === "true") return { value: true };
    if (raw === false || raw === 0 || raw === "0" || raw === "false" || raw === undefined) {
      return { value: false };
    }
    return { error: invalid(prop, "bad_shape") };
  }

  const text = raw === undefined || raw === null ? "" : raw;
  if (typeof text !== "string") return { error: invalid(prop, "bad_shape") };
  if (text.length > max) return { error: invalid(prop, "too_long") };
  if (field.required && isPrimarySide && text.trim() === "") {
    return { error: invalid(prop, "required") };
  }

  if (text.trim() !== "") {
    if (field.kind === "url") {
      try {
        new URL(text);
      } catch {
        return { error: invalid(prop, "unparseable") };
      }
    }
    if (field.kind === "image" && !MEDIA_KEY.test(text) && !STATIC_ASSET.test(text)) {
      return { error: invalid(prop, "bad_shape") };
    }
  }

  return { value: text };
}

/** One `list` property: a bilingual string array rendered as repeatable lines. */
function stringList(
  field: FieldDef,
  prop: string,
  raw: unknown,
  isPrimarySide: boolean,
): { value: unknown } | { error: ApiError } {
  const items = raw === undefined || raw === null ? [] : raw;
  if (!Array.isArray(items)) return { error: invalid(prop, "bad_shape") };

  const max = field.maxLen ?? MAX_LEN.list;
  const kept: string[] = [];
  for (const entry of items) {
    if (typeof entry !== "string") return { error: invalid(prop, "bad_shape") };
    if (entry.length > max) return { error: invalid(prop, "too_long") };
    // Blank lines are how a repeatable input looks mid-edit, not content — so
    // they are dropped BEFORE the count, or a trailing newline would read as an
    // extra bullet and trip the cap.
    if (entry.trim() !== "") kept.push(entry);
  }
  if (kept.length > (field.maxItems ?? DEFAULT_MAX_ITEMS)) {
    return { error: invalid(prop, "too_many") };
  }
  if (field.required && isPrimarySide && kept.length === 0) {
    return { error: invalid(prop, "required") };
  }
  return { value: kept };
}

/**
 * Validate an item against its collection's schema.
 *
 * UNKNOWN KEYS ARE STRIPPED, which is the whole reason `stored` exists: on
 * update, a `readOnly` field is copied from the row rather than read from the
 * request, so a machine slug the form renders as static text survives a save the
 * client never touched. Error order follows field order, so the first message a
 * client sees is the first field on screen.
 */
export function validateCollectionItem(
  def: CollectionDef,
  data: unknown,
  stored?: Record<string, unknown>,
): { ok: true; value: Record<string, unknown> } | { ok: false; errors: ApiError[] } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: [invalid("data", "bad_shape")] };
  }

  const input = data as Record<string, unknown>;
  const errors: ApiError[] = [];
  const value: Record<string, unknown> = {};

  for (const field of def.fields) {
    const props = propsOf(field);

    if (field.readOnly && stored) {
      // Carry-forward, client input ignored. An absent stored value stays absent
      // rather than becoming "" — the row keeps exactly the shape it had.
      for (const prop of props) {
        if (prop in stored) value[prop] = stored[prop];
      }
      continue;
    }

    props.forEach((prop, index) => {
      const isPrimarySide = index === 0;
      const result =
        field.kind === "list"
          ? stringList(field, prop, input[prop], isPrimarySide)
          : scalar(field, prop, input[prop], isPrimarySide);
      if ("error" in result) errors.push(result.error);
      else value[prop] = result.value;
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** Ordered ids for a reorder POST — the collections half of §6.9's pair. */
export function validateIdList(
  raw: unknown,
): { ok: true; value: number[] } | { ok: false; errors: ApiError[] } {
  if (!Array.isArray(raw) || raw.length > 500) {
    return { ok: false, errors: [invalid("ids", "bad_shape")] };
  }
  const ids: number[] = [];
  for (const entry of raw) {
    const id = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, errors: [invalid("ids", "bad_shape")] };
    if (ids.includes(id)) return { ok: false, errors: [invalid("ids", "duplicate")] };
    ids.push(id);
  }
  return { ok: true, value: ids };
}

/**
 * A row with unparseable JSON is SKIPPED with a warning rather than thrown: one
 * corrupt payload must not take the public page down with it.
 */
function mapRow(raw: CollectionItemDbRow): CollectionItem | null {
  let data: unknown;
  try {
    data = JSON.parse(raw.data);
  } catch {
    console.warn(`[cms] collection_items #${raw.id} holds unparseable JSON — skipped`);
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    console.warn(`[cms] collection_items #${raw.id} is not a JSON object — skipped`);
    return null;
  }
  return {
    id: Number(raw.id),
    collection: raw.collection,
    data: data as Record<string, unknown>,
    sort_order: Number(raw.sort_order),
    status: raw.status === "draft" ? "draft" : "published",
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export async function listCollectionItems(
  db: Database,
  name: string,
  opts: { includeDrafts: boolean },
): Promise<CollectionItem[]> {
  const sql = opts.includeDrafts
    ? `SELECT * FROM collection_items WHERE collection = ? ORDER BY sort_order ASC, id ASC`
    : `SELECT * FROM collection_items WHERE collection = ? AND status = 'published'
         ORDER BY sort_order ASC, id ASC`;
  const { results } = await db.prepare(sql).bind(name).all<CollectionItemDbRow>();
  return results.map(mapRow).filter((item): item is CollectionItem => item !== null);
}

/**
 * The public-page loader.
 *
 * A BOUND database returning zero rows is TRUTH — the client deleted the list —
 * so it renders empty. Only the ABSENCE of a database, or a query that throws,
 * falls back to the JSON defaults (F-019). Mixing the two would mean a client
 * who deletes a service watches it come back.
 */
export async function loadCollection(
  db: Database | null,
  def: CollectionDef,
): Promise<{ items: Record<string, unknown>[]; source: "d1" | "fallback" }> {
  if (!db) return { items: def.jsonFallback() as Record<string, unknown>[], source: "fallback" };
  try {
    const rows = await listCollectionItems(db, def.name, { includeDrafts: false });
    return { items: rows.map((row) => row.data), source: "d1" };
  } catch (error) {
    console.warn(`[cms] collection "${def.name}" read failed; falling back to JSON`, error);
    return { items: def.jsonFallback() as Record<string, unknown>[], source: "fallback" };
  }
}

/** Backs the PUT chain: the 404, and the `readOnly` carry-forward source. */
export async function getCollectionItem(db: Database, id: number): Promise<CollectionItem | null> {
  const row = await db
    .prepare(`SELECT * FROM collection_items WHERE id = ?`)
    .bind(id)
    .first<CollectionItemDbRow>();
  return row ? mapRow(row) : null;
}

export async function insertCollectionItem(
  db: Database,
  name: string,
  data: Record<string, unknown>,
  email: string,
  now: string,
): Promise<CollectionItem> {
  // New items land LAST in their list, the same rule the portfolio uses — a new
  // service appearing at the top of a deliberately ordered page is a surprise.
  const max = await db
    .prepare(`SELECT MAX(sort_order) AS n FROM collection_items WHERE collection = ?`)
    .bind(name)
    .first<{ n: number | null }>();
  const sortOrder = (max?.n ?? -1) + 1;

  const row = await db
    .prepare(
      `INSERT INTO collection_items (collection, data, sort_order, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(name, JSON.stringify(data), sortOrder, now, now, email)
    .first<CollectionItemDbRow>();

  if (!row) throw new Error("collection insert returned no row");
  const item = mapRow(row);
  if (!item) throw new Error("collection insert returned an unreadable row");
  return item;
}

export async function updateCollectionItem(
  db: Database,
  id: number,
  data: Record<string, unknown>,
  email: string,
  now: string,
): Promise<CollectionItem | null> {
  // sort_order is deliberately absent from the SET: an edit must not undo a
  // reorder (the portfolio learned this the same way — §6.9).
  const row = await db
    .prepare(
      `UPDATE collection_items SET data = ?, updated_at = ?, updated_by = ?
        WHERE id = ? RETURNING *`,
    )
    .bind(JSON.stringify(data), now, email, id)
    .first<CollectionItemDbRow>();
  return row ? mapRow(row) : null;
}

export async function deleteCollectionItem(db: Database, id: number): Promise<boolean> {
  const before = await db.prepare(`SELECT id FROM collection_items WHERE id = ?`).bind(id).first();
  if (!before) return false;
  await db.prepare(`DELETE FROM collection_items WHERE id = ?`).bind(id).run();
  return true;
}

/**
 * `sort_order` becomes the array index. The `collection = ?` guard makes a stale
 * or cross-collection id a no-op rather than a corruption — two admin tabs can
 * race and the loser simply re-applies its order from the next page load
 * (ADR-07, single operator).
 */
export async function reorderCollection(
  db: Database,
  name: string,
  orderedIds: number[],
  now: string,
): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await db
      .prepare(
        `UPDATE collection_items SET sort_order = ?, updated_at = ?
          WHERE id = ? AND collection = ?`,
      )
      .bind(index, now, id, name)
      .run();
  }
}
