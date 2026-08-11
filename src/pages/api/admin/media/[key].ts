export const prerender = false;
import type { APIRoute } from "astro";
import { bindings } from "../../../../lib/cms/bindings";
import { guardAdminWrite, json, type ApiError } from "../../../../lib/cms/http";
import {
  getMediaRow,
  updateMediaAlt,
  deleteMediaRow,
  mediaUsage,
  clearMediaRefs,
} from "../../../../lib/cms/media-db";
import { CMS } from "../../../../cms.config";

/**
 * Media library mutations (ARCHITECTURE §8.4, F-011).
 *
 * `:key` is the URL-ENCODED full R2 key — `posters%2F<uuid>.jpg` — because the
 * key itself contains a slash. Astro decodes the param, so the handler sees
 * `posters/<uuid>.jpg`.
 *
 * DELETE is a two-step conversation, not a confirm dialog on the client's
 * honour: the first call reports what still references the image and changes
 * nothing (200 `{ok:false, inUse}` — a soft warning is DATA, not an error,
 * §11.1); `?force=1` clears what can be cleared, then removes object and row.
 */

const MAX_ALT = 300;

function siteUrl(env: Partial<Env>, request: Request): string {
  return env.PUBLIC_SITE_URL ?? new URL(request.url).origin;
}

/** The decoded key, or "" when the param is missing/undecodable. */
function mediaKey(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const PUT: APIRoute = async ({ request, params }) => {
  const env = await bindings();
  const guard = guardAdminWrite(request, env, import.meta.env.PROD, siteUrl(env, request));
  if (!guard.ok) return guard.res;

  const key = mediaKey(params.key);
  if (!key) return json({ error: "not_found" } satisfies ApiError, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_input", field: "alt" } satisfies ApiError, 400);
  }

  const raw = (body as { alt?: unknown } | null)?.alt;
  if (typeof raw !== "string") {
    return json(
      { error: "invalid_input", field: "alt", detail: "expected_string" } satisfies ApiError,
      400,
    );
  }
  if (raw.length > MAX_ALT) {
    return json(
      { error: "invalid_input", field: "alt", detail: "too_long" } satisfies ApiError,
      400,
    );
  }

  if (!(await getMediaRow(guard.db, key))) {
    return json({ error: "not_found" } satisfies ApiError, 404);
  }

  await updateMediaAlt(guard.db, key, raw);
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request, params, url }) => {
  const env = await bindings();
  const guard = guardAdminWrite(request, env, import.meta.env.PROD, siteUrl(env, request));
  if (!guard.ok) return guard.res;

  const key = mediaKey(params.key);
  if (!key) return json({ error: "not_found" } satisfies ApiError, 404);

  if (!(await getMediaRow(guard.db, key))) {
    return json({ error: "not_found" } satisfies ApiError, 404);
  }

  const force = url.searchParams.get("force") === "1";
  const inUse = await mediaUsage(guard.db, key, CMS.usageQueries);
  if (inUse.length && !force) return json({ ok: false, inUse });

  const { cleared, unclearable } = force
    ? await clearMediaRefs(guard.db, key, CMS.usageQueries)
    : { cleared: [], unclearable: [] as string[] };

  // The R2 object goes first: a row without an object shows a broken thumbnail
  // the client can still delete, where an object without a row is invisible.
  if (env.MEDIA) await env.MEDIA.delete(key);
  await deleteMediaRow(guard.db, key);

  return json({ ok: true, cleared, unclearable });
};
