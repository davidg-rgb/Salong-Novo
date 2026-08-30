/**
 * The per-project CMS surface (RUNBOOK §3.5). Core owns the TYPES
 * (`src/lib/cms/config-types.ts`); this file owns the DATA. No core lib module
 * imports it — routes import it and PASS the defs into core functions as
 * parameters, which is what keeps the core project-agnostic.
 *
 * FOUR AUTHORING RULES, all enforced by `tests/cms-config.test.ts`:
 *
 *   1. `contentGroups[].key` and `editableCopy[].page` are unique across BOTH
 *      arrays — they share the `/admin/content/[group]` param namespace.
 *   2. Every `contentGroups[].fields[].key` resolves to a real leaf in
 *      `content/site.json`. A typo would be a field the client edits that
 *      changes nothing; the test fails in CI instead.
 *   3. `editableCopy` keys are BARE dictionary keys. The `copy.` prefix is
 *      applied by `copyKey()` in `cms/content.ts` — one seam, three consumers.
 *   4. A key whose default string carries an `{interpolation}` carries a hint
 *      telling the client to leave the braces alone. A rewritten `{name}` is a
 *      button that reads "Boka tid hos" and stops.
 *
 * WHERE THE DEFAULTS LIVE, and why nothing is seeded into D1: site facts in
 * `content/site.json`, page copy in `src/lib/pagecopy.ts` (folded into the i18n
 * dictionary by `pageCopyDict()`), lists in `content/{staff,services,awards}.json`.
 * Row existence is provenance — no row means the developer default renders, and
 * the admin shows it as a grey ghost with a placeholder badge. Seeding would
 * make every field look client-approved on day one, which is the one thing the
 * model exists to prevent.
 */
import type { CmsConfig, CollectionDef } from "./lib/cms/config-types";
import { flatAwards, getBrands, getCourses, getServices, getStaff } from "./lib/content";
import { paraKeys } from "./lib/pagecopy";

/**
 * The seed documents carry `_`-prefixed provenance notes; a stored row never
 * would. Stripping them here keeps the bindings-less render and the D1 render
 * from differing in a way nothing catches — and stops the admin from offering
 * "DRAFT — confirm with the salon" as an editable value.
 */
function withoutNotes(items: readonly Record<string, unknown>[]): unknown[] {
  return items.map((item) =>
    Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith("_"))),
  );
}

/**
 * A numbered paragraph key labelled the way the client reads it. The count
 * comes from `paraKeys()`, which reads the default itself — adding a paragraph
 * to `pagecopy.ts` allowlists it here with no second edit.
 */
function paragraph(key: string, index: number): { key: string; label: string } {
  return { key, label: `Stycke ${index + 1}` };
}

/**
 * The 18 stylists. `slug` is a machine value — the roster's identity, what the
 * tests pin, and what a grid anchor would use — so it is `readOnly`: settable at
 * creation, static text thereafter, carried through a save untouched.
 *
 * `instagram` is a HANDLE (`@thechrissberner`), not a URL, because that is what
 * the card prints and what the modal expands into a link; the `url` kind would
 * reject every existing value.
 */
export const STAFF: CollectionDef = {
  name: "staff",
  label: "Stylister",
  orderable: true,
  jsonFallback: () => withoutNotes(getStaff() as unknown as Record<string, unknown>[]),
  fields: [
    { name: "slug", kind: "text", label: "Nyckel (slug)", readOnly: true, maxLen: 60 },
    { name: "name", kind: "text", label: "Namn", required: true, maxLen: 80 },
    { name: "role", kind: "text", label: "Roll", maxLen: 60 },
    /**
     * Client round 3 (2026-08-27): "Ta bort nyckelord typ 'blondt' 'herr' i
     * nuläget. Behåll bara namn + instagram." The field is KEPT — "i nuläget"
     * is a pause, not a deletion, and the seventeen values are the client's —
     * but nothing renders it, so the label says so rather than letting her
     * type into a dead input.
     */
    { name: "specialty", kind: "text", label: "Specialitet (visas inte just nu)", maxLen: 80 },
    { name: "instagram", kind: "text", label: "Instagram (@namn)", maxLen: 60 },
    { name: "bio", kind: "textarea", label: "Presentation", bilingual: true, maxLen: 1200 },
    { name: "awards", kind: "list", label: "Utmärkelser", maxItems: 12, maxLen: 140 },
    { name: "photo", kind: "image", label: "Porträtt" },
  ],
};

