-- Nicole Olmedo — CMS content storage (D1 / SQLite)
--
-- Two generic tables that between them make every remaining client-visible
-- string and list editable WITHOUT a migration. Adding "the services outro is
-- editable now" or "there is a FAQ list" becomes an edit to src/cms.config.ts.
--
-- Why generic instead of one table per thing: a bespoke table per list turns
-- every new list into a migration plus new queries plus new endpoints, for a
-- brochure site where the lists are five rows each. The portfolio keeps its
-- bespoke table (0001+0002) because its domain genuinely is complex; everything
-- else fits one of these two shapes.

-- Every scalar editable string, bilingual, addressed by a dot-namespaced key.
--
--   site.*   facts, with no dictionary behind them  (site.contact.email)
--   copy.*   overrides of a src/i18n dictionary key (copy.home.heroTitle)
--
-- A ROW'S EXISTENCE IS PROVENANCE: no row means the developer default in
-- content/*.json or the dictionary still applies, and the admin shows the
-- placeholder badge. A row means the client has edited this, and the row wins —
-- INCLUDING when its values are blank, which is how the model sheet hides a
-- measurement row rather than printing an empty one. That is why "reset to
-- default" DELETES the row instead of blanking it.
CREATE TABLE IF NOT EXISTS content_kv (
  key          TEXT PRIMARY KEY,
  value_sv     TEXT NOT NULL DEFAULT '',
  value_en     TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL DEFAULT ''   -- the admin's Access email (F-018 provenance)
);

-- Generic lists: services, testimonials, socials, stats — and whatever the next
-- project needs. The payload is a JSON object whose shape is declared by the
-- collection's field schema in src/cms.config.ts, and validated by
-- validateCollectionItem before it is ever written.
--
-- No CHECK on `collection`, matching 0002's philosophy: the set of lists grows
-- as the site does, and a CHECK would turn "add a list" back into a migration.
-- Validation lives in tested lib code, where an unknown value is a 400 rather
-- than a constraint failure.
CREATE TABLE IF NOT EXISTS collection_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  collection   TEXT NOT NULL,
  data         TEXT NOT NULL,              -- JSON object; see CollectionDef.fields
  sort_order   INTEGER NOT NULL DEFAULT 0,
  -- RESERVED in v1: writes never set it and inserts take the default, so every
  -- collection item is published. The draft workflow ships for the portfolio
  -- only. The column exists now so enabling drafts later is not a migration.
  status       TEXT NOT NULL DEFAULT 'published'
               CHECK (status IN ('draft','published')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL DEFAULT ''
);

-- The only query shape the public site runs against this table.
CREATE INDEX IF NOT EXISTS idx_collection_items
  ON collection_items (collection, status, sort_order ASC);
