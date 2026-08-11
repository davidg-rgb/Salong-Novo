export const prerender = false;
import type { APIRoute } from "astro";
import {
  ALLOWED_MIME,
  sniffImageType,
  mimeToExt,
  mediaMarkdown,
  servedUrl,
} from "../../../lib/media";
import { insertMedia } from "../../../lib/db";
import { isSameOriginWrite } from "../../../lib/access";
import { bindings } from "../../../lib/cms/bindings";
import type { ApiError, UploadResponse, MediaItem } from "../../../lib/admin-api";

/**
 * Image upload (§10.5/§10.7). Stores the original in R2 + records a media row,
 * returns the served URL and ready-to-insert markdown. The magic-byte sniff is
 * the trust boundary: a spoofed Content-Type/filename cannot get past it.
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

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const POST: APIRoute = async ({ request }) => {
  const env = await bindings();
  if (!env.DB || !env.MEDIA) return json(<ApiError>{ error: "db_unavailable" }, 503);
  // Validation order: token → CSRF → file → MIME → size → magic-byte sniff.
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);
  if (!isSameOriginWrite(request, env.PUBLIC_SITE_URL ?? "")) {
    return json(<ApiError>{ error: "forbidden" }, 403);
  }

  const form = await request.formData();
  const file = form.get("file");
  const alt = String(form.get("alt") ?? "");
  const kindRaw = String(form.get("kind") ?? "inline");
  const kind: "inline" | "cover" = kindRaw === "cover" ? "cover" : "inline";
  const postIdRaw = form.get("postId");
  const postId =
    postIdRaw !== null && postIdRaw !== "" && /^\d+$/.test(String(postIdRaw))
      ? Number(postIdRaw)
      : null;

  if (!(file instanceof File)) return json(<ApiError>{ error: "file_required", field: "file" }, 400);
  if (!ALLOWED_MIME.has(file.type)) return json(<ApiError>{ error: "unsupported_type" }, 415);
  if (file.size > MAX_BYTES) return json(<ApiError>{ error: "too_large" }, 413);

  const buf = await file.arrayBuffer();
  const sniffed = sniffImageType(new Uint8Array(buf.slice(0, 32)));
  if (!sniffed || sniffed !== file.type) {
    return json(<ApiError>{ error: "content_mismatch" }, 415);
  }

  const key = `blog/${crypto.randomUUID()}.${mimeToExt(file.type)}`;
  await env.MEDIA.put(key, buf, {
    httpMetadata: { contentType: file.type },
    customMetadata: { alt },
  });

  const now = new Date().toISOString();
  await insertMedia(env.DB, { r2_key: key, alt, post_id: postId, variants: "[]" }, now);

  // insertMedia returns void; recover the new row id (SQLite last_insert_rowid()).
  let mediaId = 0;
  try {
    const row = await env.DB
      .prepare("SELECT id FROM media WHERE r2_key = ? LIMIT 1")
      .bind(key)
      .first<{ id: number }>();
    if (row && typeof row.id === "number") mediaId = row.id;
  } catch {
    // non-fatal: the upload + R2 object succeeded; id is a convenience.
  }

  const url = servedUrl(env.PUBLIC_IMAGE_BASE ?? "", key);
  const markdown = kind === "inline" ? mediaMarkdown(alt, url) : "";
  const altMissing = !alt.trim();

  const media: MediaItem = {
    id: mediaId,
    key,
    url,
    alt,
    variants: [],
    createdAt: now,
  };
  return json(<UploadResponse>{ ok: true, media, altMissing, kind, markdown }, 200);
};
