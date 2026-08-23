/**
 * The public-page collection resolver — this project's provenance rule for
 * lists, one step looser than the core's.
 *
 * `loadCollection` (core) treats a BOUND database returning zero rows as truth:
 * the client emptied the list, so the page renders nothing. That is correct for
 * a project whose lists are SEEDED into D1 at deploy, which is what nicole-olmedo
 * does — there, "no rows" can only mean "deleted".
 *
 * This project deliberately does NOT seed (RUNBOOK §6.6 provenance: a row means
 * the client edited it, and seeding would make every field look edited on day
 * one). So here "no rows at all" means nobody has ever touched the list, and the
 * JSON defaults still apply — the same rule `content_kv` uses for scalars. Once
 * a single row exists the list is the client's, and it wins entirely: deleting
 * her way down to one stylist must not resurrect the other seventeen.
 *
 * The def arrives as a PARAMETER, never an import, so this module stays free of
 * `src/cms.config.ts` and the direction rule that keeps the core testable holds
 * one level up as well.
 *
 * `seedCollectionFromDefaults` is the ADMIN half of the same rule. Not seeding
 * keeps provenance honest, but it also means the client opens Stylister and
 * reads "Listan är tom" while the site shows eighteen of them — so the one
 * escape hatch is an explicit, one-press copy of the defaults into D1. It is
 * hers to press, which is exactly what makes the resulting rows real edits
 * rather than a deploy artefact.
 */
import {
  insertCollectionItem,
  listCollectionItems,
  loadCollection,
  validateCollectionItem,
} from "./cms/collections";
import type { CollectionDef } from "./cms/config-types";
import type { Database } from "./cms/db";

export type ResolvedCollection = {
  items: Record<string, unknown>[];
  /** `d1` only when real rows were served — the badge/notice signal. */
  source: "d1" | "fallback";
};

export async function resolveCollection(
  db: Database | null,
  def: CollectionDef,
): Promise<ResolvedCollection> {
  const loaded = await loadCollection(db, def);
  if (loaded.source === "d1" && loaded.items.length === 0) {
    return { items: def.jsonFallback() as Record<string, unknown>[], source: "fallback" };
  }
  return loaded;
}

export type SeedResult =
  | { ok: true; inserted: number }
  /**
   * `not_empty` is the client's problem (a row already exists — refuse) and
   * `invalid_default` is ours (a JSON default the schema rejects is a repo bug).
   * `index`/`field` name the offending row and property so the bug is findable
   * without reading eighteen objects by hand.
   */
  | { ok: false; error: "not_empty" | "invalid_default"; index?: number; field?: string };

/**
 * Copy a collection's JSON defaults into D1, once.
 *
 * IDEMPOTENT BY REFUSAL, not by merge: any existing row — draft included — means
 * the list is already the client's, and topping it up would duplicate every
 * entry she has not yet edited. Drafts count because the check asks "has anyone
 * ever touched this list", which is the same question `resolveCollection` asks.
 *
 * VALIDATE ALL, THEN INSERT. Every default goes through the ordinary
 * `validateCollectionItem` — the same gate a hand-typed row passes, so seeded
 * rows cannot hold a shape the admin form can never save again — and a single
 * rejection aborts before the first INSERT. A half-seeded list is worse than an
 * unseeded one: nine rows in D1 still beat eighteen in JSON on the public page.
 *
 * ORDER IS INSERTION ORDER. `insertCollectionItem` appends at `MAX(sort_order) + 1`,
 * so walking the fallback array in sequence reproduces the JSON order exactly —
 * the admin list comes up matching the page the client was just looking at.
 */
export async function seedCollectionFromDefaults(
  db: Database,
  def: CollectionDef,
  author: string,
  now: string,
): Promise<SeedResult> {
  const existing = await listCollectionItems(db, def.name, { includeDrafts: true });
  if (existing.length > 0) return { ok: false, error: "not_empty" };

  const rows: Record<string, unknown>[] = [];
  for (const [index, item] of (def.jsonFallback() as Record<string, unknown>[]).entries()) {
    const parsed = validateCollectionItem(def, item);
    if (!parsed.ok) {
      return { ok: false, error: "invalid_default", index, field: parsed.errors[0]?.field };
    }
    rows.push(parsed.value);
  }

  for (const row of rows) {
    await insertCollectionItem(db, def.name, row, author, now);
  }
  return { ok: true, inserted: rows.length };
}
