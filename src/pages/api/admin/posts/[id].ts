export const prerender = false;
import type { APIRoute } from "astro";
import { getById } from "../../../../lib/db";
import type { ApiError, GetPostResponse } from "../../../../lib/admin-api";

/**
 * Load one post by id for the edit form (§10.5). Returns any status (drafts
 * included) — this is Access-gated, unlike the public slug lookup.
 */
function authorized(request: Request, env: App.Locals["runtime"]["env"]): boolean {
  const expected = env.ADMIN_API_TOKEN;
  if (!expected) return true;
  return request.headers.get("x-admin-token") === expected;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ request, locals, params }) => {
  const env = locals.runtime?.env;
  if (!env?.DB) return json(<ApiError>{ error: "db_unavailable" }, 503);
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);

  const idParam = params.id ?? "";
  if (!/^\d+$/.test(idParam)) return json(<ApiError>{ error: "invalid_id", field: "id" }, 400);
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return json(<ApiError>{ error: "invalid_id", field: "id" }, 400);
  }

  const post = await getById(env.DB, id);
  if (!post) return json(<ApiError>{ error: "not_found" }, 404);
  return json(<GetPostResponse>{ ok: true, post }, 200);
};
