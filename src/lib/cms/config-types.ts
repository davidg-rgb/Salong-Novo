/**
 * The config vocabulary (ARCHITECTURE §6.7, §6.11, §6.14).
 *
 * CORE OWNS THE TYPES, THE INSTANCE OWNS THE DATA. Core modules receive config
 * VALUES as parameters and never import `src/cms.config.ts` — that direction
 * rule is what keeps the core project-agnostic and the whole layer testable
 * without standing up a project's content model.
 *
 * Adding a collection, an editable copy key or a content group is an edit to
 * `src/cms.config.ts`. It is never a migration and never a new endpoint.
 */

/**
 * `image`: the value is a media key (`posters/<uuid>.<ext>`); the admin renders
 * a picker backed by the upload endpoint and the media library. v1 limitation,
 * noted rather than hidden: image fields carry no alt slot (posters have their
 * own bilingual alts on the item; `seo.ogImage` needs none).
 *
 * `list`: bilingual string ARRAYS (`${name}_sv`/`${name}_en`), rendered as a
 * repeatable line input. It exists because `content/services.json` items carry
 * `bullets_sv`/`bullets_en`; without this kind the first admin save would strip
 * them silently, because unknown keys are never stored.
 */
export type FieldKind = "text" | "textarea" | "url" | "number" | "toggle" | "image" | "list";

/**
 * A field in a `CollectionDef` — keyed by `name` because the collection's JSON
 * payload is addressed by it (`bilingual` expands to `${name}_sv`/`${name}_en`).
 *
 * `readOnly` covers machine slugs like a service's `key`: accepted on create,
 * rendered as static text thereafter, and carried forward from the stored item
 * on update with client input ignored.
 */
export type FieldDef = {
  name: string;
  kind: FieldKind;
  /** Swedish admin label. */
  label: string;
  bilingual?: boolean;
  required?: boolean;
  maxLen?: number;
  /** `list` kind only. */
  maxItems?: number;
  readOnly?: boolean;
};

/**
 * A field in a `ContentGroupDef` — keyed by `key` because it addresses a
 * `content_kv` row (`site.contact.email`), not a JSON payload property.
 *
 * `bilingual` is EXPLICIT here even though `mergeSiteOverrides` detects pairing
 * from the `site.json` shape: the form has no JSON to inspect, so the flag is
 * what decides one input versus two.
 *
 * `placeholderUntilEdited` mirrors `site.json`'s `_status: PLACEHOLDER` markers
 * and drives the F-018 provenance badge. It is hand-set — a documented authoring
 * step, not an automatic sync.
 */
export type ContentFieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  bilingual?: boolean;
  hint?: string;
  placeholderUntilEdited?: boolean;
};

/** One grouped form under `/admin/content/[group]`. */
export type ContentGroupDef = {
  key: string;
  label: string;
  fields: ContentFieldDef[];
};

/**
 * The F-009 per-page copy allowlist. `keys` are BARE dictionary keys
 * (`home.heroTitle`); the `copy.` prefix is applied at storage and wire time by
 * `validateKvEntries` and `useT`, so there is exactly one prefixing seam.
 */
export type EditableCopyDef = {
  page: string;
  label: string;
  keys: { key: string; label: string; hint?: string }[];
};

/**
 * A generic list backed by `collection_items`. `jsonFallback` normalizes its
 * source to a BARE ITEM ARRAY — the seed sources have three different shapes
 * (bare array, `{_placeholder, items}` wrapper, array nested in `site.json`).
 */
export type CollectionDef = {
  name: string;
  label: string;
  fields: FieldDef[];
  orderable: boolean;
  jsonFallback: () => unknown[];
};

export type CollectionItem = {
  id: number;
  collection: string;
  data: Record<string, unknown>;
  sort_order: number;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
};

/**
 * One class of reference to a media key, used by the media library's in-use
 * warning and its force-delete path (§6.11).
 *
 * BIND CONTRACT: both `sql` and `clearSql` take exactly ONE bind value — the
 * media key. A statement that needs the key more than once uses the numbered
 * form `?1` so the caller never has to know the arity.
 *
 * `sql` MUST be a count query returning a single row with column `n`.
 *
 * A query WITHOUT `clearSql` is un-clearable: force-delete surfaces its label in
 * the warning instead of silently leaving a dangling reference behind.
 */
export type UsageQuery = {
  label: string;
  sql: string;
  clearSql?: string;
};

export type AdminNavItem = {
  href: string;
  /** A key into `strings.sv.ts`, not a literal — admin chrome is Swedish-only. */
  labelKey: string;
  icon: string;
};

/**
 * The per-project surface. One object, NO logic — config is data so the core
 * stays testable.
 *
 * Authoring rule enforced by `tests/cms-config.test.ts`: `contentGroups[].key`
 * and `editableCopy[].page` are unique across BOTH arrays, because they share
 * the `/admin/content/[group]` param namespace.
 */
export type CmsConfig = {
  contentGroups: ContentGroupDef[];
  editableCopy: EditableCopyDef[];
  collections: CollectionDef[];
  /** R2 key prefix for uploads, trailing slash included. */
  mediaPrefix: string;
  usageQueries: UsageQuery[];
  adminNav: AdminNavItem[];
};
