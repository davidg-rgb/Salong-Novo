-- Forge CMS core tables (D1 / SQLite) — this project's numbering.
--
-- Assembled from `_templates/forge-cms/migrations/0001_core_tables.sql`. The
-- `enquiries` half is that file's statements VERBATIM. The `media` half is NOT,
-- and this is the one step where following the runbook literally produces a
-- broken install:
--
--   0001_init.sql already created a `media` table, with a DIFFERENT SHAPE. It
--   has `post_id` and `variants` (the blog's cover/inline pipeline) and lacks
--   `mime` and `bytes` (which `src/lib/cms/media-db.ts` writes on every upload).
--   The template ships `CREATE TABLE IF NOT EXISTS media`, so against that table
--   it would SILENTLY NO-OP — no error, and every later Forge insert fails on a
--   column that does not exist. So the CREATE is replaced by the two ALTERs that
--   reconcile the existing shape to a SUPERSET satisfying both consumers:
--
--     kept   post_id, variants   → src/lib/db.ts `insertMedia` (blog uploads)
--     added  mime, bytes         → src/lib/cms/media-db.ts `insertMediaRow`
--     shared id, r2_key, alt, width, height, created_at
--
--   Each writer leaves the other's columns at their defaults, and each reader
--   selects only its own: the blog's `SELECT *` tolerates the two new columns,
--   and `media-db.ts` names its six explicitly. Neither can see a NOT NULL it
--   does not fill, which is why `mime` carries a default and `bytes` is nullable.
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`; idempotence here comes from
-- wrangler's own `d1_migrations` bookkeeping, which never re-runs an applied
-- file. Verified on both paths — a fresh store (0001 creates, 0002 alters) and
-- the already-migrated local store.
--
-- `content_kv` and `collection_items` live in 0003_cms_content.sql.

-- Contact-form enquiries. There is no contact form on this site yet — the table
-- is still required, because the [CORE] dashboard imports `countNewEnquiries`
-- for its badge and an ABSENT table makes that query throw, which the dashboard
-- renders as "kunde inte hämtas" forever. It simply stays empty.
CREATE TABLE IF NOT EXISTS enquiries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  message       TEXT NOT NULL,
  company       TEXT NOT NULL DEFAULT '',
  locale        TEXT NOT NULL DEFAULT 'sv' CHECK (locale IN ('sv','en')),
  status        TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','read','archived','spam')),
  mail_status   TEXT NOT NULL DEFAULT 'pending'
                CHECK (mail_status IN ('pending','sent','failed','skipped')),
  ip_hash       TEXT NOT NULL DEFAULT '',     -- salted hash only; never the raw IP (GDPR)
  user_agent    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enquiries_status_date
  ON enquiries (status, created_at DESC);

-- The `media` reconciliation. Existing rows get `mime = ''` / `bytes = NULL`,
-- which is exactly what `media-db.ts` already coalesces for a row it did not
-- write itself.
ALTER TABLE media ADD COLUMN mime TEXT NOT NULL DEFAULT '';
ALTER TABLE media ADD COLUMN bytes INTEGER;
