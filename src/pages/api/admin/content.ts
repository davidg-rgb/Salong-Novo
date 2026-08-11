export const prerender = false;
import type { APIRoute } from "astro";
import { bindings } from "../../../lib/cms/bindings";
import { guardAdminRead, guardAdminWrite, json, type ApiError } from "../../../lib/cms/http";
import {
  deleteContentKv,
  listContentKv,
  upsertContentKv,
  validateKvEntries,
  validateKvKeys,
} from "../../../lib/cms/content";
import { CMS } from "../../../cms.config";

/**
 * The `content_kv` batch endpoint (ARCHITECTURE §8.1, F-008/F-009).
 *
 * Three verbs, three meanings, and the third one is the interesting one: DELETE
 * is "Återställ till standard". It REMOVES the row so the developer default
 * applies again — blanking it would store an intentional blank, which is a
 * different and permanent thing (§6.6).
 *
 * The allowlist lives server-side because the form is not the boundary: the keys
 * name paths that `mergeSiteOverrides` walks into `site.json`, so an unlisted
 * key is a 400 rather than a write nobody authored.
 */

function siteUrl(env: Partial<Env>, request: Request): string {
  return env.PUBLIC_SITE_URL ?? new URL(request.url).origin;
}

export const GET: APIRoute = async ({ request }) => {
  const env = await bindings();
  const guard = guardAdminRead(request, env, import.meta.env.PROD);
  if (!guard.ok) return guard.res;

  try {
    return json({ rows: await listContentKv(guard.db) });
  } catch (error) {
    console.error("[admin/content] read failed", error);
    return json({ error: "internal" } satisfies ApiError, 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const env = await bindings();
  const guard = guardAdminWrite(request, env, import.meta.env.PROD, siteUrl(env, request));
  if (!guard.ok) return guard.res;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_input", field: "body" } satisfies ApiError, 400);
  }

  const parsed = validateKvEntries(CMS, (body as { entries?: unknown } | null)?.entries);
  if (!parsed.ok) return json(parsed.errors[0], 400);

  try {
    await upsertContentKv(
      guard.db,
      parsed.value,
      locals.adminEmail ?? "",
      new Date().toISOString(),
    );
    return json({ ok: true, saved: parsed.value.length });
  } catch (error) {
    console.error("[admin/content] save failed", error);
    return json({ error: "internal" } satisfies ApiError, 500);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const env = await bindings();
  const guard = guardAdminWrite(request, env, import.meta.env.PROD, siteUrl(env, request));
  if (!guard.ok) return guard.res;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_input", field: "body" } satisfies ApiError, 400);
  }

  try {
    // The existing keys are the escape hatch for a shrunk allowlist: a row left
    // behind by a de-allowlisted key still overrides a default, so it has to
    // stay removable (P1 W-2).
    const existing = (await listContentKv(guard.db)).map((row) => row.key);
    const parsed = validateKvKeys(CMS, (body as { keys?: unknown } | null)?.keys, existing);
    if (!parsed.ok) return json(parsed.errors[0], 400);

    return json({ ok: true, removed: await deleteContentKv(guard.db, parsed.value) });
  } catch (error) {
    console.error("[admin/content] reset failed", error);
    return json({ error: "internal" } satisfies ApiError, 500);
  }
};