/**
 * The treatment menu. `bullets` is why the `list` field kind exists: it is a
 * bilingual string ARRAY, and without the kind the first save would silently
 * strip both sides, because unknown keys are never stored (proven by the
 * round-trip test in `tests/content-cms.test.ts`).
 *
 * `price` is free text rather than a number — a salon menu says "från 950 kr"
 * and "enligt offert" as often as it says a figure. Whether prices show at all
 * is still `showPrices` in `content/services.json`; see the note in the config
 * body below.
 */
export const SERVICES: CollectionDef = {
  name: "services",
  label: "Behandlingar",
  orderable: true,
  jsonFallback: () => withoutNotes(getServices() as unknown as Record<string, unknown>[]),
  fields: [
    { name: "slug", kind: "text", label: "Nyckel (slug)", readOnly: true, maxLen: 60 },
    { name: "name", kind: "text", label: "Namn", bilingual: true, required: true, maxLen: 80 },
    { name: "desc", kind: "textarea", label: "Beskrivning", bilingual: true, maxLen: 400 },
    { name: "bullets", kind: "list", label: "Punktlista", bilingual: true, maxItems: 8, maxLen: 160 },
    { name: "price", kind: "text", label: "Pris", maxLen: 60 },
  ],
};

/**
 * Competition results, one row per result.
 *
 * `content/awards.json` nests them year → competition → items, which is how the
 * salon talks about them; a `collection_items` row is flat by construction, so
 * `flatAwards()` adapts one to the other and the readable document stays the
 * source of truth. `people` is a plain (non-bilingual) `list`: names are not
 * translated.
 */
export const AWARDS: CollectionDef = {
  name: "awards",
  label: "Tävlingsresultat",
  orderable: true,
  jsonFallback: () => flatAwards() as unknown as Record<string, unknown>[],
  fields: [
    { name: "year", kind: "number", label: "År", required: true },
    { name: "competition", kind: "text", label: "Tävling", required: true, maxLen: 80 },
    { name: "category", kind: "text", label: "Kategori", maxLen: 80 },
    { name: "result", kind: "text", label: "Resultat", maxLen: 60 },
    { name: "people", kind: "list", label: "Personer", maxItems: 10, maxLen: 80 },
    { name: "photographer", kind: "text", label: "Fotograf", maxLen: 80 },
    { name: "note", kind: "text", label: "Notering", maxLen: 160 },
    { name: "location", kind: "text", label: "Plats & datum", maxLen: 120 },
    /**
     * One image per line, in render order. A rooted path is a bundled asset
     * (`/images/awards-2026/nykomling-1.jpg`); anything else is read as an R2
     * media key, so the client can swap a shipped photo for an uploaded one
     * without a second field — the same discriminator `assetUrl` applies.
     * `FieldDef` carries no `hint` slot (that is a `ContentFieldDef` affordance),
     * so the rule lives here rather than under the input.
     */
    { name: "images", kind: "list", label: "Bilder", maxItems: 8, maxLen: 160 },
  ],
};

/**
 * The product lines the salon carries (client round 3, 2026-08-27).
 *
 * `logo` and `product` ship EMPTY on every default row, which is the point: the
 * client asked for logos on all five brands and the assets do not exist yet, so
 * the grid types the brand name as a wordmark until one is uploaded here. A
 * page that is complete without the assets beats a page that waits for them.
 *
 * `desc` stays category-level in the defaults on purpose — NOVO does not speak
 * for a third-party manufacturer, and an invented product claim is the salon's
 * exposure under MFL 2008:486 §10, not the brand's. The client can say more in
 * her own words; the defaults will not do it for her.
 */
export const BRANDS: CollectionDef = {
  name: "brands",
  label: "Våra brands",
  orderable: true,
  jsonFallback: () => withoutNotes(getBrands() as unknown as Record<string, unknown>[]),
  fields: [
    { name: "slug", kind: "text", label: "Nyckel (slug)", readOnly: true, maxLen: 60 },
    { name: "name", kind: "text", label: "Varumärke", required: true, maxLen: 80 },
    { name: "desc", kind: "textarea", label: "Beskrivning", bilingual: true, maxLen: 400 },
    { name: "url", kind: "url", label: "Varumärkets webbplats" },
    { name: "logo", kind: "image", label: "Logotyp" },
    { name: "product", kind: "image", label: "Produktbild" },
  ],
};

