export const prerender = false;
import type { APIRoute } from "astro";
import { listMedia, deleteMediaRow, mediaUsage } from "../../../lib/db";
import { isSameOriginWrite } from "../../../lib/access";
import { bindings } from "../../../lib/cms/bindings";
import { variantKey, VARIANT_WIDTHS } from "../../../lib/images";
import type {
  ApiError,
  ListMediaResponse,
  DeleteMediaResponse,
} from "../../../lib/admin-api";

/**
 * Media picker list (GET) + media delete (DELETE) — §10.5. Access gates the
 * route at the edge; the token check is defense-in-depth and DELETE adds the
 * same-origin CSRF guard (§10.8).
 */
function authorized(request: Request, env: Partial<Env>): boolean {
  const expected = env.ADMIN_API_TOKEN;
  if (!expected) return !import.meta.env.PROD; // unset: dev builds only — prod fails closed, matching the CMS guard
  return request.headers.get("x-admin-token") === expected;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function intParam(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const GET: APIRoute = async ({ request, url }) => {
  const env = await bindings();
  if (!env.DB) return json(<ApiError>{ error: "db_unavailable" }, 503);
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);

  const limit = intParam(url.searchParams.get("limit"), 100);
  const offset = intParam(url.searchParams.get("offset"), 0);
  const media = await listMedia(env.DB, env.PUBLIC_IMAGE_BASE ?? "", limit, offset);
  return json(<ListMediaResponse>{ ok: true, media }, 200);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const env = await bindings();
  if (!env.DB) return json(<ApiError>{ error: "db_unavailable" }, 503);
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);
  if (!isSameOriginWrite(request, env.PUBLIC_SITE_URL ?? "")) {
    return json(<ApiError>{ error: "forbidden" }, 403);
  }

  const key = url.searchParams.get("key");
  if (!key) return json(<ApiError>{ error: "key_required", field: "key" }, 400);
  const force = url.searchParams.get("force") === "1";

  // Soft in-use guard: if posts reference this key, return the warning and do
  // NOT delete unless ?force=1 (lets the UI confirm before destroying).
  const used = await mediaUsage(env.DB, key);
  if (used.length > 0 && !force) {
    return json(<DeleteMediaResponse>{ ok: true, key, warning: "in_use", usedBy: used }, 200);
  }

  // Delete the R2 original + every known variant key (best-effort each).
  if (env.MEDIA) {
    const media = env.MEDIA;
    try {
      await media.delete(key);
    } catch {
      // idempotent: a missing object is fine.
    }
    for (const w of VARIANT_WIDTHS) {
      try {
        await media.delete(variantKey(key, w));
      } catch {
        // best-effort: variant may not exist (pipeline deferred).
      }
    }
  }
  await deleteMediaRow(env.DB, key);

  const payload: DeleteMediaResponse = { ok: true, key };
  if (used.length > 0) {
    payload.warning = "in_use";
    payload.usedBy = used;
  }
  return json(payload, 200);
};
