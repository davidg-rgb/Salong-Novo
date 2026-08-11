export const prerender = false;
import type { APIRoute } from "astro";
import { bindings } from "../../../lib/cms/bindings";

/**
 * Public R2 streaming (Stage-A serving, §10.5/§10.7). No auth — images are
 * public content; only /admin + /api/admin are gated. Immutable cache (keys are
 * content-unique UUIDs) + ETag/304 conditional revalidation.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const env = await bindings();
  if (!env.MEDIA) {
    return new Response(JSON.stringify({ error: "db_unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = params.key;
  if (!key) return new Response("Not found", { status: 404 });

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const etag = obj.httpEtag;
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && etag && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType ?? "application/octet-stream",
  );
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (etag) headers.set("ETag", etag);

  return new Response(obj.body, { status: 200, headers });
};