/**
 * The course programme. THE ONE COLLECTION THAT SHIPS EMPTY, deliberately.
 *
 * The client's education copy promises a programme "här nedan"; the salon has
 * not published one. Seeding a plausible-looking course would put a fabricated
 * date and price on a live client site, so the defaults are `[]` and the page
 * renders `education.coursesEmpty` until the first real row is saved. The
 * "collections are never empty" rule in `tests/cms-config.test.ts` carries a
 * named carve-out for exactly this collection, and nothing else.
 */
export const COURSES: CollectionDef = {
  name: "courses",
  label: "Kurser & utbildningar",
  orderable: true,
  jsonFallback: () => withoutNotes(getCourses() as unknown as Record<string, unknown>[]),
  fields: [
    { name: "title", kind: "text", label: "Kursens namn", bilingual: true, required: true, maxLen: 120 },
    {
      name: "when",
      kind: "text",
      label: "När",
      maxLen: 80,
    },
    { name: "desc", kind: "textarea", label: "Beskrivning", bilingual: true, maxLen: 800 },
    { name: "price", kind: "text", label: "Pris", maxLen: 60 },
    { name: "link", kind: "url", label: "Anmälningslänk" },
    { name: "image", kind: "image", label: "Bild" },
  ],
};

export const CMS: CmsConfig = {
  /**
   * The site FACTS — the scalars in `content/site.json` a visitor can read.
   *
   * What is deliberately absent: `geo` (unverified coordinates, and a map pin is
   * not a text field), `locales` and `cancellation_policy.window_hours` (nothing
   * renders them), the whole `hours` container and `stats` (client round 3
   * 2026-08-27 took the fixed opening times and the homepage stat trio off the
   * site — the Öppettider column now prints the dictionary's `footer.openingNote`,
   * which is editable under "Öppettider" in the copy list instead),
   * and `showPrices` in `content/services.json` — a boolean, and the content
   * form has no checkbox renderer, so exposing it would mean asking the client
   * to type "true".
   */
  contentGroups: [
    {
      key: "kontakt",
      label: "Kontaktuppgifter",
      fields: [
        { key: "site.address.street", label: "Gatuadress", kind: "text" },
        { key: "site.address.postal", label: "Postnummer", kind: "text" },
        { key: "site.address.city", label: "Ort", kind: "text" },
        {
          key: "site.transit.metro",
          label: "Närmaste tunnelbana",
          kind: "text",
          hint: 'Visas som "T-bana …" i sidfoten och på kontaktsidan.',
        },
        {
          key: "site.contact.phone",
          label: "Telefon (för länken)",
          kind: "text",
          hint: "Internationellt format, t.ex. +46 8 663 30 14. Det här numret ringer telefonen upp.",
        },
        {
          key: "site.contact.phone_display",
          label: "Telefon (som det visas)",
          kind: "text",
          hint: "Skrivs ut på sidan, t.ex. 08-663 30 14.",
        },
        { key: "site.contact.email", label: "E-post", kind: "text" },
        {
          key: "site.contact.instagram",
          label: "Instagram — länk",
          kind: "url",
          hint: "Hela adressen, inklusive https://",
        },
        { key: "site.contact.instagram_handle", label: "Instagram — namn som visas", kind: "text" },
      ],
    },
    {
      key: "bokning",
      label: "Bokning",
      fields: [
        {
          key: "site.booking.url",
          label: "Bokningslänk",
          kind: "url",
          hint: "Varje BOKA-knapp på sajten går hit. Hela adressen, inklusive https://",
        },
        { key: "site.booking.provider", label: "Bokningssystem", kind: "text" },
      ],
    },
    {
      key: "fakta",
      label: "Salongens fakta",
      fields: [
        { key: "site.brand.name", label: "Salongens namn", kind: "text" },
        {
          key: "site.brand.tagline",
          label: "Undertext",
          kind: "text",
          bilingual: true,
          hint: "Används i sökmotorer och delningar.",
        },
        {
          key: "site.brand.founded",
          label: "Grundad år",
          kind: "number",
          hint: "Används av sökmotorer (foundingDate), syns inte som text på sidan.",
        },
      ],
    },
  ],

  /**
   * The F-009 allowlist: page copy the client may override, key by key.
   *
   * Two sources feed it and both are BARE dictionary keys, because
   * `pageCopyDict()` folds `src/lib/pagecopy.ts` into the same dictionary as
   * `ui.*.json` — so long-form page copy and a button label are overridden by
   * exactly the same mechanism.
   *
   * `nav.*` IS here, unlike in the reference project: routing in this codebase
   * goes through `ROUTES` in `src/i18n/routes.ts`, keyed by `PageKey`, so a nav
   * label is a piece of copy and nothing more. What stays out is the machinery
   * that has no visible text of its own.
   */
  editableCopy: [
    {
      page: "copy-home",
      label: "Startsidan",
      keys: [
        { key: "home.kicker", label: "Hero — överrubrik" },
        { key: "home.heading", label: "Hero — rubrik" },
        { key: "home.sub", label: "Hero — ingress" },
        { key: "home.teamHeading", label: "Teamet — rubrik" },
        { key: "home.metaTitle", label: "Sidtitel (webbläsarflik & Google)" },
      ],
    },
    {
      page: "copy-closing",
      label: "Avslutande bokningsband",
      keys: [
        { key: "closing.eyebrow", label: "Överrubrik" },
        { key: "closing.heading", label: "Rubrik" },
      ],
    },
    {
      page: "copy-about",
      label: "Om oss",
      keys: [
        { key: "about.heading", label: "Rubrik" },
        ...paraKeys("about", "body").map(paragraph),
      ],
    },
    {
      page: "copy-staff",
      label: "Teamsidan",
      keys: [
        { key: "staff.intro", label: "Ingress" },
        { key: "staff.metaDescription", label: "Beskrivning i Google" },
      ],
    },
    {
      page: "copy-contact",
      label: "Kontaktsidan",
      keys: [
        { key: "contact.heading", label: "Rubrik" },
        { key: "contact.directions", label: "Vägbeskrivning" },
        { key: "contact.cancellation", label: "Av- och ombokningsregler" },
        { key: "contact.metaDescription", label: "Beskrivning i Google" },
      ],
    },
    {
      page: "copy-competitions",
      label: "Utmärkelser",
      keys: [
        { key: "competitions.heading", label: "Rubrik" },
        { key: "competitions.intro", label: "Ingress" },
      ],
    },
    {
      page: "copy-pricing",
      label: "Behandlingar & priser",
      keys: [
        { key: "pricing.heading", label: "Rubrik" },
        ...paraKeys("pricing", "body").map(paragraph),
      ],
    },
    {
      page: "copy-education",
      label: "Utbildning & kurser",
      keys: [
        { key: "education.heading", label: "Rubrik" },
        ...paraKeys("education", "body").map(paragraph),
        { key: "education.coursesHeading", label: "Rubrik över kurslistan" },
        {
          key: "education.coursesEmpty",
          label: "Text när inga kurser är inlagda",
          hint: "Visas bara så länge listan Kurser & utbildningar är tom.",
        },
      ],
    },
    {
      page: "copy-brands",
      label: "Våra brands",
      keys: [
        { key: "brands.heading", label: "Rubrik" },
        { key: "brands.intro", label: "Ingress" },
      ],
    },
    {
      page: "copy-work",
      label: "Jobba hos oss",
      keys: [
        { key: "work.heading", label: "Rubrik" },
        ...paraKeys("work", "body").map(paragraph),
        { key: "work.aplHeading", label: "Mellanrubrik — APL & traineeplats" },
        ...paraKeys("work", "apl").map((key, index) => ({
          key,
          label: `APL — stycke ${index + 1}`,
        })),
      ],
    },
    {
      page: "copy-privacy",
      label: "Integritetspolicy",
      keys: [
        ...paraKeys("privacy", "body").map(paragraph),
        { key: "privacy.metaDescription", label: "Beskrivning i Google" },
      ],
    },
    {
      /**
       * The whole Öppettider surface, now that the salon keeps no fixed hours:
       * one paragraph in the footer column, editable in one place.
       */
      page: "copy-oppettider",
      label: "Öppettider",
      keys: [
        { key: "labels.hours", label: "Rubrik" },
        { key: "footer.openingNote", label: "Text" },
      ],
    },
    {
      page: "copy-meny",
      label: "Menyn",
      keys: [
        { key: "nav.staff", label: "Team" },
        { key: "nav.pricing", label: "Behandlingar" },
        { key: "nav.competitions", label: "Utmärkelser" },
        { key: "nav.education", label: "Utbildning & kurser" },
        { key: "nav.brands", label: "Våra brands" },
        { key: "nav.work", label: "Jobba hos oss" },
        { key: "nav.contact", label: "Kontakta oss" },
        { key: "nav.about", label: "Om oss (sidfoten)" },
        { key: "nav.blog", label: "Blogg" },
      ],
    },
    {
      page: "copy-knappar",
      label: "Knappar & etiketter",
      keys: [
        { key: "cta.book", label: "Boka tid" },
        {
          key: "cta.bookWith",
          label: "Boka tid hos en stylist",
          hint: "{name} byts automatiskt mot stylistens förnamn. Låt den stå kvar.",
        },
        { key: "cta.meetTeam", label: "Möt teamet" },
        { key: "cta.readStory", label: "Läs vår historia" },
        { key: "cta.allTeam", label: "Hela teamet" },
        { key: "cta.readMore", label: "Läs mer" },
        { key: "labels.openProfile", label: "Visa & boka (stylistkort)" },
        {
          key: "labels.address",
          label: "Kontakt (sidfotsrubrik)",
          hint: "Rubriken över telefon, e-post och Instagram i sidfoten.",
        },
        { key: "labels.menu", label: "Meny (mobilknapp)" },
        { key: "labels.close", label: "Stäng" },
      ],
    },
    {
      page: "copy-blogg",
      label: "Bloggens texter",
      keys: [
        { key: "blog.title", label: "Rubrik" },
        { key: "blog.intro", label: "Ingress" },
        { key: "blog.empty", label: "Text när inga inlägg finns" },
        { key: "blog.back", label: "Tillbaka-länk" },
        {
          key: "labels.readingTime",
          label: "Lästid",
          hint: "{n} byts automatiskt mot antalet minuter. Låt den stå kvar.",
        },
        { key: "footer.privacy", label: "Integritetspolicy (länk & rubrik)" },
      ],
    },
  ],

  collections: [STAFF, SERVICES, AWARDS, BRANDS, COURSES],

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
      /**
       * LIKE rather than equality: an `image` content field stores the bare key,
       * but a key can also sit INSIDE a longer value, and a warning that only
       * catches the exact match is a warning that misses the interesting case.
       * Clearing blanks the whole side, which is the honest move — the field
       * falls back to its developer default on the next render.
       */
      label: "Innehållsfält",
      sql: "SELECT COUNT(*) AS n FROM content_kv WHERE value_sv LIKE '%' || ?1 || '%' OR value_en LIKE '%' || ?1 || '%'",
      clearSql:
        "UPDATE content_kv SET value_sv = CASE WHEN value_sv LIKE '%' || ?1 || '%' THEN '' ELSE value_sv END, value_en = CASE WHEN value_en LIKE '%' || ?1 || '%' THEN '' ELSE value_en END WHERE value_sv LIKE '%' || ?1 || '%' OR value_en LIKE '%' || ?1 || '%'",
    },
    {
      /** Same reasoning as the post body: SQL surgery on a JSON payload corrupts it. */
      label: "Listor",
      sql: "SELECT COUNT(*) AS n FROM collection_items WHERE data LIKE '%' || ?1 || '%'",
    },
  ],

  /**
   * The stable admin sections. The per-group, per-copy-page and per-collection
   * links are DERIVED from the three arrays above by `AdminNav`, so a new
   * editable surface appears in the nav and on the dashboard from one edit here
   * — listing them again would be a second place to forget.
   */
  adminNav: [
    { href: "/admin", labelKey: "nav.dashboard", icon: "grid" },
    { href: "/admin/posts", labelKey: "nav.blog", icon: "film" },
    { href: "/admin/media", labelKey: "nav.media", icon: "image" },
  ],
};
