/**
 * The per-project CMS surface (RUNBOOK §3.5). Core owns the TYPES
 * (`src/lib/cms/config-types.ts`); this file owns the DATA. No core lib module
 * imports it — routes import it and PASS the defs into core functions as
 * parameters, which is what keeps the core project-agnostic.
 *
 * PHASE B1 SCOPE — this is deliberately the MINIMUM type-valid config: the
 * plumbing that makes the admin shell, the media library and the config gates
 * real, and nothing about Salong NOVO's content model. `contentGroups`,
 * `editableCopy` and `collections` are empty on purpose; Phase B2 authors them
 * against the site's actual copy and lists, and the nav grows those screens for
 * free (AdminNav derives its chip row from all three).
 *
 * What IS real here: the media prefix the blog already uploads to, the usage
 * queries that keep the media library's in-use warning honest, and the three
 * sections the admin has today.
 */
import type { CmsConfig } from "./lib/cms/config-types";

export const CMS: CmsConfig = {
  /** Phase B2. */
  contentGroups: [],
  /** Phase B2. */
  editableCopy: [],
  /** Phase B2. */
  collections: [],

  /**
   * The R2 key prefix for uploads. `blog/` is the prefix this project has
   * uploaded to since the admin was built, and unifying on it rather than
   * introducing a second namespace means every existing key keeps resolving and
   * the blog's upload path is byte-for-byte unchanged. One bucket, one prefix,
   * one media library — the images are the same images whether a post or a page
   * uses them.
   */
  mediaPrefix: "blog/",

  /**
   * "Is this image still in use?" — the media library's soft-delete warning
   * (§6.11). Every table that can hold a media key needs an entry, or deleting
   * an image silently breaks whatever pointed at it.
   *
   * BIND CONTRACT: one bind value (the key), referenced as `?1` however many
   * times it appears; `sql` counts into a column named `n`.
   */
  usageQueries: [
    {
      label: "Omslagsbilder",
      sql: "SELECT COUNT(*) AS n FROM posts WHERE cover_image = ?1",
      clearSql: "UPDATE posts SET cover_image = NULL WHERE cover_image = ?1",
    },
    {
      /**
       * Inline images inside a post's Markdown. UNCLEARABLE by design: the
       * reference is an `![alt](url)` span in prose, and a blind string
       * replacement would either leave a broken image or eat a sentence. The
       * label comes back on force-delete so a human goes and fixes the post.
       */
      label: "Bilder i inlägg",
      sql: "SELECT COUNT(*) AS n FROM posts WHERE body LIKE '%' || ?1 || '%'",
    },
    {
      label: "Innehållsfält",
      sql: "SELECT COUNT(*) AS n FROM content_kv WHERE value_sv = ?1 OR value_en = ?1",
      clearSql:
        "UPDATE content_kv SET value_sv = CASE WHEN value_sv = ?1 THEN '' ELSE value_sv END, value_en = CASE WHEN value_en = ?1 THEN '' ELSE value_en END WHERE value_sv = ?1 OR value_en = ?1",
    },
    {
      /** Same reasoning as the post body: SQL surgery on a JSON payload corrupts it. */
      label: "Listor",
      sql: "SELECT COUNT(*) AS n FROM collection_items WHERE data LIKE '%' || ?1 || '%'",
    },
  ],

  adminNav: [
    { href: "/admin", labelKey: "nav.dashboard", icon: "grid" },
    { href: "/admin/posts", labelKey: "nav.blog", icon: "film" },
    { href: "/admin/media", labelKey: "nav.media", icon: "image" },
  ],
};
