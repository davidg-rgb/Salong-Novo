/**
 * Admin API — the single source of truth for admin request/response shapes.
 * Imported by BOTH the server routes (src/pages/api/admin/*) AND the client
 * controllers (src/admin/*). No route may declare a local request `Body` again;
 * no client may redeclare a response shape. One module, one contract.
 *
 * Pure types + two tiny runtime guards — no DB, no env, no I/O. See ARCHITECTURE §10.5.
 */
import type { Locale } from "../i18n/routes";
import type { Post, PostStatus } from "./posts";

/** Error envelope returned by every non-2xx admin response. */
export interface ApiError {
  error: string;
  message?: string;
  field?: string;
}

/** The write payload the editor sends on create (no `id`) / update (with `id`). */
export interface PostWriteRequest {
  id?: number;
  title: string;
  locale: Locale;
  body: string;
  excerpt?: string;
  coverImage?: string | null;
  author?: string;
  status: PostStatus;
  seoTitle?: string | null;
  seoDesc?: string | null;
  slug?: string;
}

/** A post as the admin sees it (identical to the domain `Post`). */
export type AdminPost = Post;

export interface CreatePostResponse {
  ok: true;
  post: AdminPost;
}
export interface UpdatePostResponse {
  ok: true;
  post: AdminPost;
}
export interface DeletePostResponse {
  ok: true;
  id: number;
}
export interface ListPostsQuery {
  locale?: Locale;
  status?: PostStatus;
  q?: string;
}
export interface ListPostsResponse {
  ok: true;
  posts: AdminPost[];
}
export interface GetPostResponse {
  ok: true;
  post: AdminPost;
}

export interface MediaItem {
  id: number;
  key: string;
  url: string;
  alt: string;
  variants: number[];
  createdAt: string;
}
export interface ListMediaResponse {
  ok: true;
  media: MediaItem[];
}
export interface UploadResponse {
  ok: true;
  media: MediaItem;
  altMissing: boolean;
  kind: "inline" | "cover";
  markdown: string;
}
export interface DeleteMediaResponse {
  ok: true;
  key: string;
  warning?: "in_use";
  usedBy?: number[];
}

/** Live-preview render response (POST /api/admin/preview). */
export interface PreviewResponse {
  ok: true;
  html: string;
}

/** Runtime guard: is this parsed JSON body the error envelope? */
export function isApiError(x: unknown): x is ApiError {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { error?: unknown }).error === "string"
  );
}

/** Runtime guard: did this response carry the `ok: true` success flag? */
export function isOk(x: unknown): x is { ok: true } {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { ok?: unknown }).ok === true
  );
}
