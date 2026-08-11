-- Salong NOVO — initial schema (D1 / SQLite)
-- Blog posts are single-language (locale marker); a post shows only on its locale.

CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'sv' CHECK (locale IN ('sv','en')),
  title         TEXT NOT NULL,
  excerpt       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL,                 -- Markdown (rendered with html disabled)
  cover_image   TEXT,                          -- R2 key
  author        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  seo_title     TEXT,
  seo_desc      TEXT,
  published_at  TEXT,                          -- ISO 8601, null until published
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (locale, slug)
);

CREATE INDEX IF NOT EXISTS idx_posts_locale_status_date
  ON posts (locale, status, published_at DESC);

-- Uploaded media + generated responsive variants (R2 keys).
CREATE TABLE IF NOT EXISTS media (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  r2_key       TEXT NOT NULL UNIQUE,
  alt          TEXT NOT NULL DEFAULT '',
  width        INTEGER,
  height       INTEGER,
  variants     TEXT,                           -- JSON array of generated widths
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_post ON media (post_id);
