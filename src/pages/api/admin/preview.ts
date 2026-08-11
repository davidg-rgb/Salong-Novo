export const prerender = false;
import type { APIRoute } from "astro";
import { renderMarkdown } from "../../../lib/markdown";
import { bindings } from "../../../lib/cms/bindings";
import type { ApiError, PreviewResponse } from "../../../lib/admin-api";

/**
 * Live-preview render (§10.5/§10.6). Calls the exact `renderMarkdown` the public
 * page uses, so preview == production (`html:false`, link rules, typographer).
 * Read-only render — no CSRF needed, but the token check stays (defense-in-depth).
 */
function authorized(request: Request, env: Partial<Env>): boolean {
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

export const POST: APIRoute = async ({ request }) => {
  const env = await bindings();
  if (!env.DB) return json(<ApiError>{ error: "db_unavailable" }, 503);
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);

  const raw = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const body = typeof raw?.body === "string" ? raw.body : "";
  const html = renderMarkdown(body);
  return json(<PreviewResponse>{ ok: true, html }, 200);
};
