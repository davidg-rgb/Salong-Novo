export const prerender = false;
import type { APIRoute } from "astro";
import { bindings } from "../../../../lib/cms/bindings";
import { guardAdminRead, guardAdminWrite, json, type ApiError } from "../../../../lib/cms/http";
import {
  insertCollectionItem,
  listCollectionItems,
  reorderCollection,
  validateCollectionItem,
  validateIdList,
} from "../../../../lib/cms/collections";
import { CMS } from "../../../../cms.config";

/**
 * One collection (ARCHITECTURE §8.2, F-010).
 *
 * The route is GENERIC: it looks the definition up in `CMS.collections` and
 * passes it into the core validator. Adding a list to the site adds nothing
 * here — that is the whole point of the config-driven model (§12).
 *
 * POST is discriminated by the presence of `ids`: a body carrying them is a
 * reorder, anything else is a create. One endpoint because both are "write the
 * whole list's state", and a separate `/reorder` path would have to repeat the
 * name lookup and the guard for one UPDATE loop.
 */

function siteUrl(env: Partial<Env>, request: Request): string {
  return env.PUBLIC_SITE_URL ?? new URL(request.url).origin;
}

/** A collection this project actually declares, or null — an unknown name is a 404. */
function defOf(name: string | undefined) {
  return CMS.collections.find((collection) => collection.name === name) ?? null;
}

export const GET: APIRoute = async ({ request, params }) => {
  const env = await bindings();
  const guard = guardAdminRead(request, env, import.meta.env.PROD);
  if (!guard.ok) return guard.res;

  const def = defOf(params.name);
  if (!def) return json({ error: "not_found" } satisfies ApiError, 404);

  try {
    // Drafts included: the admin shows the truth of the table. No v1 write path
    // creates one — `status` is reserved (§6.7) — so this is future-proofing.
    return json({ items: await listCollectionItems(guard.db, def.name, { includeDrafts: true }) });
  } catch (error) {
    console.error("[admin/collections] list failed", error);
    return json({ error: "internal" } satisfies ApiError, 500);
  }
};

export const POST: APIRoute = async ({ request, params, locals }) => {
  const env = await bindings();
  const guard = guardAdminWrite(request, env, import.meta.env.PROD, siteUrl(env, request));
  if (!guard.ok) return guard.res;

  const def = defOf(params.name);
  if (!def) return json({ error: "not_found" } satisfies ApiError, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_input", field: "body" } satisfies ApiError, 400);
  }

  const payload = (body ?? {}) as { ids?: unknown; data?: unknown };

  if ("ids" in payload) {
    const ids = validateIdList(payload.ids);
    if (!ids.ok) return json(ids.errors[0], 400);
    try {
      await reorderCollection(guard.db, def.name, ids.value, new Date().toISOString());
      return json({ ok: true });
    } catch (error) {
      console.error("[admin/collections] reorder failed", error);
      return json({ error: "internal" } satisfies ApiError, 500);
    }
  }

  const parsed = validateCollectionItem(def, payload.data);
  if (!parsed.ok) return json(parsed.errors[0], 400);

  try {
    const item = await insertCollectionItem(
      guard.db,
      def.name,
      parsed.value,
      locals.adminEmail ?? "",
      new Date().toISOString(),
    );
    return json({ item }, 201);
  } catch (error) {
    console.error("[admin/collections] create failed", error);
    return json({ error: "internal" } satisfies ApiError, 500);
  }
};
