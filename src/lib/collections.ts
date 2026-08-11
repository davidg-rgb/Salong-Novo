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
 */
import { loadCollection } from "./cms/collections";
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
