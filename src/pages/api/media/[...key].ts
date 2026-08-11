export const prerender = false;
import type { APIRoute } from "astro";
import { bindings } from "../../../lib/cms/bindings";

/**
 * Public R2 streaming (ARCHITECTURE §6.17, F-012) — the route that makes
 * `posterSrc()`'s Stage-A URL real.
 *
 * NO AUTH, by design: posters render on the public grid. The only thing this
 * route decides is whether a key names an object it is willing to stream.
 *
 * EVERY failure answers the same bare 404 — unbound binding, malformed key,
 * traversal attempt, missing object. Distinguishing them would tell a prober
 * which keys exist and whether R2 is wired, and none of the four is actionable
 * by a visitor.
 */

/** Our own key namespace: `<prefix>/<uuid>.<ext>`. Nothing else is servable. */
const KEY_RE = /^[a-z0-9/_.-]+$/i;

const IMMUTABLE = "public, max-age=31536000, immutable";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** Does `If-None-Match` (possibly a list) name this ETag? */
function etagMatches(header: string | null, etag: string): boolean {
  if (!header || !etag) return false;
  return header
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === etag || candidate === "*");
}

export const GET: APIRoute = async ({ params, request }) => {
  const env = await bindings();
  if (!env.MEDIA) return notFound();

  const key = params.key ?? "";
  // `..` is checked separately from the character class: dots are legal in a
  // key (the extension), so only the traversal SEQUENCE is disqualifying.
  if (!key || !KEY_RE.test(key) || key.includes("..")) return notFound();

  const object = await env.MEDIA.get(key);
  if (!object) return notFound();

  const etag = object.httpEtag;
  if (etagMatches(request.headers.get("If-None-Match"), etag)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": IMMUTABLE },
    });
  }

  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Cache-Control": IMMUTABLE,
  });
  if (etag) headers.set("ETag", etag);

  return new Response(object.body, { status: 200, headers });
};
