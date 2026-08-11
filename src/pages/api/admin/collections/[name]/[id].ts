export const prerender = false;
import type { APIRoute } from "astro";
import { bindings } from "../../../../../lib/cms/bindings";
import { guardAdminWrite, json, type ApiError } from "../../../../../lib/cms/http";
import {
  deleteCollectionItem,
  getCollectionItem,
  updateCollectionItem,
  validateCollectionItem,
} from "../../../../../lib/cms/collections";
import { CMS } from "../../../../../cms.config";

/**
 * One item in one collection (ARCHITECTURE §8.2).
 *
 * PUT fetches the stored item BEFORE validating, and not only for the 404: the
 * stored data is what `readOnly` fields are carried forward from. Without it the
 * first save of a seeded service would drop its machine `key`, because unknown
 * keys are stripped and the form sends the field as static text (§6.7).
 */

function siteUrl(env: Partial<Env>, request: Request): string {
  return env.PUBLIC_SITE_URL ?? new URL(request.url).origin;
}

function defOf(name: string | undefined) {
  return CMS.collections.find((collection) => collection.name === name) ?? null;
}

/** A positive integer, or null — anything else is a 404, not a 400. */
function itemId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const PUT: APIRoute = async ({ request, params, locals }) => {
  const env = await bindings();
  const guard = guardAdminWrite(request, env, import.meta.env.PROD, siteUrl(env, request));
  if (!guard.ok) return guard.res;

  const def = defOf(params.name);
  const id = itemId(params.id);
  if (!def || id === null) return json({ error: "not_found" } satisfies ApiError, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_input", field: "body" } satisfies ApiError, 400);
  }

  try {
    const stored = await getCollectionItem(guard.db, id);
    if (!stored || stored.collection !== def.name) {
      return json({ error: "not_found" } satisfies ApiError, 404);
    }

    const parsed = validateCollectionItem(def, (body as { data?: unknown } | null)?.data, stored.data);
    if (!parsed.ok) return json(parsed.errors[0], 400);

    const item = await updateCollectionItem(
      guard.db,
      id,
      parsed.value,
      locals.adminEmail ?? "",
      new Date().toISOString(),
    );
    if (!item) return json({ error: "not_found" } satisfies ApiError, 404);
    return json({ item });
  } catch (error) {
    console.error("[admin/collections/:id] update failed", error);
    return json({ error: "internal" } satisfies ApiError, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const env = await bindings();
  const guard = guardAdminWrite(request, env, import.meta.env.PROD, siteUrl(env, request));
  if (!guard.ok) return guard.res;

  const def = defOf(params.name);
  const id = itemId(params.id);
  if (!def || id === null) return json({ error: "not_found" } satisfies ApiError, 404);

  try {
    const stored = await getCollectionItem(guard.db, id);
    // The name in the URL has to match the row's own collection, or deleting
    // /socials/7 could remove a testimonial.
    if (!stored || stored.collection !== def.name) {
      return json({ error: "not_found" } satisfies ApiError, 404);
    }
    await deleteCollectionItem(guard.db, id);
    return json({ ok: true });
  } catch (error) {
    console.error("[admin/collections/:id] delete failed", error);
    return json({ error: "internal" } satisfies ApiError, 500);
  }
};
