export const prerender = false;
import type { APIRoute } from "astro";
import {
  getById,
  takenSlugs,
  listAdmin,
  insertPost,
  updatePost,
  deletePost,
  type Database,
  type PostInput,
} from "../../../lib/db";
import { resolveSlug } from "../../../lib/slug";
import { nextPublishedAt } from "../../../lib/posts";
import { parsePostWrite } from "../../../lib/admin-validate";
import { isSameOriginWrite } from "../../../lib/access";
import { bindings } from "../../../lib/cms/bindings";
import { extractMediaKeys } from "../../../lib/media";
import { isLocale, type Locale } from "../../../i18n/routes";
import type {
  ApiError,
  CreatePostResponse,
  UpdatePostResponse,
  DeletePostResponse,
  ListPostsResponse,
} from "../../../lib/admin-api";
import type { Post, PostStatus } from "../../../lib/posts";

/**
 * Admin posts API (§10.5). Cloudflare Access enforces *who* can reach /admin &
 * /api/admin at the edge; this token check is defense-in-depth only. Every write
 * additionally enforces the same-origin CSRF guard (§10.8).
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

/**
 * Associate uploaded media with a post (best-effort, §10.7). After a write we
 * point the cover key and every inline-referenced key at this post id. Failures
 * here never fail the write — orphan rows (`post_id IS NULL`) are swept later.
 */
async function associateMedia(
  db: Database,
  postId: number,
  coverImage: string | null,
  body: string,
  base: string,
): Promise<void> {
  const keys = new Set<string>(extractMediaKeys(body, base));
  if (coverImage) keys.add(coverImage);
  if (keys.size === 0) return;
  try {
    await Promise.all(
      [...keys].map((key) =>
        db
          .prepare(`UPDATE media SET post_id = ? WHERE r2_key = ?`)
          .bind(postId, key)
          .run(),
      ),
    );
  } catch {
    // best-effort: association must never fail the post write.
  }
}

export const GET: APIRoute = async ({ request, url }) => {
  const env = await bindings();
  if (!env.DB) return json(<ApiError>{ error: "db_unavailable" }, 503);
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);

  const localeParam = url.searchParams.get("locale");
  const statusParam = url.searchParams.get("status");
  const q = url.searchParams.get("q") ?? undefined;

  const filters: { locale?: Locale; status?: PostStatus; q?: string } = {};
  if (localeParam !== null) {
    if (!isLocale(localeParam)) return json(<ApiError>{ error: "invalid_locale", field: "locale" }, 400);
    filters.locale = localeParam;
  }
  if (statusParam !== null) {
    if (statusParam !== "draft" && statusParam !== "published") {
      return json(<ApiError>{ error: "invalid_status", field: "status" }, 400);
    }
    filters.status = statusParam;
  }
  if (q !== undefined && q !== "") filters.q = q;

  const posts = await listAdmin(env.DB, filters);
  return json(<ListPostsResponse>{ ok: true, posts }, 200);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = await bindings();
  if (!env.DB) return json(<ApiError>{ error: "db_unavailable" }, 503);
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);
  if (!isSameOriginWrite(request, env.PUBLIC_SITE_URL ?? "")) {
    return json(<ApiError>{ error: "forbidden" }, 403);
  }

  const raw = await request.json().catch(() => null);
  const parsed = parsePostWrite(raw);
  if (!parsed.ok) return json(<ApiError>{ error: parsed.fail.error, field: parsed.fail.field }, 400);
  const value = parsed.value;

  const now = new Date().toISOString();
  // B10: author-default precedence lives in the HANDLER, not parsePostWrite.
  const author = value.author || locals.adminEmail || "";
  const slug = resolveSlug(null, value.slugOverride, value.title, await takenSlugs(env.DB, value.locale));
  const publishedAt = nextPublishedAt(null, value.status, now);

  const input: PostInput = {
    slug,
    locale: value.locale,
    title: value.title,
    excerpt: value.excerpt,
    body: value.body,
    coverImage: value.coverImage,
    author,
    status: value.status,
    seoTitle: value.seoTitle,
    seoDesc: value.seoDesc,
    publishedAt,
  };

  const post: Post = await insertPost(env.DB, input, now);
  await associateMedia(env.DB, post.id, post.coverImage, post.body, env.PUBLIC_IMAGE_BASE ?? "");
  return json(<CreatePostResponse>{ ok: true, post }, 201);
};

export const PUT: APIRoute = async ({ request }) => {
  const env = await bindings();
  if (!env.DB) return json(<ApiError>{ error: "db_unavailable" }, 503);
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);
  if (!isSameOriginWrite(request, env.PUBLIC_SITE_URL ?? "")) {
    return json(<ApiError>{ error: "forbidden" }, 403);
  }

  const raw = await request.json().catch(() => null);
  const parsed = parsePostWrite(raw);
  if (!parsed.ok) return json(<ApiError>{ error: parsed.fail.error, field: parsed.fail.field }, 400);
  const value = parsed.value;
  if (value.id === undefined) return json(<ApiError>{ error: "id_required", field: "id" }, 400);

  const existing = await getById(env.DB, value.id);
  if (!existing) return json(<ApiError>{ error: "not_found" }, 404);

  const now = new Date().toISOString();
  // B7: slug resolved by resolveSlug (frozen once published), excluding self.
  const slug = resolveSlug(
    { slug: existing.slug, status: existing.status },
    value.slugOverride,
    value.title,
    await takenSlugs(env.DB, value.locale, existing.id),
  );
  // Preserve the existing author unless the body explicitly overrides it.
  const author = value.author || existing.author;
  const publishedAt = nextPublishedAt(existing, value.status, now);

  const input: PostInput = {
    slug,
    locale: value.locale,
    title: value.title,
    excerpt: value.excerpt,
    body: value.body,
    coverImage: value.coverImage,
    author,
    status: value.status,
    seoTitle: value.seoTitle,
    seoDesc: value.seoDesc,
    publishedAt,
  };

  const post: Post = await updatePost(env.DB, existing.id, input, now);
  await associateMedia(env.DB, post.id, post.coverImage, post.body, env.PUBLIC_IMAGE_BASE ?? "");
  return json(<UpdatePostResponse>{ ok: true, post }, 200);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const env = await bindings();
  if (!env.DB) return json(<ApiError>{ error: "db_unavailable" }, 503);
  if (!authorized(request, env)) return json(<ApiError>{ error: "unauthorized" }, 401);
  if (!isSameOriginWrite(request, env.PUBLIC_SITE_URL ?? "")) {
    return json(<ApiError>{ error: "forbidden" }, 403);
  }

  const idParam = url.searchParams.get("id");
  // Idempotent: a missing id is a no-op 200; a non-numeric id is a 400.
  if (idParam !== null && idParam !== "" && !/^\d+$/.test(idParam)) {
    return json(<ApiError>{ error: "id_required", field: "id" }, 400);
  }
  const id = idParam ? Number(idParam) : 0;
  if (id > 0) await deletePost(env.DB, id);
  // Deleting a post does NOT delete media (ON DELETE SET NULL handles the link).
  return json(<DeletePostResponse>{ ok: true, id }, 200);
};
