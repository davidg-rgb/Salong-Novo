export const prerender = false;
import type { APIRoute } from "astro";
import { bindings } from "../../../lib/cms/bindings";
import { guardAdminWrite, json, type ApiError } from "../../../lib/cms/http";
import { ALLOWED_MIME, sniffImageType, mimeToExt, servedUrl } from "../../../lib/cms/media";
import { insertMediaRow, type MediaItem } from "../../../lib/cms/media-db";
import { mediaMarkdown } from "../../../lib/media";
import { CMS } from "../../../cms.config";

/**
 * Image upload → R2 object + `media` row (ARCHITECTURE §8.4, F-003/F-011).
 *
 * MERGE POINT. The Forge core and this project's blog editor both own an upload
 * endpoint at this path, and they are the same operation with two callers, so
 * this is the core's route with the blog's extra request/response fields carried
 * through rather than two endpoints:
 *
 *   from CORE   the guard preamble, the 64-byte sniff, `CMS.mediaPrefix`, the
 *               orphan-object rollback when the row insert fails, and the
 *               `{ id, key, url, alt, mime, bytes, createdAt }` media shape.
 *   from BLOG   `kind` + `postId` on the request, and `markdown` + `variants` on
 *               the response — the editor's inline-insert path reads them.
 *
 * The magic-byte sniff is the trust boundary and is unchanged by the merge: a
 * renamed executable with an `image/jpeg` Content-Type is rejected with
 * `content_mismatch`, and the R2 key's extension is derived from the SNIFFED
 * type, never from the filename.
 *
 * VALIDATION ORDER IS FIXED (§8.4): guard → file present → declared MIME → size
 * → sniff → put → row. The `MEDIA` binding check sits between the guard and the
 * body read: it is a binding-availability answer of the same class as the
 * guard's own `db_unavailable`, and there is no point streaming 10 MB out of the
 * client to discover there is nowhere to put it.
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (ADR-05: originals, no variants)

/** How many leading bytes the sniffer needs — AVIF compatible brands run to 64. */
const SNIFF_BYTES = 64;

export const POST: APIRoute = async ({ request }) => {
  const env = await bindings();

  const guard = guardAdminWrite(
    request,
    env,
    import.meta.env.PROD,
    env.PUBLIC_SITE_URL ?? new URL(request.url).origin,
  );
  if (!guard.ok) return guard.res;

  const media = env.MEDIA;
  if (!media) return json({ error: "media_unbound" } satisfies ApiError, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "file_required", field: "file" } satisfies ApiError, 400);
  }

  const file = form.get("file");
  const alt = String(form.get("alt") ?? "");
  const kind: "inline" | "cover" = String(form.get("kind") ?? "inline") === "cover" ? "cover" : "inline";
  const postIdRaw = String(form.get("postId") ?? "");
  const postId = /^\d+$/.test(postIdRaw) ? Number(postIdRaw) : null;

  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "file_required", field: "file" } satisfies ApiError, 400);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return json({ error: "unsupported_type" } satisfies ApiError, 415);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: "too_large" } satisfies ApiError, 413);
  }

  const buffer = await file.arrayBuffer();
  const sniffed = sniffImageType(new Uint8Array(buffer.slice(0, SNIFF_BYTES)));
  if (!sniffed || sniffed !== file.type) {
    return json({ error: "content_mismatch" } satisfies ApiError, 415);
  }

  const key = `${CMS.mediaPrefix}${crypto.randomUUID()}.${mimeToExt(sniffed)}`;
  const now = new Date().toISOString();

  await media.put(key, buffer, {
    httpMetadata: { contentType: sniffed },
    customMetadata: { alt },
  });

  let id: number;
  try {
    id = await insertMediaRow(guard.db, { r2_key: key, alt, mime: sniffed, bytes: file.size }, now);
  } catch (error) {
    // The object landed but the row did not. Roll the object back rather than
    // leaving an orphan that no admin screen can see or delete.
    console.error("[upload] media row insert failed; removing the orphaned object", error);
    try {
      await media.delete(key);
    } catch (cleanupError) {
      console.error("[upload] orphan cleanup failed", key, cleanupError);
    }
    return json({ error: "internal" } satisfies ApiError, 500);
  }

  // Best-effort association with the post being edited, matching the sweep the
  // post-write path already does (§10.7). A failure here is not worth losing a
  // successful upload over: the next save re-associates every referenced key.
  if (postId !== null) {
    try {
      await guard.db
        .prepare(`UPDATE media SET post_id = ? WHERE r2_key = ?`)
        .bind(postId, key)
        .run();
    } catch {
      // orphan rows (post_id IS NULL) are swept on the next post write.
    }
  }

  const url = servedUrl(env.PUBLIC_IMAGE_BASE ?? "", key);
  const item: MediaItem = { id, key, url, alt, mime: sniffed, bytes: file.size, createdAt: now };

  // `altMissing` is a nudge, not a rejection — an unlabelled image is worth
  // flagging in the library, but blocking the upload over it would just teach
  // the client to type a space.
  return json(
    {
      ok: true,
      media: { ...item, variants: [] },
      altMissing: !alt.trim(),
      kind,
      markdown: kind === "inline" ? mediaMarkdown(alt, url) : "",
    },
    201,
  );
};
