# Salong NOVO v2 — Architecture

Status: **FULL BUILD COMPLETE & VERIFIED** (245 tests green, `tsc` clean, `astro build` green;
the §10.1 acceptance trace — create → write Markdown → publish → live on `/blogg`, drafts stay
private — verified end-to-end against local D1, 2026-06-01). Both formerly-remaining layers are
now done: (1) **visual design** — "Haute Editorial" + live-site recognition layer, LOCKED and
applied across `tokens.css` + every public component (§11 + `Planning/DESIGN-SYSTEM.md`); (2) the
**Admin Panel UI** — the full Cloudflare-Access-gated blog editor (dashboard, Markdown toolbar +
live preview, image upload/picker, draft/publish, draft preview) built per §10, sub-phases 4a–4f.
The only remaining items are genuine content/ops tasks, not code: real NOVO competition imagery via
R2, the deferred WebP variant Worker (the render path already falls back gracefully — §10.7), and
creating the Cloudflare Access app + D1/R2 resources at deploy (§8).

> **⚠ Structure revision — client-confirmed IA (2026-06-01).** The client sent the site structure
> (`Text input/Client specifications.docx`). It **changes the public IA** the code currently ships:
> seven named nav tabs, a reversed pricing decision ("Bokning och priser" — prices are now shown),
> two new pages (Utbildning & kurser, Våra brands), `awards`→`Tävlingar`, the About story folded
> into the homepage, and a fully specified homepage. The blog + manual editor (§10) are **kept as-is**
> (the client didn't list a blog; we retain it per David's instruction and move it to the footer).
> **§2A is the new source of truth for the public IA + homepage; it supersedes the route map in §2,
> §6 and `src/i18n/routes.ts` until the §12 migration lands.** The §10 admin/blog spec is unaffected.

---

## 1. Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | **Astro 7** (`output: 'static'`) | Static-by-default marketing pages; opt-in server routes |
| Hosting | **Cloudflare Workers + Static Assets** (`@astrojs/cloudflare` v14) | Cheap, fast, self-contained; same account as D1/R2/Access. v14 dropped the Pages target. |
| Database | **Cloudflare D1** (SQLite) | Blog posts + media; serverless, no external service |
| Object storage | **Cloudflare R2** | Uploaded images + variants; no egress fees |
| Admin auth | **Cloudflare Access** (Zero Trust) | Edge-enforced identity, zero app-side password to secure |
| Markdown | **markdown-it** (`html:false`) | Safe rendering — no author HTML reaches the page |
| Tests | **Vitest** | Pure-logic unit tests, run in Node |

**Rendering model:** marketing pages prerender to static HTML. Blog (`/blogg`, `/blogg/[slug]`
+ EN) and the admin API (`/api/admin/*`) set `export const prerender = false` and render at
request time against D1. One framework, one repo, one deploy.

---

## 2. Directory map

```
salong-novo-v2/
├── src/
│   ├── layouts/Base.astro          # <html>, SEO, hreflang, JSON-LD, header/footer
│   ├── components/                 # SiteHeader, SiteFooter, BookingButton, StaffGrid,
│   │                               #   Home, ArticlePage, ContactPage, StaffPage,
│   │                               #   BlogList, PostView
│   ├── pages/                      # SV at root, EN under /en/ (manual locale routing)
│   │   ├── *.astro                 # home, om-oss, personal, tjanster, jobba-pa-novo,
│   │   │                           #   kontakt, utmarkelser, integritet
│   │   ├── blogg/{index,[slug]}    # server (D1)
│   │   ├── en/...                  # full EN mirror
│   │   ├── api/admin/{posts,upload}# server write API (Access-gated)
│   │   ├── sitemap.xml.ts, robots.txt.ts
│   ├── lib/                        # PURE, TESTED logic (see §4)
│   ├── i18n/                       # routes + ui.sv/ui.en + t() resolver
│   ├── middleware.ts               # 301 legacy redirects at the edge
│   ├── styles/tokens.css           # placeholder → restyle per §11 / DESIGN-SYSTEM.md §8
│   └── env.d.ts                    # Cloudflare binding types (DB, MEDIA, vars) + App.Locals
├── content/                        # staff.json, services.json, awards.json, site.json, copy.md
├── migrations/0001_init.sql        # posts + media tables
├── tests/                          # 9 suites, 62 tests
├── astro.config.mjs, wrangler.toml, tsconfig.json, vitest.config.ts
└── Planning/ · Design input/ · Current actuals/   # docs, mockups, live snapshot
```

---

## 2A. Public site IA & homepage — client-confirmed structure (2026-06-01)

Source: `Text input/Client specifications.docx` (Swedish). This section **supersedes** the public-page
route map in §2 / §6 / `src/i18n/routes.ts`. It does **not** touch the admin/blog spec (§10). Per-tab
copy and most imagery are being **mailed separately by the client as each tab is finished** — so the
build target here is the *structure* (routes, nav, page shells, the homepage layout); copy/assets drop
in as they arrive. Pages awaiting content ship a tasteful "Innehåll kommer snart" state, never a 404.

### 2A.1 Primary navigation (exactly these seven tabs, in this order)

| # | Nav label (SV / EN) | PageKey | Slug (SV / EN) | Status |
|---|---------------------|---------|----------------|--------|
| 1 | Kontakta oss / Contact | `contact` | `kontakt` / `contact` | **Exists** — info-only, no form (unchanged) |
| 2 | Team / Team | `staff` | `personal` / `staff` | **Exists** — relabel "Personal"→"Team"; slug unchanged (keeps `/team`→`/personal` redirect valid) |
| 3 | Bokning & priser / Booking & prices | `pricing` *(was `services`)* | `priser` / `prices` *(was `tjanster`/`services`)* | **Repurpose + content** — now shows a **price list** + Voady CTA. ⚠ Reverses the old "no prices / services deferred" decision |
| 4 | Tävlingar / Competitions | `competitions` *(was `awards`)* | `tavlingar` / `competitions` *(was `utmarkelser`/`awards`)* | **Rename** — NOVO is competition-led; `awards.json` content carries over |
| 5 | Utbildning & kurser / Education & courses | `education` | `utbildning-och-kurser` / `education` | **NEW page** — content mailed later |
| 6 | Våra brands / Our brands | `brands` | `varumarken` / `brands` | **NEW page** — content mailed later (Schwarzkopf flagship + carried lines) |
| 7 | Jobba hos oss / Work with us | `work` | `jobba-pa-novo` / `careers` | **Exists** — relabel "Jobba på NOVO"→"Jobba hos oss"; slug unchanged |

**Not in the primary nav (live in the footer):**

| PageKey | Why footer, not nav |
|---------|---------------------|
| `blog` (`blogg`/`blog`) | Client's spec lists no blog. **Retained per David** — full §10 Access-gated manual editor unchanged; just dropped from primary nav into the footer. |
| `about` (`om-oss`/`about`) | The client folded the founders/salon **story into the homepage** (§2A.2 §3). The standalone page is **demoted**: kept as a secondary route (footer + a "Läs hela historien" link from the home story block), removed from primary nav. Content is not destroyed. |
| `privacy` (`integritet`/`privacy`) | Legal — footer only (already the case). |

Net PageKey delta: **add** `education`, `brands`; **rename** `services`→`pricing`, `awards`→`competitions`;
**keep** `home`, `staff`, `work`, `contact`, `blog`, `about`, `privacy`. So `PageKey` becomes:
`home | staff | pricing | competitions | education | brands | work | contact | blog | about | privacy`.

### 2A.2 Homepage layout (the client's förstasida, top → bottom)

The home page is a sequence of full-width sections. Each maps to a component slot; the design system
(§11) governs the styling. **Pending assets** are flagged — they slot in without layout changes.

1. **Hero.** *Now:* the NOVO logo / a soft brand visual (no hard imagery). *Later (pending):* a muted,
   looping, full-bleed **salon ambience video** (miljö/känsla) as the background — progressive
   enhancement only. Build it as `<video muted loop playsinline preload="none" poster="<logo-frame>">`
   gated behind `prefers-reduced-motion: no-preference` **and** the Save-Data hint; the logo/poster is
   the permanent no-JS / reduced-motion / slow-connection fallback. **No layout change when the video
   arrives** — it drops behind the existing hero.
2. **Primary CTA — "Boka tid".** Large terracotta `BookingButton` (Voady `https://bokning.voady.se/novo`)
   overlaid on / directly beneath the hero. This is the page's dominant action.
3. **Hair-gallery strip.** A horizontal **scroll-snap row** of editorial hair photos ("rulla lite fina
   hårbilder i en rad"). *Pending:* real photos — ship durable placeholders. Respect
   `prefers-reduced-motion` (no auto-advance); keyboard/scroll accessible; lazy-loaded.
4. **Founders story.** Photo of the owners ("mig och Chriss") + a short story about them and the salon
   ("en story om oss och salongen"). Condensed from the `about` content; ends with an optional
   "Läs hela historien" → `/om-oss`. *Pending:* owners' photo + final story copy.
5. **Team.** A grid of stylist photos. **On hover** (desktop) a short per-stylist bio overlay reveals
   ("när man drar pilen över varje bild … en kort text om just den frisören"). *Pending:* the client is
   **mailing each stylist's text**; until then bios fall back to name + role from `staff.json`.
   Links through to the full **Team** page (`/personal`, grid→modal + per-person Voady link, unchanged).

**Accessibility contract for the home interactions (mandatory, tested where logic exists):**
- The team hover-bio **must** have a keyboard + touch equivalent: reveal on `:focus-within` and on
  tap/click (toggle), not hover-only. Bio text is always in the DOM (not injected on hover) so it's
  reachable by AT and indexable.
- Video + gallery auto-motion are suppressed under `prefers-reduced-motion: reduce`; video also
  suppressed under Save-Data. The hero is fully usable (logo + CTA) with zero JS.

### 2A.3 Content-readiness ledger (what blocks each new/changed page)

| Page | Structure | Copy | Imagery | Unblocks when |
|------|-----------|------|---------|---------------|
| Home | buildable now | story copy pending | salon video, hair strip, owners photo, stylist texts pending | client mails assets/texts |
| `pricing` (Bokning & priser) | buildable now | **price list pending** | — | client mails prices |
| `competitions` (Tävlingar) | buildable now | carries `awards.json`; refresh pending | competition imagery pending | client mails copy/photos |
| `education` (Utbildning & kurser) | buildable now | pending | pending | client mails per-tab |
| `brands` (Våra brands) | buildable now | pending | brand logos pending | client mails per-tab |

> Until copy lands, each page renders its heading + a localized **"Innehåll kommer snart / Coming soon"**
> block and the booking CTA. This is honest and shippable — not a placeholder dead-end.

---

## 3. Request / data flow

```
Browser ─▶ Cloudflare Workers
            │
            ├─ middleware.ts ─ resolveRedirect() ─▶ 301 (legacy URLs)
            │
            ├─ static page  ────────────────────▶ prerendered HTML (marketing)
            │
            ├─ /blogg, /blogg/[slug]  ─ listPublished()/getBySlug() ─▶ D1 ─▶ renderMarkdown()
            │
            └─ /api/admin/* (Cloudflare Access) ─ insert/update/delete ─▶ D1
                                                 └ upload ─▶ R2 (+ media row)
```

Publishing a post writes to D1 and is **live immediately** (edge-cached, no rebuild).

---

## 4. Core modules (`src/lib`, `src/i18n`) — all unit-tested

| Module | Responsibility | Tests |
|--------|----------------|-------|
| `i18n/routes.ts` | Locale + per-locale slug map, `localizePath`, `alternates`, `localeFromPath` | i18n.test |
| `i18n/index.ts` | `t(locale,key,vars)` with fallback + interpolation | i18n.test |
| `lib/slug.ts` | Swedish-aware `slugify`, `uniqueSlug` | slug.test |
| `lib/markdown.ts` | Safe Markdown→HTML (`html:false`), excerpt, reading time | markdown.test |
| `lib/images.ts` | R2 variant keys, `srcset`, responsive `<img>` attrs | images.test |
| `lib/posts.ts` | `Post` type + pure filters (`publishedPosts`, `paginate`, …) | posts.test |
| `lib/db.ts` | D1 query layer + `mapRow` (testable `Database` interface). `getBySlug` is **published-only** (drafts never public); `listPublished` requires `published_at`; `listAll` = admin dashboard | db.test |
| `lib/content.ts` | Typed loaders for staff/services/awards/site JSON | content.test |
| `lib/seo.ts` | `HairSalon` JSON-LD + OG/Twitter meta | seo.test |
| `lib/redirects.ts` | Legacy-URL → new-URL 301 map | redirects.test |
| `lib/pagecopy.ts` | Localized long-form page copy (SV canonical, EN draft) | — |

**Design principle:** all logic that *can* be pure and testable *is* — the `.astro` files are
thin presentation that call into this tested core. Choosing a design changes the `.astro`
CSS/markup, never the `lib`.

---

## 5. Data model (D1 — `migrations/0001_init.sql`)

`posts`: `id, slug, locale('sv'|'en'), title, excerpt, body(Markdown), cover_image,
author, status('draft'|'published'), seo_title, seo_desc, published_at, created_at,
updated_at` — `UNIQUE(locale, slug)`, indexed on `(locale, status, published_at DESC)`.
Posts are **single-language** (a post shows only on its locale).

`media`: `id, post_id, r2_key, alt, width, height, variants(JSON), created_at`. `post_id` is
**nullable** (`ON DELETE SET NULL`): uploads do **not** auto-link to a post — the admin associates
them at save (§10.7). Orphan rows (`post_id IS NULL`) are expected and swept later.

---

## 6. i18n

SV is canonical at the root; EN is served under `/en`. Slugs differ per locale
(`/om-oss` ↔ `/en/about`), so routing is **manual file-based** (Astro's built-in i18n can't
express divergent slugs). `Base.astro` emits `<link rel=alternate hreflang>` for both
locales + `x-default` from `alternates(pageKey)`.

---

## 7. Security

- **Admin:** Cloudflare Access gates `/admin` + `/api/admin/*` at the edge. `ADMIN_API_TOKEN`
  header check is defense-in-depth only. No password is stored or verified in app code.
- **Blog content:** stored as Markdown, rendered with raw HTML **disabled** → author input can
  never inject `<script>`/event handlers (proven in `markdown.test.ts`).
- **Uploads:** MIME allowlist + 10 MB cap + randomized R2 keys.
- **Secrets:** in Cloudflare env / `.dev.vars` (gitignored), never in the repo.

---

## 8. Deployment (Cloudflare Workers)

1. `wrangler d1 create novo_db` → paste id into `wrangler.toml`; `wrangler r2 bucket create novo-images`.
2. `npm run db:migrate:remote`.
3. `npx astro build && npx wrangler deploy` (the adapter generates the worker entry + assets binding into `dist/`).
4. Bind D1 (`DB`), R2 (`MEDIA`), set vars/secrets: `PUBLIC_SITE_URL` (apex), `PUBLIC_IMAGE_BASE`
   (`""` for Stage-A image serving — see §10.7), `PUBLIC_BOOKING_URL`, `ADMIN_API_TOKEN`.
   *(The admin-auth vars `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN` and the `DEV_ADMIN_EMAIL`-absence
   guard `assertNoDevBypassInProd` arrive with the §10 admin build — not built yet.)*
5. **(After the §10 admin build)** Create the Cloudflare Access application + policy on `/admin*`
   and `/api/admin*` (exact setup in §10.3); copy the AUD tag + team domain into the env vars above.
6. DNS: point the **canonical apex `salongnovo.se`** at Pages and add a **`www` → apex 301**
   (Cloudflare Bulk Redirect / Pages redirect rule) so canonical, sitemap, and OG tags (all apex
   now) resolve to one host; `middleware.ts` handles legacy path 301s.

---

## 9. Status of formerly-deferred items (now built) + what genuinely remains

**✅ Admin Panel UI — BUILT** (sub-phases 4a–4f, §10). The full Cloudflare-Access-gated panel: auth
core (`src/lib/access.ts`, RS256 via Web Crypto, 42 tests) + middleware identity; dashboard
(`listAdmin` + filter/search + delete); editor with Markdown toolbar, server-rendered live preview
(preview == production), auto-slug, SEO counters, dirty guard, draft/publish/unpublish; image upload
(magic-byte sniff, MIME-derived key) + cover/inline pickers + public R2 streaming (`/api/media/*`);
Access-gated draft preview via the real `PostView`. A non-technical user can now write and publish a
post with no developer in the loop — **verified end-to-end against local D1** (the §10.1 trace).

**✅ Visual design — APPLIED.** "Haute Editorial" + recognition layer (§11). `tokens.css` carries the
locked tokens; every public component (SiteHeader glass + SV/EN, SiteFooter recognition bar, terracotta
BookingButton, editorial Home hero, StaffGrid, PostView prose, …) is restyled to the direction. Fonts
(Playfair Display + Hanken Grotesk) load globally via `Base.astro`.

**Genuinely remaining (content/ops, not code):**

- **Real imagery** — hero + signature photography = real NOVO competition/award editorial work, via
  R2 (an asset migration). The current placeholders are durable stand-ins (§11.8 / DESIGN-SYSTEM §9).
- **Image variant generation** — the WebP-resize Worker (`src/workers/variant-gen.ts`) is spec-only.
  This is honest and invisible: `responsiveImageAttrs` + `parseVariants` (built) serve the original
  with **no srcset** when `variants` is empty, so no image 404s; when the Worker ships it writes the
  `variants` column and the next render auto-upgrades to a full `srcset` with **zero caller changes**.
  Encoder choice deferred (§10.12 #6).
- **Deploy resources** — create the Cloudflare Access app + policy (§10.3), `wrangler d1 create` /
  `r2 bucket create`, set the prod env vars (§8 / B11), and the `www → apex` redirect. Code is ready.
- **GA4 + cookie consent**, **full GDPR policy**.

**Added by the 2026-06-01 client structure (see §2A / §12):**

- **Phase 5 — IA migration (code):** route map + nav + page renames/creates + redirects to the
  client-confirmed seven-tab structure (§12). The one genuinely *new code* task in this revision.
- **Bokning & priser** — the old "no prices" decision is reversed; a price list is now required
  (content pending — client mails it).
- **Two new pages** — Utbildning & kurser, Våra brands (content pending — mailed per tab).
- **Homepage build-out** — hero video, hair-gallery strip, founders story, team hover-bios (§2A.2);
  structure buildable now, assets/texts pending from the client.

---

## 10. Admin Panel — Full Specification & Build Plan

> Phase 4 of `Planning/REBUILD-2026-PLAN.md §6`. The blog write API exists (`POST/PUT/DELETE
> /api/admin/posts`, `POST /api/admin/upload`) but has no UI and no list/read endpoints. This
> section is the build plan **and** the final reference for the admin: the Cloudflare-Access-gated
> panel where a non-technical salon owner writes, illustrates, previews and publishes blog posts.
> It is additive — it does not rebuild §4's tested core; it extends it in the same idiom (pure
> logic in `src/lib`, thin `.astro`/middleware wiring, Vitest at every seam).
> **Read §10.0 first** — it records what a 2026-06-01 review already fixed in the built code and
> the precision corrections to apply while building, so the build doesn't re-fix or re-break them.
>
> **Client-IA note (2026-06-01):** the client's structure spec lists no blog. This entire section is
> **retained unchanged per David** — the manual Access-gated editor stays. The only effect of the new
> IA on the blog is **placement**: the public blog link moves from primary nav into the **footer**
> (§2A.1, §12.5). Routes (`/blogg`, `/blogg/[slug]` + EN), the API, and the admin panel are untouched.

### 10.0 Build-readiness status (read first)

A consolidated team review (`Planning/PLAN-REVIEW.md`, 2026-06-01) hardened the built core and
sharpened this spec. **The build starts from this state — do not redo these:**

**Already fixed in the built `src/**` (verified: `tsc` clean, tests green, `astro build` green):**

| Ref | Fixed |
|-----|-------|
| A1 | `getBySlug` is **published-only** — drafts are not publicly readable. The admin preview (4e) must therefore use an **id-based** lookup (`getById`), not `getBySlug`. |
| A2 | PUT **freezes a published post's slug** (loads the row; recomputes only for drafts; 404 on missing id). This is the interim form of §10.6 `resolveSlug` — see B7 below. |
| A6 | `upload.ts` no longer returns the guaranteed-404 `previewVariant`. |
| A7 | Blog post detail pages suppress cross-locale `hreflang` (single-language posts) via `Base.astro`'s new `alternateLinks={null}` prop. |
| A8/A10/A12 | Staff-modal focus target fixed; both blog routes `.catch(()=>null)` (DB error → 404, not 500); `listPublished` requires `published_at IS NOT NULL`. |
| B5 | `db.test.ts` now covers `updatePost`/`deletePost`/`listAll` (closes the §4 "all unit-tested" claim). |
| A11 | Dead `stripLocale` (a divergent-slug trap) deleted. |
| config | Canonical is the **apex** `https://salongnovo.se`; `PUBLIC_SITE_URL` (apex) and `PUBLIC_IMAGE_BASE=""` set in `wrangler.toml` + `.env.example`. |

**Still latent (fix *in* the admin build, not before — they need infra this build adds):** A3 upload
magic-byte sniff (4d), A4+B6 absolute `og:image` (needs the 4d `/api/media` route), A5 `images.ts`
fallback `responsiveImageAttrs` (4d), A9 render the cover on-page (4d `PostView`).

**Build-precision corrections (apply these while building — they prevent re-introducing the fixed bugs):**

- **B3** — `parsePostWrite` must reject `invalid_locale` (no silent `"sv"` default). Replace the locale
  coercion in **both** the POST (`toInput`) and the PUT (inline) sites — not just one.
- **B6** — the §10.7 `PostView` change must **also** resolve the cover to an absolute URL for `og:image`
  (`originalUrl(base,key)`), not only render the visible `<img>`. (Closes live bug A4.)
- **B7** — 4c **deletes** the current PUT slug block (the A2 freeze) and replaces it with
  `resolveSlug(existing, override, takenSlugs)` — do **not** layer `resolveSlug` on top of it.
- **B9** — `insertPost` **and** `updatePost` must append `RETURNING *` and read via `.first<PostRow>()`
  then `mapRow` (the pattern already in `getBySlug`); "returns `Post`" applies to both.
- **B10** — the author-default precedence (`body.author → locals.user?.email → ""`) lives in the **route
  handler** (where `locals` exists), not in `parsePostWrite` (which §10.4 keeps pure/env-free). `toInput`
  is removed; don't reference it.

**Env-var invariants (B11) — set exactly these per environment:**

| Var | Prod value | Local (`.dev.vars`) | Consumed by |
|-----|-----------|---------------------|-------------|
| `PUBLIC_SITE_URL` | `https://salongnovo.se` (apex) | apex | canonical/sitemap/JSON-LD + §10.8 CSRF origin check |
| `PUBLIC_IMAGE_BASE` | `""` (Stage A) → `https://img.salongnovo.se` at Stage-B cutover | `""` | `servedUrl` / `upload.ts` |
| `ADMIN_API_TOKEN` | set (defense-in-depth) | a dev token | write-API token check |
| `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` | set (from the Access app) | **unset** (skips JWT path) | `verifyAccessJwt` (4a) |
| `DEV_ADMIN_EMAIL` | **must be absent** (`assertNoDevBypassInProd` throws) | set (simulates Access identity) | dev-only admin identity |

A wrong `PUBLIC_SITE_URL` 403s admin writes on the Origin-fallback path; a non-empty `PUBLIC_IMAGE_BASE`
at launch breaks Stage-A image previews. These two are the easiest to get wrong — verify them at deploy.

### 10.1 Goal & acceptance criteria

**Goal.** The salon owner (non-technical, Swedish-speaking) logs in through Cloudflare Access and,
with no developer in the loop, writes a formatted blog post, inserts images with alt text, previews
it exactly as it will appear live, and publishes it — to the SV or EN blog per the post's locale.

**The non-technical-user test (the acceptance gate for Phase 4):**

> A salon staffer opens `/admin`, authenticates via email one-time-PIN, clicks **Nytt inlägg**,
> types a title (the slug auto-fills), writes Markdown using a toolbar (bold/heading/list/link),
> uploads a cover image and an inline image (each with alt text), watches a live preview that is
> byte-identical to the published page, clicks **Förhandsgranska** to see the full draft, clicks
> **Publicera**, and the post is live on `/blogg` (or `/en/blog`) immediately — no rebuild, no code.

Concrete pass conditions:

| # | Criterion |
|---|-----------|
| AC-1 | Unauthenticated `/admin` access is blocked at the edge by Access; the owner reaches it via email OTP. |
| AC-2 | Dashboard lists every post (both locales, draft + published) with status, locale, updated date; filter + search work. |
| AC-3 | Editor auto-slugs from title, supports a Markdown toolbar, and shows a live preview rendered by the **same** `renderMarkdown` the public page uses. |
| AC-4 | Cover + inline image upload to R2 succeed; inserted images render in preview and on the published page; alt text is required before insert. |
| AC-5 | **Spara utkast** keeps a post off `/blogg`; **Publicera** makes it appear immediately; **Avpublicera** removes it again. |
| AC-6 | A published post's slug never silently changes when its title is edited (live URLs are stable). |
| AC-7 | `npm test` + `npm run typecheck` + `npm run build` all green; the existing 62 tests stay green. |

### 10.2 Information architecture & routes

Admin lives under two prefixes, both Access-gated: pages at `/admin/*`, JSON API at `/api/admin/*`.
The admin uses its own `AdminBase.astro` shell (Swedish-only, `noindex`, no public header/footer),
**never** the public `Base.astro`.

```
src/
├── layouts/
│   └── AdminBase.astro              NEW  admin chrome: <html lang="sv">, noindex, tokens.css,
│                                         AdminNav (Dashboard · Nytt inlägg · Visa sajt · email · logga ut)
├── components/admin/
│   ├── AdminNav.astro               NEW  top nav + Access email readout + /cdn-cgi/access/logout
│   ├── PostList.astro               NEW  dashboard table (title/locale/status/updated/actions)
│   ├── PostEditor.astro             NEW  the editor form shell (meta, toolbar, textarea, preview, pickers, action bar)
│   ├── MarkdownToolbar.astro        NEW  static role="toolbar" buttons with data-cmd + SV aria-labels
│   ├── ImagePicker.astro            NEW  inline-image dialog: dropzone + required alt + recent grid
│   └── CoverPicker.astro            NEW  cover-image thumb + byt/ta bort
├── pages/admin/
│   ├── index.astro                  NEW  DASHBOARD — SSR listAll(DB) → PostList
│   ├── posts/new.astro              NEW  EDITOR (create) — empty draft
│   ├── posts/[id].astro             NEW  EDITOR (edit)   — SSR getById(DB,id) → PostEditor, 404 if missing
│   └── preview/[id].astro           NEW  Access-gated draft preview via the real PostView.astro
├── pages/api/admin/
│   ├── posts.ts                     CHG  + GET (list/filter); fix PUT slug clobber; return full Post; CSRF; author default
│   ├── posts/[id].ts                NEW  GET one post by id (edit-form load / client refresh)
│   ├── media.ts                     NEW  GET list media (picker) · DELETE media (R2 + variants + row)
│   ├── upload.ts                    CHG  magic-byte sniff; MIME-derived ext; servedUrl; UploadResponse; CSRF
│   └── preview.ts                   NEW  POST { body } → { html } via renderMarkdown (live-preview fetch)
├── pages/api/media/
│   └── [...key].ts                  NEW  PUBLIC streaming GET of an R2 object (Stage-A serving)
├── admin/                           NEW  client controllers (the only /admin JS)
│   ├── editor.client.ts             NEW  wires PostEditor DOM → lib/editor; preview/upload/save fetches; dirty guard
│   └── dashboard.client.ts          NEW  filter/search + delete-confirm
├── lib/
│   ├── access.ts                    NEW  Access JWT verify (Web Crypto) + CSRF + dev-bypass tripwire (pure, tested)
│   ├── editor.ts                    NEW  caret/Markdown/validation/slug-state/counters/dirty (pure, tested)
│   ├── admin-api.ts                 NEW  shared request/response TYPES + error envelope (imported by routes AND client)
│   ├── admin-validate.ts            NEW  pure parse/normalize of untrusted JSON bodies (tested)
│   ├── admin-strings.ts             NEW  SV-only admin UI copy (flat typed const)
│   ├── media.ts                     NEW  sniff/ext/markdown/servedUrl/extractMediaKeys (pure, tested)
│   ├── db.ts                        CHG  getById, takenSlugs, listAdmin, listMedia, insertMedia, deleteMediaRow,
│   │                                     mediaUsage; insert/update now RETURN the Post
│   ├── slug.ts                      CHG  + resolveSlug (immutable-after-publish policy, pure)
│   ├── posts.ts                     CHG  + nextPublishedAt (publish-transition helper, pure)
│   └── images.ts                    CHG  + parseVariants, responsiveImageAttrs (graceful fallback)
├── pages/robots.txt.ts              CHG  (already Disallow /admin + /api/ — verified; no change needed)
├── styles/admin.css                 NEW  admin-only CSS on the dark token theme; shares PostView prose rules
├── env.d.ts                         CHG  ACCESS_AUD?, ACCESS_TEAM_DOMAIN?, DEV_ADMIN_EMAIL?; App.AdminUser; locals.user
├── workers/variant-gen.ts           SPEC-ONLY  deferred variant pipeline (documents the seam; not built)
└── scripts/gc-media.ts              NEW (optional v1.1)  orphan-media sweep
```

**Route table.** Every admin route sets `export const prerender = false` and guards
`Astro.locals.db` (stamped by the middleware from `bindings()`) exactly like the existing blog pages.

| Route | File | Renders / does |
|-------|------|----------------|
| `/admin` | `admin/index.astro` | Dashboard — `listAll(DB)` → `PostList`. |
| `/admin/posts/new` | `admin/posts/new.astro` | Editor, create mode (empty draft: `locale:'sv'`, `status:'draft'`). |
| `/admin/posts/[id]` | `admin/posts/[id].astro` | Editor, edit mode — `getById(DB,id)`; 404 if absent. |
| `/admin/preview/[id]` | `admin/preview/[id].astro` | Access-gated draft preview via real `PostView.astro` in `AdminBase`. |
| `GET /api/admin/posts` | `api/admin/posts.ts` | List + filter for the dashboard / client refresh. |
| `GET /api/admin/posts/[id]` | `api/admin/posts/[id].ts` | Load one post by id. |
| `POST/PUT/DELETE /api/admin/posts` | `api/admin/posts.ts` | Create / update / delete. |
| `POST /api/admin/preview` | `api/admin/preview.ts` | Markdown → HTML for the live preview pane. |
| `POST /api/admin/upload` | `api/admin/upload.ts` | Image upload → R2 + media row. |
| `GET/DELETE /api/admin/media` | `api/admin/media.ts` | List media (picker) / delete media. |
| `GET /api/media/[...key]` | `api/media/[...key].ts` | **Public** R2 object streaming (no auth — images are public content). |

> **Reconciled decision (route naming).** Editor routes nest under `/admin/posts/*` (not bare
> `/admin/[id]`) so the URL space stays REST-clean and `/admin/preview/[id]` and a future
> `/admin/media` don't collide with a catch-all id segment. The two UI specialists split on this;
> `posts/new` + `posts/[id]` + `preview/[id]` is the chosen layout.

### 10.3 Authentication (Cloudflare Access)

**Posture.** The writer pool is 1–3 known emails and the data is low-sensitivity (blog drafts +
images). Cloudflare Access (Zero Trust) is the **sole identity gatekeeper** at the edge: any request
reaching the origin for `/admin/*` or `/api/admin/*` has already passed an Access policy. The origin
verifies the Access JWT as belt-and-suspenders and treats the Access-injected email header as the
identity. `ADMIN_API_TOKEN` remains a second factor on the write API only. App-level password auth
was explicitly rejected (§7).

**Dashboard setup — one Access Application, two path rules.** Zero Trust → Access → Applications →
Add → Self-hosted:

| Field | Value |
|-------|-------|
| Application name | `Salong NOVO Admin` |
| Session Duration | `24h` (re-auth next working day) |
| Application domain 1 | `salongnovo.se` · path `/admin` (covers `/admin/*`) — match the canonical apex host (§8) |
| Application domain 2 | `salongnovo.se` · path `/api/admin` (covers `/api/admin/*`) |
| Identity provider | Built-in **One-time PIN** (email OTP) — zero IdP config |
| Policy (Action = Allow) | Rule **Emails** → `info@salongnovo.se` + named writer addresses (explicit allowlist, least privilege) |
| App Launcher | Off (owner bookmarks `/admin`) |
| Cookie | Default (HttpOnly, Secure, SameSite=Lax `CF_Authorization`) |

Access path matching is prefix-based, so `/admin` and `/api/admin` are **distinct prefixes** — both
must be declared (one rule does not cover the other). After creating the app, copy the **Application
Audience (AUD) tag** (Overview) and note the team domain `https://<team>.cloudflareaccess.com`; both
feed JWT verification below. The bucket/site is already orange-clouded (Cloudflare Workers), so no extra
DNS work.

**Middleware identity.** Extend the existing redirect-only `src/middleware.ts` with an admin gate that
runs **only** for `/admin*` and `/api/admin*`, verifies the Access JWT, and populates `locals.user`.
All decode/validate/verify logic is pure and tested in `src/lib/access.ts`; the middleware is thin
edge wiring (the §4 architecture law).

```ts
// src/middleware.ts (extended)
import { defineMiddleware } from "astro:middleware";
import { resolveRedirect } from "./lib/redirects";
import { verifyAccessJwt } from "./lib/access";

const ADMIN_RE = /^\/(admin|api\/admin)(\/|$)/;

export const onRequest = defineMiddleware(async (context, next) => {
  // 1) existing legacy-redirect pass (unchanged)
  const target = resolveRedirect(context.url.pathname);
  if (target && target !== context.url.pathname) return context.redirect(target, 301);

  // 2) admin identity (only for admin surfaces)
  if (ADMIN_RE.test(context.url.pathname)) {
    const env = await bindings();
    const h = context.request.headers;
    const jwt = h.get("Cf-Access-Jwt-Assertion");
    const headerEmail = h.get("Cf-Access-Authenticated-User-Email");
    let user: App.AdminUser | null = null;

    if (jwt && env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN) {
      const res = await verifyAccessJwt(jwt,
        { aud: env.ACCESS_AUD, teamDomain: env.ACCESS_TEAM_DOMAIN },
        { fetchJwks: makeJwksFetcher() });
      if (res.ok) user = { email: res.identity.email || headerEmail || "", source: "access" };
      else return adminUnauthorized(context, res.reason);   // 403 (see below)
    } else if (headerEmail) {
      user = { email: headerEmail, source: "access-header" }; // Access present, verify not configured
    } else if (env.DEV_ADMIN_EMAIL) {
      user = { email: env.DEV_ADMIN_EMAIL, source: "dev" };   // LOCAL DEV bypass only
    }
    context.locals.user = user; // null when unauthenticated
  }
  return next();
});
```

`src/lib/access.ts` exports the tested core (no `jose` dependency — RS256 via the Workers-native Web
Crypto API; JWKS fetch is injected so verification is fully testable with a local RSA keypair):

```ts
export interface AccessIdentity { email: string; raw: string; }
export interface AccessJwtPayload { aud: string | string[]; email?: string; iss: string; exp: number; iat: number; nbf?: number; }
export interface Jwk { kid: string; kty: string; n: string; e: string; alg: string; }

export function decodeJwt(token: string):
  { header: { alg: string; kid: string }; payload: AccessJwtPayload; signingInput: string; signature: Uint8Array } | null;

export function validateClaims(p: AccessJwtPayload, expected: { aud: string; iss: string; now: number }):
  { ok: true } | { ok: false; reason: string };

export async function verifyAccessJwt(
  token: string, cfg: { aud: string; teamDomain: string },
  deps: { fetchJwks: (url: string) => Promise<Jwk[]>; now?: number },
): Promise<{ ok: true; identity: AccessIdentity } | { ok: false; reason: string }>;

export function isSameOriginWrite(req: { headers: Headers }, siteUrl: string): boolean; // CSRF guard (§10.8)
export function assertNoDevBypassInProd(env: AccessEnv): void;                           // misconfig tripwire (CALLED from resolveAdminIdentity)
```

`adminUnauthorized(context, reason)` returns `403 {error:"forbidden", reason}` (JSON) for
`/api/admin/*`, or a 403 `noindex` HTML page for `/admin/*` — it only fires on a verifiably bad JWT,
which Access itself normally prevents (distinct from the token's 401).

**Dev bypass.** Access cannot gate `localhost`. `astro dev` (the Cloudflare Vite plugin, no `platformProxy`)
loads `.dev.vars` (git-ignored, hook-blocked) into the worker env. Set `DEV_ADMIN_EMAIL` to
synthesize `locals.user` (`source:"dev"`); leave `ACCESS_AUD`/`ACCESS_TEAM_DOMAIN` **unset** so the
JWT branch is skipped. A committed `.dev.vars.example` documents the shape:

```
# .dev.vars.example  (copy to .dev.vars; never commit the real file)
ADMIN_API_TOKEN="dev-local-token"        # echoed in admin write fetches locally
DEV_ADMIN_EMAIL="info@salongnovo.se"     # simulates the Access identity in dev
# ACCESS_AUD / ACCESS_TEAM_DOMAIN intentionally UNSET locally → JWT path skipped
```

**Prod invariant (deploy checklist).** Pages env **must** contain `ACCESS_AUD` + `ACCESS_TEAM_DOMAIN`
and **must not** contain `DEV_ADMIN_EMAIL`. In prod the JWT branch always runs first, so the dev branch
is unreachable; `assertNoDevBypassInProd(env)` throws if both `ACCESS_*` and `DEV_ADMIN_EMAIL` coexist.

**Logout.** No app session exists — logout is an Access concern. The admin nav's **Logga ut** link
points at the same-origin `/cdn-cgi/access/logout`, which clears `CF_Authorization` and shows Access's
logged-out page. The next `/admin` visit re-challenges.

**Session-expiry contract.** A stale editor tab doing an XHR after the 24h cookie expires gets Access's
login HTML (a 302/redirect), not JSON. To let the client distinguish a real API response from an Access
interstitial, admin write routes set `X-Admin-OK: 1` on success; `editor.client.ts` treats a non-JSON /
`opaqueredirect` / HTML response as "session expired", preserves the draft in `localStorage`, and shows
*"Din session har gått ut — ladda om sidan och logga in igen."*

### 10.4 Data model

**No migration is required for the core admin.** `migrations/0001_init.sql` already defines every column
the panel needs:

- `posts(id, slug, locale, title, excerpt, body, cover_image, author, status, seo_title, seo_desc, published_at, created_at, updated_at)` — `UNIQUE(locale, slug)`, indexed `(locale, status, published_at DESC)`.
- `media(id, post_id→posts ON DELETE SET NULL, r2_key UNIQUE, alt, width, height, variants JSON, created_at)` + `idx_media_post`.

`cover_image` stores the **R2 key** (base-independent). `media.width/height` stay NULL until the deferred
variant Worker decodes dimensions (§10.7). **Optional, non-blocking** hardening (only if the media table
ever grows enough to matter — it won't, for one salon): `migrations/0002_media.sql` adding a partial index
`idx_media_orphans ON media(post_id, created_at) WHERE post_id IS NULL` to speed the GC sweep. Ship without it.

### 10.5 API contract

Every endpoint keeps `export const prerender = false` and the existing `authorized()` token check
(defense-in-depth; Access is the real gate). Every write route also calls `isSameOriginWrite` (CSRF,
§10.8). Every non-2xx body is the `ApiError` envelope; every 2xx body carries `ok: true` plus its typed
payload. All shared shapes live in **one** module both routes and the client import.

**`src/lib/admin-api.ts` — the single shared types module (no route may declare a local `Body` again):**

```ts
import type { Locale } from "../i18n/routes";
import type { Post, PostStatus } from "./posts";

export interface ApiError { error: string; message?: string; field?: string; }

export interface PostWriteRequest {
  id?: number; title: string; locale: Locale; body: string;
  excerpt?: string; coverImage?: string | null; author?: string;
  status: PostStatus; seoTitle?: string | null; seoDesc?: string | null; slug?: string;
}
export type AdminPost = Post;

export interface CreatePostResponse { ok: true; post: AdminPost; }
export interface UpdatePostResponse { ok: true; post: AdminPost; }
export interface DeletePostResponse { ok: true; id: number; }
export interface ListPostsQuery { locale?: Locale; status?: PostStatus; q?: string; }
export interface ListPostsResponse { ok: true; posts: AdminPost[]; }
export interface GetPostResponse { ok: true; post: AdminPost; }

export interface MediaItem { id: number; key: string; url: string; alt: string; variants: number[]; createdAt: string; }
export interface ListMediaResponse { ok: true; media: MediaItem[]; }
export interface UploadResponse { ok: true; media: MediaItem; altMissing: boolean; kind: "inline" | "cover"; markdown: string; }
export interface DeleteMediaResponse { ok: true; key: string; warning?: "in_use"; usedBy?: number[]; }

export function isApiError(x: unknown): x is ApiError;
```

> **Reconciled decision (shared types).** The API and structure specialists each proposed a types
> module (`admin-api.ts` vs `admin/api-types.ts`). One module wins: **`src/lib/admin-api.ts`**, with
> validation split into the pure **`src/lib/admin-validate.ts`** (`parsePostWrite`). The editor's
> form-model helpers stay in `src/lib/editor.ts` and serialize to `PostWriteRequest` — they do not
> redeclare these types.

**Validation (pure, tested) — `src/lib/admin-validate.ts`:**

```ts
export interface ValidationFailure { error: string; field: string; }
export interface NormalizedPostWrite {
  id?: number; title: string; locale: Locale; status: PostStatus;
  body: string; excerpt: string; coverImage: string | null; author: string;
  seoTitle: string | null; seoDesc: string | null; slugOverride?: string;
}
export function parsePostWrite(raw: unknown):
  { ok: true; value: NormalizedPostWrite } | { ok: false; fail: ValidationFailure };
```

`parsePostWrite` rules: `title` required (`{error:"title_required",field:"title"}`); `locale` must pass
`isLocale` (`invalid_locale` — **no silent "sv" default**, fixing the current `toInput` defect that masks
client bugs); `status` ∈ {draft,published} (`invalid_status`); `id` if present a positive int (`invalid_id`);
`coverImage` a key or null (strip a full URL to its key); `slugOverride` set only when `raw.slug` is a
non-empty string; other text fields coerced to string/null, `body` may be empty.

#### Endpoints

**`GET /api/admin/posts`** — dashboard list. Query: `?locale`, `?status`, `?q` (title contains, case-insensitive), all optional.
- 200 `ListPostsResponse` (ordered `updated_at DESC`). 400 `invalid_locale`/`invalid_status` on a bad filter. 401 `unauthorized`.
- Lib: `listAdmin(db, {locale?, status?, q?})` (SQL `WHERE` + `lower(title) LIKE '%'||lower(?)||'%'`).

**`GET /api/admin/posts/[id]`** — load one for the edit form. Path `id` (positive int).
- 200 `GetPostResponse`. 400 `invalid_id`. 404 `not_found`. 401. Lib: `getById(db, id)`.

**`POST /api/admin/posts`** — create. Request `PostWriteRequest` without `id`.
- Validate via `parsePostWrite`; slug per §10.6; author default per below.
- **201 `CreatePostResponse` (the full row)** — changed from the current `{ok,slug}`, because the editor
  needs the new `id` to redirect to `/admin/posts/{id}` (so the next save is a PUT) and the resolved slug.
- 400 validation; 401; 409 `slug_conflict` (defensive net only). Lib: `insertPost` now `RETURNING *` → `Post`.

**`PUT /api/admin/posts`** — update. Request `PostWriteRequest` with `id`.
- Validate; `id` required (`id_required`). Load existing via `getById` (404 if missing). Slug resolved by
  `resolveSlug` (**frozen once published** — fixes the current PUT-recomputes-slug-from-title bug). `published_at`
  via `nextPublishedAt(existing, status, now)`.
- 200 `UpdatePostResponse` (full row). 400 / 404 / 401 / 409. Lib: `updatePost` now returns `Post`.

**`DELETE /api/admin/posts?id=`** — delete. Query `?id=` (positive int).
- 200 `DeletePostResponse`. 400 `id_required`; 401. Idempotent (missing id still 200). Deleting a post does
  **not** delete its images (`media.post_id` is `ON DELETE SET NULL`); media cleanup is separate (§10.7).

**`POST /api/admin/preview`** — live-preview render (this is what makes preview == production).
- Request `{ body: string }`. 200 `{ html: string }` = `renderMarkdown(body)` (the same module the public
  page uses, so `html:false` + link rules + typographer are identical). Keeps the token check.

**`POST /api/admin/upload`** — image upload (`multipart/form-data`).
- Fields: `file` (required), `alt` (string), `kind` (`"inline"|"cover"`, default `inline`), `postId` (optional → `media.post_id`).
- Validation order: token → `file instanceof File` (400 `file_required`) → `ALLOWED.has(file.type)` (415 `unsupported_type`)
  → `size ≤ MAX_BYTES` (413 `too_large`) → **magic-byte sniff** `sniffImageType(bytes)` (415 `content_mismatch`).
- Key = `${CMS.mediaPrefix}${crypto.randomUUID()}.${mimeToExt(sniffed)}` (ext from validated MIME, not filename). `MEDIA.put`
  with `httpMetadata.contentType` + `customMetadata.alt`. Insert media row (with `post_id` when supplied; `variants='[]'`).
- **200 `UploadResponse`** — `media.url` is the served **original** via `servedUrl`; `markdown` is the ready-to-insert
  `![alt](url)` (inline) or `""` (cover); `altMissing` lets the editor block insertion. **`previewVariant` is removed**
  (it pointed at a variant that doesn't exist — a guaranteed 404).

**`GET /api/admin/media`** — picker list. Query `?limit` (default 100), `?offset` (default 0).
- 200 `ListMediaResponse` (`created_at DESC`). 401. Lib: `listMedia(db, base, limit, offset)` (base injected so the lib stays env-free/testable; parses `variants` JSON, `[]` on garbage).

**`DELETE /api/admin/media?key=`** — delete an image. Query `?key=` (R2 key).
- Deletes the R2 object + its known variant keys (`variantKey(key,w)`, best-effort) + the media row.
- 200 `DeleteMediaResponse`; **soft in-use warning**: if `mediaUsage(db,key)` finds referencing posts, return
  `{ok:true, key, warning:"in_use", usedBy:[ids]}` and let the UI confirm. 400 `key_required`; 401. Idempotent.

**`GET /api/media/[...key]`** — **public** R2 streaming (Stage-A serving; the thing that actually makes uploads viewable).
- `env.MEDIA.get(key)`; 404 if null. Stream with `Content-Type` from `obj.httpMetadata.contentType`,
  `Cache-Control: public, max-age=31536000, immutable` (keys are content-unique UUIDs), `ETag: obj.httpEtag`,
  `If-None-Match` → 304. **No auth** — images are public content; only `/admin` + `/api/admin` are gated.

**Status-code matrix.**

| Code | When |
|------|------|
| 200 | GET / PUT / DELETE / preview / upload success |
| 201 | POST create success |
| 304 | `/api/media/[...key]` `If-None-Match` hit |
| 400 | validation (`field` set): `title_required`, `id_required`, `invalid_id`, `invalid_locale`, `invalid_status`, `file_required`, `key_required` |
| 401 | `unauthorized` (token fails — Access already blocks anon at edge) |
| 403 | `forbidden` (bad/forged JWT, or CSRF same-origin check fails) |
| 404 | `not_found` (missing post id / preview id / media key) |
| 413 | `too_large` (upload > 10 MB) |
| 415 | `unsupported_type` / `content_mismatch` (bad MIME or magic-byte mismatch) |
| 409 | `slug_conflict` (defensive; should be unreachable after uniquify) |
| 503 | `db_unavailable` (runtime env / DB missing — local edge case) |

**Author default (shared with auth).** Precedence `body.author → locals.user?.email → ""`. `toInput`/`parsePostWrite`
take the authenticated user so a non-technical writer never types their email; on PUT an existing author is preserved
unless the body overrides. (The public blog display name vs. raw email is an open decision — §10.12.)

### 10.6 Editor & dashboard UI

**Framework decision — DECIDED: vanilla TypeScript, zero UI framework.** The editor is a thin `.astro`
shell whose interactivity is one hand-written controller (`src/admin/editor.client.ts`) loaded via an Astro
`<script>`. **No Preact/React/Svelte island; no `client:*` directive** (those only apply to framework
components, of which the project has none — a locked constraint).

*Rationale.* The interactive surface is genuinely small — a textarea, a toolbar that inserts Markdown at the
caret, a debounced preview fetch, an image-upload fetch, a dirty guard, and three buttons. A ~250-line vanilla
controller backed by a pure tested `src/lib/editor.ts` covers it. A framework adds a build dependency and
10–45 KB of client JS for no benefit, violating "justify every byte." **Live preview is rendered server-side**
via `POST /api/admin/preview` calling the exact `renderMarkdown` the public page uses — the only way to
guarantee preview == production (`html:false`, custom link rule, typographer) without shipping markdown-it
(~40 KB) to the browser and risking drift. The 250 ms-debounced authed fetch is invisible on Cloudflare.
*Trade-off, stated honestly:* no offline preview — acceptable for an always-online Access-gated tool. Target
client JS on `/admin`: **< 8 KB** (no framework, no markdown-it).

**Admin UI language — DECIDED: Swedish-only.** The owner and all 18 stylists operate in Swedish; the admin
serves 1–3 internal users. Post **locale (SV/EN)** is an orthogonal field, not the chrome language, so no admin
language switcher exists. Strings live in `src/lib/admin-strings.ts` (a flat typed `ADMIN` const), separate from
the public `ui.sv.json` — keeping tool copy out of the public bundle and giving one file to translate if EN admin
is ever wanted (out of scope now).

**The pure, tested core — `src/lib/editor.ts`** (the controller only does DOM reads/writes around these; same
law as §4). Caret transforms take and return `{value, start, end}`:

```ts
export interface Selection { value: string; start: number; end: number; }
export interface EditResult { value: string; start: number; end: number; }

export function wrapInline(sel: Selection, marker: string, placeholder: string): EditResult; // bold/italic, toggles
export function prefixBlock(sel: Selection, prefix: string): EditResult;                       // "## ", "> ", toggles
export function insertLink(sel: Selection, url: string, text?: string): EditResult;
export function insertImage(sel: Selection, key: string, alt: string): EditResult;            // ![alt](key)
export function toggleList(sel: Selection, ordered: boolean): EditResult;

export interface PostDraft {
  id?: number; title: string; slug: string; slugManual: boolean;
  locale: "sv" | "en"; excerpt: string; coverImage: string | null;
  body: string; author: string; seoTitle: string; seoDesc: string;
  status: "draft" | "published";
}
export function nextSlug(draft: PostDraft): string;                         // slugManual ? slug : slugify(title)
export type FieldError = { field: keyof PostDraft; code: string };
export function validateDraft(draft: PostDraft): FieldError[];              // title required; publish ⇒ body+excerpt non-empty; locale ∈ {sv,en}
export function counter(text: string, ideal: [number, number], hard: number): { len: number; state: "empty"|"ok"|"warn"|"over" };
export function toApiBody(draft: PostDraft): PostWriteRequest;             // always sends an explicit slug
export function isDirty(current: PostDraft, saved: PostDraft): boolean;
```

> **Reconciled decision (editor lib location).** The two UI/structure specialists proposed `src/lib/editor.ts`
> vs. a split `src/lib/admin/{toolbar,validation,slug-from-title}.ts`. Chosen: **one `src/lib/editor.ts`** for
> the editor's caret/draft/counter logic (cohesive, one test file), with body-parse validation in the separate
> `src/lib/admin-validate.ts` already owned by the API. Slug *policy* (immutable-after-publish) lives in
> `src/lib/slug.ts` (`resolveSlug`), not the editor — the server is the authority.

**Component tree (props).**

```
AdminBase.astro                  { title: string; userEmail?: string | null }
└─ AdminNav.astro                { userEmail?: string | null }
   ├─ PostList.astro             { posts: Post[] }                    // dashboard
   │   └─ <dialog> delete-confirm
   └─ PostEditor.astro           { draft: PostDraft; mode: "create" | "edit" }
      ├─ (meta strip: title, slug chip, locale toggle, excerpt — in PostEditor)
      ├─ MarkdownToolbar.astro   { }                                  // static data-cmd buttons
      ├─ (textarea#md-body + <div class="preview body"> — in PostEditor)
      ├─ CoverPicker.astro       { coverImage: string | null; imageBase: string }
      ├─ ImagePicker.astro       { imageBase: string }                // dialog, hidden until invoked
      ├─ (SEO fields: seoTitle, seoDesc — in PostEditor)
      └─ (action bar: Ta bort · Förhandsgranska · Spara utkast · Publicera)
```
`PostEditor.astro` serializes the initial `draft` into a `<script type="application/json" id="draft-data">`
block that `editor.client.ts` reads (no second fetch on edit). Client controllers — `editor.client.ts`
(toolbar→`editor.ts`, debounced preview fetch, upload, dirty guard, save/publish/delete) and `dashboard.client.ts`
(filter/search, delete-confirm) — are the **only** JS on `/admin`.

**Dashboard fields.** Table columns: **Titel** (link to `/admin/posts/{id}`), **Språk** (SV/EN pill),
**Status** (`Utkast` muted / `Publicerat` gold badge), **Uppdaterad** (`updated_at` → `YYYY-MM-DD`),
**Åtgärder** (`Redigera`, `Ta bort`, and `Visa →` to the live URL for published posts). Filter bar (client-side
over rendered rows): search `Sök titel…`, status `Alla·Utkast·Publicerat`, locale `Alla·SV·EN`. Empty state:
`Inga inlägg ännu.` + `Skriv ditt första inlägg`. Delete uses a native `<dialog>` confirm
(`Ta bort "{title}"? Detta går inte att ångra.`).

**Editor fields & Markdown + live preview.** Two-pane on desktop (≥ 960px), stacked on mobile:

- **Titel** — required; on input, if `!slugManual`, the slug chip updates via `nextSlug`.
- **Slug** — read-only chip `/blogg/{slug}` (or `/en/blog/{slug}` for EN); `✎ redigera` makes it editable and
  sets `slugManual=true`; `auto` reverts. Always sent explicitly. After save the server's resolved slug returns
  in the response and the chip updates (toast if `-2` was appended).
- **Språk (SV/EN)** segmented control (changing locale on an edit warns: post moves to the other blog).
- **Utdrag (excerpt)** — counter `n/200`; `Föreslå` fills from the existing `excerpt(body)` helper when empty.
- **Body** — `<textarea>` + `MarkdownToolbar`. Toolbar buttons (static HTML, `data-cmd`, SV `aria-label`):
  **B** `wrapInline("**")` Cmd/Ctrl+B · *I* `wrapInline("_")` +I · **H2** `prefixBlock("## ")` +2 ·
  **" "** `prefixBlock("> ")` · **•** `toggleList(false)` · **1.** `toggleList(true)` · **🔗** `insertLink` +K ·
  **🖼** opens `ImagePicker` → `insertImage`. Controller flow per button: read `{value,start,end}` → call the pure
  `editor.ts` fn → write back, restore selection, dispatch `input`, mark dirty, schedule preview.
- **Live preview** — `debounce(250ms)` `POST /api/admin/preview` with `{body}`; render the returned HTML into
  `<div class="preview body">` (sharing PostView's prose CSS via `admin.css` so it *looks* like the live post).
  Inline image keys resolve via the shared rewrite (§10.7) so both preview and production show images identically.
  Preview pane states: `Skriver…` (debounce pending) · rendered HTML · `Kunde inte ladda förhandsvisning · Försök igen`.
- **Omslagsbild** — `CoverPicker` (upload → store `key` in `draft.coverImage`, thumbnail + `Byt`/`Ta bort`).
- **SEO-titel / SEO-beskrivning** — `counter` states (green ideal / amber warn / red over): title ideal `[30,60]`
  hard 70; desc ideal `[70,160]` hard 200. Placeholders show the title/excerpt fallback used when blank.
- **Action bar** — **Spara utkast** (`status:'draft'`) · **Publicera** (`status:'published'`, enabled only when
  `validateDraft` passes) · **Förhandsgranska** (saves first if new, opens `/admin/preview/{id}`) · **Ta bort**.
  A published post shows **Spara ändringar** + **Avpublicera** instead. On create success the client navigates to
  `/admin/posts/{newId}` so subsequent saves are PUT.

**Editor states.** Empty body → placeholder `Skriv ditt inlägg i Markdown…`, preview muted `Förhandsvisning visas här`.
Saving → button spinner `Sparar…`, inputs disabled, amber status dot. Saved → `Sparat HH:MM`, dirty cleared. Dirty →
`beforeunload` + in-app nav intercept → `confirm(ADMIN.unsavedGuard)`. Validation error on Publish → inline red errors
+ summary `Rätta {n} fält innan publicering`. Upload error → SV-mapped (413 `Bilden är för stor (max 10 MB)`, 415
`Filtypen stöds inte (använd JPG, PNG, WebP)`, network `Uppladdning misslyckades — försök igen`). API/network error →
toast `Något gick fel — försök igen`; the draft is never lost.

**Accessibility.** Editor is a `<form>` with real `<label for>`; toolbar `role="toolbar"` + roving tabindex + SV
`aria-label` per button; shortcuts fire only when the textarea is focused; dialogs are native `<dialog>` (`showModal()`
focus trap, Esc to close); StatusBar `aria-live="polite"`, validation summary `role="alert"`, toasts `role="status"`;
status badges pair color with text; reuse `:focus-visible { outline: 2px solid var(--gold) }`; respect
`prefers-reduced-motion`; admin body text uses `--snow`/`#d8d8d8` (not `--muted`) for WCAG AA on the dark theme.

### 10.7 Media pipeline

**Lifecycle: upload → R2 → media row → insert → serve.**

1. **Upload** (`POST /api/admin/upload`, §10.5): validate (incl. magic-byte sniff) → `MEDIA.put` original →
   insert `media` row → return `UploadResponse` with `markdown` (`![alt](url)`) and the served `url`.
2. **Insert.** Inline: the editor drops the returned `markdown` at the caret (`insertImage`). Cover: the returned
   `key` is stored in `draft.coverImage` (not inserted into the body).
3. **Serve (Stage A, ship now).** `GET /api/media/[...key]` streams the R2 object same-origin with immutable cache
   + ETag/304. Set `PUBLIC_IMAGE_BASE=""` so the helper routes through it with zero DNS/R2-domain setup:

   ```ts
   // src/lib/media.ts
   export function servedUrl(base: string, key: string): string {
     return base ? originalUrl(base, key) : `/api/media/${key}`;
   }
   ```

**Alt text.** The `ImagePicker` requires alt before the insert button enables (accessibility gate); the server still
accepts `""` but returns `altMissing:true`. Alt is written to `media.alt` **and** R2 `customMetadata.alt` (so it can
be reconstructed if the row is lost), and flows into the inserted `![alt](url)` → `<img alt>` through the existing
render path. Cover alt falls back to `post.title` when empty (open decision — §10.12).

**Key vs URL storage (deliberate split).** Covers store the **R2 key** (`post.cover_image`) — base-independent, so a
later `img.salongnovo.se` cutover rebuilds the URL at render. Inline Markdown stores the **served URL** — rewriting
historical Markdown on a base change isn't worth it for one salon, and the original URL stays valid as long as the
object exists.

**Image src in render/preview — one shared rewrite.** Inline body images are written as served URLs (Stage A:
`/api/media/blog/uuid.ext`), which markdown-it renders directly — so preview (via `/api/admin/preview`) and the live
`PostView` are identical with no extra rewrite for Stage-A URLs. `src/lib/media.ts` also exports `extractMediaKeys(body, base)`
to map a body back to its referenced R2 keys (for media→post association and the in-use delete warning).

**DEFERRED — variant pipeline (the seam, with graceful fallback).** The Worker that generates `blog/uuid-{480,960,1600}.webp`
is **not built**. Two changes make the deferral honest and the upgrade invisible:

- **Ship now (bug fix): fallback-aware `images.ts`.** The current `imageAttrs` unconditionally emits `-{w}.webp`
  variant URLs that 404 because no pipeline exists — every blog image would break. Add:

  ```ts
  export function parseVariants(json: string | null | undefined): VariantWidth[]; // null/"[]"/garbage → []
  export function responsiveImageAttrs(
    base: string, key: string, variants: readonly number[],
    opts?: { sizes?: string; alt?: string },
  ): { src: string; srcset?: string; sizes?: string; loading: "lazy"; decoding: "async"; alt?: string };
  ```
  `variants.length === 0` → `{ src: servedUrl(base,key), loading, decoding, alt }` (NO srcset — original served, valid
  today). `variants.length > 0` → existing `srcset` behaviour. **All callers route through `responsiveImageAttrs` +
  `parseVariants`;** the existing helpers stay (used internally + for test stability). `PostView.astro` is updated to
  actually render the cover (today it does **not** reference `coverImage` at all — neither rendered nor OG; the OG
  wiring is in the route files `blogg/[slug].astro` → `Base.astro` → `seo.ts`) via `responsiveImageAttrs(base,
  post.coverImage, parseVariants(...))`. **B6:** the same change must also resolve the cover to an **absolute** URL
  for the OG image — pass `originalUrl(base, post.coverImage)` (not the bare R2 key) into `Base`'s `image` prop — so
  `og:image`/`twitter:image` are absolute and social cards work (closes live bug A4). Once Stage-A `/api/media/*`
  exists (4d), the absolute form is `siteUrl + servedUrl("", key)`.

- **Future Worker (spec only): `src/workers/variant-gen.ts`.** Triggered by an R2 PUT event on `blog/*`, it resizes the
  original to `widthsFor(originalWidth)`, encodes WebP, `MEDIA.put(variantKey(key,w), …)`, and does the single write
  `UPDATE media SET variants=?, width=?, height=? WHERE r2_key=?`. It agrees with the front-end purely through the already
  unit-tested `variantKey()` + the `variants` column — **no caller changes when it ships**; the next render auto-upgrades
  `<img src>` to a full `srcset`. Encoder choice (Cloudflare Images vs `@cf-wasm/photon`) is deferred (§10.12).

**Cleanup (safe, deferred).** `media.post_id` is `ON DELETE SET NULL`, so deleting a post nulls the link but never
destroys R2 objects (an image may be reused). Association at save: after `insertPost`/`updatePost`, set `post_id` for the
cover key and for inline keys found via `extractMediaKeys`. Garbage collection is a scriptable, deferred
`scripts/gc-media.ts` (orphan rows older than a 7-day grace, unreferenced by any body → delete original + variant keys +
row). Build the cron later; the script is optional v1.1.

**Stage B (later cutover).** Attach the bucket to `img.salongnovo.se`, set `PUBLIC_IMAGE_BASE="https://img.salongnovo.se"`.
`servedUrl` then returns the CDN URL; covers migrate for free (rebuilt from key); pre-cutover inline URLs keep working
(`/api/media/*` coexists). A one-line env change, no breakage.

### 10.8 Security

- **Access** is the sole identity gate on `/admin*` + `/api/admin*` (§10.3); the `ADMIN_API_TOKEN` header is
  defense-in-depth on the write API only.
- **CSRF.** Admin writes are same-origin and authenticated by `CF_Authorization` (SameSite=Lax) plus the server-injected
  `x-admin-token` header — which a cross-site attacker can neither read nor set without a CORS preflight the API doesn't
  grant. Add an explicit `isSameOriginWrite(request, env.PUBLIC_SITE_URL)` check (pure, tested — prefers `Sec-Fetch-Site`,
  falls back to `Origin`) to POST/PUT/DELETE on `posts.ts` + `upload.ts`, returning 403 on mismatch. No app-session cookie
  exists to forge, so no token-pair CSRF machinery is needed.
- **Security headers.** Set on the admin branch of middleware **and** in `public/_headers` (defense-in-depth):
  ```
  /admin/*
    X-Robots-Tag: noindex, nofollow
    X-Frame-Options: DENY
    Content-Security-Policy: default-src 'self'; img-src 'self' https://img.salongnovo.se data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'
    Referrer-Policy: same-origin
    Cache-Control: no-store
  /api/admin/*
    X-Robots-Tag: noindex
    Cache-Control: no-store
  ```
  The CSP allows `img.salongnovo.se` (Stage-B image base) for inline previews and `'unsafe-inline'` styles (the site uses
  inline-friendly CSS tokens; tighten to a nonce later if needed).
- **noindex / sitemap (verified — already correct).** `robots.txt.ts` already emits `Disallow: /admin` + `Disallow: /api/`;
  `sitemap.xml.ts` enumerates only public `ROUTES` (admin is structurally excluded; the future dynamic blog sitemap must
  filter `status='published'`). Third layer: `<meta name="robots" content="noindex,nofollow">` in `AdminBase.astro`'s `<head>`.
- **Upload validation.** MIME allowlist + 10 MB cap (existing) **+ magic-byte sniff** (`sniffImageType`) + MIME-derived
  extension (a spoofed filename can't control the R2 key). EXIF strip rides along with the deferred variant Worker.
- **Sanitisation posture (unchanged, the core safety property).** Body is Markdown rendered with **`markdown-it html:false`**
  → author input can never inject `<script>`/event handlers; no HTML allowlist sanitiser is needed (proven in
  `markdown.test.ts`). The §10.9 adversarial test pins this against editor-shaped input (e.g. a `javascript:` link or an
  `onerror` payload in alt text → no executable HTML).

### 10.9 Testing strategy

The high-value, high-risk logic is pure string/object math → fast Vitest units (the repo's `tests/**/*.test.ts`, env
`node`, alias `~ → ./src`; no jsdom). New/extended suites:

| Suite | Module under test | Representative cases |
|-------|-------------------|----------------------|
| `tests/access.test.ts` (NEW) | `src/lib/access.ts` | `decodeJwt` parses valid JWS / `null` on malformed; `validateClaims` aud-match/exp/nbf; `verifyAccessJwt` happy path with a **local RSA keypair** + fake `fetchJwks`, fails on wrong key / unknown kid / wrong aud / expired; `isSameOriginWrite` same/cross/missing; `assertNoDevBypassInProd` tripwire. |
| `tests/editor.test.ts` (NEW) | `src/lib/editor.ts` | bold toggle on/off, heading prefix idempotency, link/image insertion + caret position, `toggleList`, `nextSlug` auto-vs-manual, `validateDraft` publish-requires-body+excerpt, `counter` thresholds, `isDirty`. |
| `tests/admin-validate.test.ts` (NEW) | `src/lib/admin-validate.ts` | `parsePostWrite` success + each failure (`title_required`, `invalid_locale`, `invalid_status`, `invalid_id`); URL→key strip; `slugOverride` only when non-empty. |
| `tests/media.test.ts` (NEW) | `src/lib/media.ts` | `sniffImageType` per signature + mismatch; `mimeToExt`; `mediaMarkdown`/`escapeAltForMarkdown` (alt with `]`/newlines can't break link syntax); `servedUrl` empty vs custom base; `extractMediaKeys`. |
| `tests/slug.test.ts` (EXTEND) | `src/lib/slug.ts` | `resolveSlug`: create → uniquify(slugify(override ?? title)); still-draft → recompute; **published existing → returns stored slug unchanged**. |
| `tests/posts.test.ts` (EXTEND) | `src/lib/posts.ts` | `nextPublishedAt` full transition table (create-draft→null, create-published→now, draft→published→now, published re-save→unchanged, published→draft→null, re-publish→now). |
| `tests/db.test.ts` (EXTEND) | `src/lib/db.ts` | `getById` (mapped Post / null / binds `[id]` / `WHERE id = ?`); `listAdmin` SQL+bind per filter; `listMedia` JSON parse + base join. |
| `tests/images.test.ts` (EXTEND) | `src/lib/images.ts` | `parseVariants` (null/`"[]"`/`"[480,960]"`/garbage); `responsiveImageAttrs` (empty → `src`=served original, no srcset; populated → webp srcset). |
| `tests/markdown.test.ts` (EXTEND) or `tests/admin-security.test.ts` (NEW) | render path | Adversarial: editor-toolbar output with a `javascript:` href / `onerror`-style alt renders through `renderMarkdown` with **no** executable HTML. |

After this phase the suite goes from 62 → ~90+ tests; the existing 62 must stay green. The `.astro` + `.client.ts` glue
carries no logic worth a render test.

**Optional e2e (stretch, NOT a merge blocker).** A single Playwright flow (`tests/e2e/editor.spec.ts`, its own config,
excluded from the Vitest `include` so it never gates `npm test`): on `astro dev` + local D1 with
`DEV_ADMIN_EMAIL` set (Access can't run locally), drive the acceptance trace — create → type Markdown → bold → upload
cover → save draft → preview → publish → assert it appears on `/blogg`. Ship without it; add when the rest is green.

### 10.10 Build plan — sub-phases 4a–4f

Dependency-ordered. Each sub-phase: deliverable · files · acceptance. Every page/route starts with
`export const prerender = false` and guards `Astro.locals.db` like the blog pages.

#### 4a — Auth core + admin shell + Access wiring
- **Build.** `src/lib/access.ts` (`decodeJwt`, `validateClaims`, `verifyAccessJwt` via Web Crypto, `isSameOriginWrite`,
  `assertNoDevBypassInProd`) + `tests/access.test.ts` (local RSA keypair, fake JWKS). Extend `src/middleware.ts` with the
  `ADMIN_RE` branch populating `locals.user`. Extend `src/env.d.ts` (`ACCESS_AUD?`, `ACCESS_TEAM_DOMAIN?`, `DEV_ADMIN_EMAIL?`,
  `App.AdminUser`, `locals.user`). `AdminBase.astro` (`<html lang="sv">`, `noindex`, `tokens.css`) + `AdminNav.astro`
  (Dashboard/Nytt inlägg/Visa sajt links, Access email readout, `/cdn-cgi/access/logout`). Placeholder `admin/index.astro`
  rendering "Admin" in `AdminBase`. Add `ACCESS_AUD`/`ACCESS_TEAM_DOMAIN` to `wrangler.toml [vars]`; create `.dev.vars.example`
  + `public/_headers`. Verify `robots.txt.ts` already disallows `/admin` (it does — no edit).
- **Files.** `src/lib/access.ts`, `tests/access.test.ts`, `src/middleware.ts` (chg), `src/env.d.ts` (chg),
  `src/layouts/AdminBase.astro`, `src/components/admin/AdminNav.astro`, `src/pages/admin/index.astro` (placeholder),
  `wrangler.toml` (chg), `.dev.vars.example`, `.env.example` (chg), `public/_headers`.
- **Accept.** `npm test` (access suite green) + `npm run build` green; `/admin` renders with no public header/footer and a
  `noindex` meta; locally `DEV_ADMIN_EMAIL` yields `locals.user`; deployed-preview `/admin` triggers the Access login (manual).

#### 4b — Shared types/validation + DB read layer + dashboard
- **Build.** `src/lib/admin-api.ts` (all shared types + `isApiError`) and `src/lib/admin-validate.ts` (`parsePostWrite`) +
  `tests/admin-validate.test.ts`. `db.ts`: add `getById`, `takenSlugs`, `listAdmin` (+ extend `tests/db.test.ts`). Add
  `GET /api/admin/posts` (list/filter) and new `GET /api/admin/posts/[id]`. Build the real dashboard: `PostList.astro` +
  `admin/index.astro` (SSR `listAll`/`listAdmin`) + `dashboard.client.ts` (filter/search + delete-confirm via existing DELETE).
- **Files.** `src/lib/admin-api.ts`, `src/lib/admin-validate.ts`, `tests/admin-validate.test.ts`, `src/lib/db.ts` (chg),
  `tests/db.test.ts` (chg), `src/pages/api/admin/posts.ts` (chg: GET), `src/pages/api/admin/posts/[id].ts`,
  `src/components/admin/PostList.astro`, `src/pages/admin/index.astro` (replace placeholder), `src/admin/dashboard.client.ts`,
  `src/styles/admin.css` (start).
- **Accept.** New units green; dashboard server-renders every post from local D1 with working filter/search; Delete removes a row.

#### 4c — Editor core + create/edit + Markdown live preview
- **Build.** `src/lib/editor.ts` + `tests/editor.test.ts`; `src/lib/admin-strings.ts`. `slug.ts`: add `resolveSlug`
  (+ extend `tests/slug.test.ts`). `posts.ts`: add `nextPublishedAt` (+ extend `tests/posts.test.ts`). `POST /api/admin/preview`
  (`renderMarkdown`). Fix `posts.ts` POST/PUT: validate via `parsePostWrite`, resolve slug via `resolveSlug`+`getById`+`takenSlugs`,
  set `published_at` via `nextPublishedAt`, default `author` from `locals.user`, add `isSameOriginWrite`, **return the full Post**
  (`insertPost`/`updatePost` now `RETURNING *`). Build `PostEditor.astro` + `MarkdownToolbar.astro` + `editor.client.ts`
  (auto-slug, toolbar→`editor.ts`, debounced preview fetch, save POST/PUT, redirect to `/admin/posts/{id}` on create).
  `admin/posts/new.astro` + `admin/posts/[id].astro` (SSR `getById`, 404).
- **Files.** `src/lib/editor.ts`, `tests/editor.test.ts`, `src/lib/admin-strings.ts`, `src/lib/slug.ts` (chg),
  `tests/slug.test.ts` (chg), `src/lib/posts.ts` (chg), `tests/posts.test.ts` (chg), `src/lib/db.ts` (chg: insert/update return Post),
  `src/pages/api/admin/preview.ts`, `src/pages/api/admin/posts.ts` (chg), `src/components/admin/PostEditor.astro`,
  `src/components/admin/MarkdownToolbar.astro`, `src/admin/editor.client.ts`, `src/pages/admin/posts/new.astro`,
  `src/pages/admin/posts/[id].astro`.
- **Accept.** New units green; typing a title fills the slug; **B** wraps a selection in `**`; the preview pane updates live and
  matches the rendered post; create inserts a row and redirects to its edit URL; editing loads the row's fields; **editing a
  published post's title does not change its slug** (AC-6).

#### 4d — Media: serving + upload hardening + insertion + fallback-aware images
- **Build.** `src/lib/media.ts` (`sniffImageType`, `mimeToExt`, `mediaMarkdown`, `escapeAltForMarkdown`, `servedUrl`,
  `extractMediaKeys`) + `tests/media.test.ts`. `GET /api/media/[...key]` (public streaming, immutable cache, ETag/304). Rework
  `upload.ts`: magic-byte sniff, MIME-derived ext, `customMetadata.alt`, optional `post_id`, return `UploadResponse` (`markdown`,
  `altMissing`, `kind`, served `url`; drop `previewVariant`), add `isSameOriginWrite`. `images.ts`: add `parseVariants` +
  `responsiveImageAttrs` (+ extend `tests/images.test.ts`); update `PostView.astro` to render the cover via them. Wire
  `CoverPicker.astro` + `ImagePicker.astro` into `PostEditor` (upload → `insertImage` inline / `coverImage` for cover; required alt).
  Set `PUBLIC_IMAGE_BASE=""` in `wrangler.toml` (Stage A).
- **Files.** `src/lib/media.ts`, `tests/media.test.ts`, `src/pages/api/media/[...key].ts`, `src/pages/api/admin/upload.ts` (chg),
  `src/lib/images.ts` (chg), `tests/images.test.ts` (chg), `src/components/PostView.astro` (chg),
  `src/components/admin/CoverPicker.astro`, `src/components/admin/ImagePicker.astro`, `src/components/admin/PostEditor.astro` (chg),
  `wrangler.toml` (chg).
- **Accept.** New/extended units green; a JPG/PNG/WebP < 10 MB uploads, shows a thumbnail, and is viewable via `/api/media/<key>`;
  an inline image inserts valid Markdown that renders in preview and on the published page; a cover persists and renders on the live
  post; oversized/wrong-type/spoofed files show a friendly SV error; a blog image with no variants renders the original (no 404).

#### 4e — Media list/delete + draft/publish + Access-gated preview route
- **Build.** `db.ts`: `listMedia`, `insertMedia`, `deleteMediaRow`, `mediaUsage` (wire `insertMedia` into `upload.ts`; extend
  `tests/db.test.ts`). New `api/admin/media.ts` (GET list for the picker's recent grid; DELETE R2 object + variants + row, soft
  in-use warning). Media→post association after save (`extractMediaKeys` → `UPDATE media.post_id`). Expose **Publicera/Avpublicera**
  in the editor (server `parsePostWrite` + `nextPublishedAt` already gate). `admin/preview/[id].astro` — `getById` (any status),
  render via the real `PostView.astro` in `AdminBase` with a localized DRAFT banner; **Förhandsgranska** saves first then opens it.
- **Files.** `src/lib/db.ts` (chg), `tests/db.test.ts` (chg), `src/pages/api/admin/media.ts`, `src/pages/api/admin/upload.ts` (chg),
  `src/pages/api/admin/posts.ts` (chg: media association), `src/pages/admin/preview/[id].astro`,
  `src/components/admin/{PostEditor,ImagePicker}.astro` (chg).
- **Accept.** Saving a draft keeps it off `/blogg`; previewing a draft renders it via `PostView` behind Access; publishing makes it
  appear on `/blogg` (or `/en/blog`) immediately; **Avpublicera** removes it; the picker lists recent uploads; deleting an in-use image
  warns. **The full acceptance trace (§10.1) passes end to end.**

#### 4f — a11y, polish, security test, docs
- **Build.** Keyboard a11y pass (labels, `role="toolbar"` + roving tabindex, `:focus-visible`, native `<dialog>` confirms,
  `aria-live` status); finish `admin.css` on the dark tokens (WCAG AA); empty/error/slug-collision states; the adversarial security
  test; update `ARCHITECTURE.md §9` (mark the admin gap closed) and `BUILD-GUIDELINES.md` (add "Adding an admin route").
- **Files.** `src/components/admin/*.astro` (polish), `src/styles/admin.css` (chg), `tests/admin-security.test.ts` (or extend
  `tests/markdown.test.ts`), `ARCHITECTURE.md` (chg), `BUILD-GUIDELINES.md` (chg).
- **Accept.** `npm test` + `npm run typecheck` + `npm run build` all green; manual keyboard pass (Tab through editor, operate toolbar,
  Esc the delete confirm); the security test proves no script can be smuggled via the toolbar; docs updated.

**Dependency rationale.** 4a unblocks all (routes must exist for Access + a shell to render in). 4b gives the editor a read path and
the shared types/validation everything imports. 4c is the editor core (needs 4b's read path + types). 4d layers media onto the editor
(needs 4c's textarea + `insertImage`). 4e needs 4c's save/status + 4d's upload, and reuses `PostView`. 4f is cross-cutting cleanup last.

### 10.11 File manifest

**New files**

| Path | Purpose |
|------|---------|
| `src/lib/access.ts` | Access JWT verify (Web Crypto RS256, no `jose`) + `isSameOriginWrite` CSRF + `assertNoDevBypassInProd` (pure, tested). |
| `src/lib/editor.ts` | Caret-aware Markdown transforms, draft model, `validateDraft`, SEO `counter`, `nextSlug`, `isDirty`, `toApiBody` (pure, tested). |
| `src/lib/admin-api.ts` | Single source of truth for admin request/response types + `ApiError` + `isApiError`; imported by routes and the client. |
| `src/lib/admin-validate.ts` | Pure `parsePostWrite` — normalize/validate untrusted JSON bodies (no DB). |
| `src/lib/admin-strings.ts` | SV-only admin UI copy (flat typed `ADMIN` const), separate from public `ui.sv.json`. |
| `src/lib/media.ts` | `sniffImageType`, `mimeToExt`, `mediaMarkdown`/`escapeAltForMarkdown`, `servedUrl`, `extractMediaKeys` (pure, tested). |
| `src/layouts/AdminBase.astro` | Admin shell: `<html lang="sv">`, `noindex`, tokens only, AdminNav, no public chrome. |
| `src/components/admin/AdminNav.astro` | Admin nav: Dashboard/Nytt inlägg/Visa sajt links, Access email, logout. |
| `src/components/admin/PostList.astro` | Dashboard table (title/locale/status/updated/actions) + delete `<dialog>`. |
| `src/components/admin/PostEditor.astro` | Editor form shell (meta, toolbar, textarea, preview, pickers, SEO, action bar); serializes draft to a JSON script block. |
| `src/components/admin/MarkdownToolbar.astro` | Static `role="toolbar"` `data-cmd` buttons with SV aria-labels. |
| `src/components/admin/ImagePicker.astro` | Inline-image dialog: dropzone + required alt + recent-media grid → upload → `insertImage`. |
| `src/components/admin/CoverPicker.astro` | Cover-image thumbnail + byt/ta bort → stores key in `draft.coverImage`. |
| `src/pages/admin/index.astro` | Dashboard page (SSR `listAll` → PostList). |
| `src/pages/admin/posts/new.astro` | Editor, create mode (empty draft). |
| `src/pages/admin/posts/[id].astro` | Editor, edit mode (SSR `getById`, 404 if missing). |
| `src/pages/admin/preview/[id].astro` | Access-gated draft preview via the real `PostView.astro` in `AdminBase`, localized DRAFT banner. |
| `src/pages/api/admin/posts/[id].ts` | `GET` one post by id (edit-form load). |
| `src/pages/api/admin/media.ts` | `GET` list media (picker) · `DELETE` media (R2 + variants + row, soft in-use warning). |
| `src/pages/api/admin/preview.ts` | `POST { body } → { html }` via `renderMarkdown` (live preview). |
| `src/pages/api/media/[...key].ts` | **Public** streaming `GET` of an R2 object (Stage-A serving, immutable cache, ETag/304). |
| `src/admin/editor.client.ts` | Vanilla controller: toolbar→`editor.ts`, debounced preview fetch, upload, dirty guard, save/publish/delete. |
| `src/admin/dashboard.client.ts` | Vanilla controller: filter/search + delete-confirm. |
| `src/styles/admin.css` | Admin-only CSS on the dark token theme; shares PostView prose rules; WCAG AA. |
| `public/_headers` | Static-asset headers: noindex + X-Frame-Options + CSP + no-store for `/admin/*` + `/api/admin/*`. |
| `.dev.vars.example` | Committed template for local `.dev.vars` (ADMIN_API_TOKEN dev value + DEV_ADMIN_EMAIL). |
| `tests/access.test.ts` | JWT decode/validate/verify (local RSA keypair + fake JWKS), `isSameOriginWrite`, dev-bypass tripwire. |
| `tests/editor.test.ts` | Toolbar toggles, slug auto/manual, publish validation, counters, dirty. |
| `tests/admin-validate.test.ts` | `parsePostWrite` success + each validation failure. |
| `tests/media.test.ts` | `sniffImageType`, `mimeToExt`, `mediaMarkdown`/escape, `servedUrl`, `extractMediaKeys`. |
| `tests/admin-security.test.ts` (or fold into `markdown.test.ts`) | Adversarial: toolbar output can't smuggle executable HTML. |
| `src/workers/variant-gen.ts` | **SPEC-ONLY** deferred variant pipeline (documents the seam; not built). |
| `scripts/gc-media.ts` | **Optional v1.1** orphan-media sweep (7-day grace, unreferenced). |
| `tests/e2e/editor.spec.ts` | **STRETCH** Playwright acceptance flow; excluded from `npm test`. |

**Changed files**

| Path | Change |
|------|--------|
| `src/middleware.ts` | Keep the redirect pass; add the `ADMIN_RE` admin branch verifying the Access JWT and populating `locals.user`. |
| `src/env.d.ts` | Add `ACCESS_AUD?`, `ACCESS_TEAM_DOMAIN?`, `DEV_ADMIN_EMAIL?` to `Env`; declare `locals.db`/`getCms`/`adminEmail`/`adminToken` and do NOT extend `Runtime` (ADR-08). |
| `src/lib/db.ts` | Add `getById`, `takenSlugs`, `listAdmin`, `listMedia`, `insertMedia`, `deleteMediaRow`, `mediaUsage`; `insertPost`/`updatePost` now return `Post`. |
| `src/lib/slug.ts` | Add `resolveSlug` (immutable-after-publish + editable + uniquify policy, pure). |
| `src/lib/posts.ts` | Add `nextPublishedAt` (publish-transition helper, pure). |
| `src/lib/images.ts` | Add `parseVariants` + `responsiveImageAttrs` (graceful fallback to served original); existing helpers unchanged. |
| `src/pages/api/admin/posts.ts` | Add `GET` (list/filter); fix PUT slug clobber via `resolveSlug`+`getById`; return full `Post`; `parsePostWrite`; CSRF; author default; media association. |
| `src/pages/api/admin/upload.ts` | Magic-byte sniff; MIME-derived ext; `post_id`; `customMetadata.alt`; `UploadResponse` (drop `previewVariant`); CSRF; `insertMedia`. |
| `src/components/PostView.astro` | Render the cover image via `responsiveImageAttrs`+`parseVariants` (currently never rendered). |
| `wrangler.toml` | Add `ACCESS_AUD` + `ACCESS_TEAM_DOMAIN` to `[vars]`; set `PUBLIC_IMAGE_BASE=""` (Stage A). |
| `.env.example` | Document the two new public Access vars + note `DEV_ADMIN_EMAIL` is dev-only. |
| `tests/db.test.ts` | Add `getById`, `listAdmin`, `listMedia` cases. |
| `tests/slug.test.ts` | Add `resolveSlug` freeze/draft cases. |
| `tests/posts.test.ts` | Add `nextPublishedAt` transition-table cases. |
| `tests/images.test.ts` | Add `parseVariants` + `responsiveImageAttrs` fallback/upgrade cases. |
| `tests/markdown.test.ts` | (if not separate) editor-shaped adversarial case. |
| `ARCHITECTURE.md` | This §10; mark the admin gap in §9 closed. |
| `BUILD-GUIDELINES.md` | Add an "Adding an admin route" subsection. |

No new runtime dependencies: JWT verify uses native Web Crypto (no `jose`); preview reuses `markdown-it`; the editor is vanilla
TS in `.astro` `<script>`s. Playwright (stretch) is the only possible devDependency, only if 4f's optional e2e is taken.

### 10.12 Open decisions & risks

Genuine choices that need David (defaults are specced and ship-safe; these only refine):

1. **IdP.** Default is Access email **One-time PIN** (zero config). If the salon uses Google Workspace, a Google IdP gives one-click SSO with **no code change** — confirm preferred login.
2. **Session duration.** Specced 24h (re-auth daily). Confirm, or prefer 7d/30d (less friction, slightly weaker on a shared front-desk device).
3. **Author display name.** Posts default `author` to the logged-in **email**. The public blog likely wants a display name ("Salong NOVO"), not `info@salongnovo.se`. Pick: a small email→name map, or let the writer override the `author` field (current spec allows the override).
4. **Cover alt fallback.** Spec falls back to `post.title` when a cover's media row has empty alt. Confirm that's acceptable a11y, or require explicit cover alt like inline images.
5. **Re-publish date.** Unpublish→republish resets `published_at` to the new now (single-column schema). If the original publish date must survive, add `first_published_at` (migration 0002). Recommend accepting the reset for a brochure blog.
6. **Variant encoder (deferred).** Cloudflare Images (paid, simplest) vs `@cf-wasm/photon` in the Worker (free, more code). Affects whether width/height decoding lands in the upload path or only the Worker. Recommend the wasm encoder; keep the upload path encoder-free.
7. **Stage-A vs Stage-B serving at launch.** Launch on the same-origin `/api/media/*` route (`PUBLIC_IMAGE_BASE=""`); cut over to `img.salongnovo.se` opportunistically. Only fast-track Stage B if image traffic is high (unlikely for one salon).

**Risk note (declared, not hidden).** Changing a *published* post's slug intentionally (rename + 301) is **out of scope** — the slug
freezes on first publish (the redirects lib handles legacy site URLs, not blog slugs). If a deliberate published-slug change is ever
needed, it's a future "edit slug + write 301" feature.

---

## 11. Design system & visual direction (LOCKED 2026-06-01)

> Direction = **"Haute Editorial"** (the Stitch editorial concept), elevated, + a **live-site
> recognition layer** in the action color and footer. This section is the architecture-level
> summary; the authoritative spec is `Planning/DESIGN-SYSTEM.md`, rendered in
> `Design input/Stitch mockups/novo-editorial-enhanced/index.html`. This closes the §0/§9 visual
> gate. It is **additive** — no change to §4 logic, §5 data, or §10 admin; Phase 1 is a `tokens.css`
> restyle that keeps every existing class/var name.

### 11.1 Principle

Fashion-editorial minimalism — the UI is a **silent frame** for award-winning hair photography.
High whitespace, extreme type contrast (serif display vs. grotesk body), intentional asymmetry.
`0px` radius everywhere, hairline rules, **NO shadows** (depth = tonal layering + element overlap,
never drop-shadow). The twist: the **action color (terracotta)** and the **footer** deliberately
reuse the **current live site's** colors (black bar + champagne band + coral BOKA) so returning
clients feel continuity at the two highest-recognition touchpoints — the **BOKA button (every page)**
and the **footer**.

### 11.2 Color tokens

Core / editorial:

| Token | Hex | Role |
|---|---|---|
| `--charcoal` | `#161616` | Hero base, dark sections |
| `--ink` | `#1A1A1A` | Primary text on light |
| `--cream` | `#F8F8F8` | Default warm surface (sections) |
| `--white` | `#FFFFFF` | Page canvas / gallery base |
| `--on-variant` | `#5B5A55` | Secondary/body text (AA on cream) |
| `--hairline` | `#E3E0DA` | 1px dividers, borders |
| `--clay` | `#D8CBB8` | Philosophy tonal block |

Bronze — editorial **texture only** (NEVER a CTA fill):

| Token | Hex | Role |
|---|---|---|
| `--bronze` | `#A68B67` | Eyebrow lines, italic-serif highlights, hover, decorative marks |
| `--bronze-muted` | `#8C7352` | Small-caps eyebrows, hairline accents |
| `--bronze-dark` | `#725A3A` | Deepest bronze, on light tonal blocks |

Recognition layer (exact samples from the live site):

| Token | Hex | Role |
|---|---|---|
| `--black` | `#000000` | **Footer base** — exact live top-bar match |
| `--champagne` | `#C2A581` | Footer accent band + footer headings + warm dividers (live nav band) |
| `--terracotta` | `#CC5A31` | **THE single action color** — every BOKA / booking CTA, site-wide (live coral) |
| `--terracotta-deep` | `#B34A26` | CTA hover + small-text-on-terracotta (AA-safe) |

### 11.3 Role separation (anti-clash rule)

The three warm tones (bronze, terracotta, champagne) are one earth-tone family and harmonize
**only because they never share a job**:

- **Bronze = texture** (lines, eyebrows, serif-italic highlights, hover). **Bronze never fills a button.**
- **Terracotta = action** (the one saturated thing on the page; the BOKA button).
- **Champagne = surface** (footer band, warm dividers, the recognition band).
- **Black / charcoal = ground** (footer, hero, dark sections).

**LOCKED decision — terracotta scope:** terracotta is the **primary CTA everywhere** (nav, hero,
body, footer), **not footer-only**. Rationale: recognition appears on every screen via the BOKA
button (the live site's single most-recognized element), so it carries continuity far better than a
footer most users never reach; it is also the highest-contrast / best-conversion choice (single
high-contrast CTA rule). Bronze is demoted to texture because **bronze-on-cream is only 3.2:1** —
unfit for a button (§11.7).

### 11.4 Typography

| Token | Family | Use |
|---|---|---|
| `--font-serif` | **Playfair Display** (400/500, italics) | Display, headlines, numerals, serif-italic accents |
| `--font-sans` | **Hanken Grotesk** (300–700) | Body, UI, labels, nav, buttons |

Fluid `clamp()` scale: display 40→118px · h2 28→62px · h3 18–24px · body 16–18px ·
eyebrow/label-caps 11px / 600 / 0.15–0.22em tracking, **uppercase**. Headlines tracking −0.02em
("locked-in" editorial). Body line-height 1.6; measure 60–75ch.
`@import` both families with `display=swap`.

### 11.5 Shape / depth / layout

- **Radius:** `0` everywhere (buttons, cards, image frames). Sharp = high-end.
- **Depth:** **no shadows.** Tonal layering (`--cream` / `--clay` / `--black` blocks), 1px
  `--hairline` rules, element overlap.
- **Grid:** 12-col, side margins `clamp(24px, 6vw, 80px)`, section gaps `clamp(88px, 13vw, 170px)`.
  Intentional asymmetry — align text to one side, let imagery bleed, stagger cards vertically.
- **Rhythm:** 8px base.
- **Glass:** only the sticky header (high-opacity white blur), never decoratively.

### 11.6 Component build contract

Maps the directives onto the components already named in §2 / §4 — **restyle, don't rebuild**:

- **`BookingButton` / `.btn`** — terracotta primary; **the single action color, on every page**
  (nav / hero / body / footer). Fill `--terracotta`, text `#FFFFFF`, 0 radius, uppercase 0.14em.
  Hover → `--terracotta-deep` + −1px lift. Label must clear AA: **≥14px-bold OR use
  `--terracotta-deep`** for body-size text on the action color (§11.7). The only filled-accent button.
- **`.btn--ghost`** — secondary, **non-booking only** (Directions, etc.): transparent, 1px `--ink`
  border, hover inverts to ink fill. **Never terracotta.**
- **`SiteHeader`** — sticky glass header, NOVO wordmark (Playfair, wide tracking), uppercase grotesk
  links with bronze underline-on-hover, **SV/EN toggle**, terracotta BOKA.
- **`SiteFooter` = recognition bar** — `--black` base + **4px `--champagne` top band** + champagne
  section headings + **white NOVO wordmark** + **terracotta BOKA** + hairline `rgba(255,255,255,.12)`
  + socials hover `--champagne`. A deliberate near-replica of the live black-bar / champagne / coral
  signature, anchored at the bottom of **every page**.
- **`Home` hero** — full-bleed competition-level editorial hair photography, `--charcoal` base,
  optional bronze duotone wash, dark top-gradient for legibility; Playfair display headline with one
  serif-italic bronze word, terracotta BOKA, vertical side label, issue numeral.
- **`StaffGrid` / cards / lists** — borderless image cards, caption below or overlapping, fixed
  **4:5 / 3:4** ratios; numbered editorial lists (services 01–07); 1px `--hairline` rules as guides,
  never heavy. (Staff = grid → modal per project decision; no profile routes.)

### 11.7 Accessibility (verified contrast)

| Pair | Ratio | Verdict |
|---|---|---|
| White on `--terracotta` `#CC5A31` | **4.14:1** | AA for ≥14px-bold / UI label. Body-size text on terracotta → use `--terracotta-deep`. |
| White on `--terracotta-deep` `#B34A26` | **5.01:1** | AA all text. Use for any small text on the action color. |
| `--champagne` on `--black` (footer headings) | **8.99:1** | AAA. |
| `--ink` on `--cream` (body) | ~14:1 | AAA. |
| `--on-variant` `#5B5A55` on `--cream` | ~6.6:1 | AA — secondary/body, not bronze. |
| `--bronze` `#A68B67` on white | **3.2:1** | **Large / decorative text ONLY** — never body-size labels. |
| `--bronze-muted` `#8C7352` eyebrows on cream | ~4.2:1 | OK at 600 weight for eyebrows; critical small text → `--on-variant`. |

Plus: visible **2px focus rings** (`:focus-visible` outline terracotta), `prefers-reduced-motion`
disables all animation/transition, **44px** min touch targets, **SV/EN parity** (both fully
localized), alt text on all imagery.

### 11.8 Build impact (Phase 1)

- **`src/styles/tokens.css`** — replace the neutral placeholder with the ready-to-paste block in
  **DESIGN-SYSTEM.md §8**. It keeps existing class/var names (`.wrap`, `.btn`, `.btn--ghost`,
  `.kicker`, `--maxw`) and adds the new tokens via aliases (`--snow→--cream`, `--gold→--bronze`,
  `--muted→--on-variant`, `--line→--hairline`) so **components don't break**. **Restyle, don't rebuild.**
- **Imagery** — hero + signature imagery = **real NOVO competition / award editorial photography**
  via R2 (an asset/content migration task). The placeholders in the mockup are durable stand-ins,
  not final.
- **No change** to logic (§4), data model (§5), or admin (§10). This is purely a CSS/token + asset layer.

**Full spec:** `Planning/DESIGN-SYSTEM.md`. **Rendered reference:**
`Design input/Stitch mockups/novo-editorial-enhanced/index.html`.

---

## 12. Phase 5 — IA migration to the client-confirmed structure (§2A)

The build is currently green against the **old** route map. This phase migrates the code to §2A while
keeping `npm test` + `npm run typecheck` + `npm run build` green and every old URL 301-redirecting to
its new home. It is purely a public-IA change — **no change to §4 logic internals (other than the route
table), §5 data model, or §10 admin/blog**. Order is dependency-safe (types → routes → labels → pages →
redirects → nav/footer → tests).

### 12.1 Routing core — `src/i18n/routes.ts`

1. **`PageKey` union** → `home | staff | pricing | competitions | education | brands | work | contact | blog | about | privacy`
   (remove `services`, `awards`; add `pricing`, `competitions`, `education`, `brands`).
2. **`ROUTES`** — set/rename:
   - `pricing: { sv: "priser", en: "prices" }`  *(was `services: tjanster/services`)*
   - `competitions: { sv: "tavlingar", en: "competitions" }`  *(was `awards: utmarkelser/awards`)*
   - `education: { sv: "utbildning-och-kurser", en: "education" }`  *(new)*
   - `brands: { sv: "varumarken", en: "brands" }`  *(new)*
   - keep `home, staff, work, contact, blog, about, privacy` exactly as-is.
   `localizePath` / `alternates` / `localeFromPath` need **no change** (they're keyed off `ROUTES`).

### 12.2 Nav labels — `src/i18n/ui.sv.json` / `ui.en.json`

Under `nav`: rename keys to match `PageKey`, set labels:

| key | SV | EN |
|-----|----|----|
| `staff` | `Team` | `Team` |
| `pricing` | `Bokning & priser` | `Booking & prices` |
| `competitions` | `Tävlingar` | `Competitions` |
| `education` | `Utbildning & kurser` | `Education & courses` |
| `brands` | `Våra brands` | `Our brands` |
| `work` | `Jobba hos oss` | `Work with us` |
| `contact` | `Kontakta oss` | `Contact` |
| `about` | `Om oss` | `About` (footer) |
| `blog` | `Blogg` | `Blog` (footer) |

Remove the old `services` / `awards` nav keys. Add a localized `labels.comingSoon` ("Innehåll kommer
snart" / "Coming soon") for content-pending pages.

### 12.3 Pages (SV root + EN mirror — both required)

- **Rename** `src/pages/tjanster.astro` → `priser.astro`; `src/pages/en/services.astro` → `en/prices.astro`.
  Repurpose to a **Booking & prices** page: price-list section (data → new `content/pricing.json`, or a
  `comingSoon` block until the client mails prices) + `BookingButton`.
- **Rename** `src/pages/utmarkelser.astro` → `tavlingar.astro`; `en/awards.astro` → `en/competitions.astro`
  (keep `awards.json` as the data source; relabel page to Tävlingar/Competitions).
- **Create** `src/pages/utbildning-och-kurser.astro` + `en/education.astro`, and
  `src/pages/varumarken.astro` + `en/brands.astro` — each a heading + `comingSoon` block + CTA, wired to
  its `pageKey` for nav highlighting + hreflang.
- **`about` (`om-oss.astro` / `en/about.astro`)** — keep the route; remove from primary nav (it moves to
  footer + home story link). No content deletion.
- **Home (`index.astro` / `en/index.astro` + `Home.astro`)** — rebuild the section order per §2A.2:
  hero (logo now / video-ready), `BookingButton`, hair-gallery strip, founders-story block (condensed
  `about` + "Läs hela historien" → `/om-oss`), team grid with **focus/tap/hover** bio reveal (new
  `Home`-scoped variant of `StaffGrid`; bios from `staff.json`, fall back to name+role). Pending assets
  (video, hair photos, owners photo, stylist texts) slot in without layout changes.

### 12.4 Redirects — `src/lib/redirects.ts` (+ `redirects.test.ts`)

Old canonical slugs must 301 to new ones, and legacy entries that pointed at the now-renamed slugs must
be re-pointed:

- **Add:** `/tjanster` → `/priser`, `/en/services` → `/en/prices`; `/utmarkelser` → `/tavlingar`,
  `/en/awards` → `/en/competitions`.
- **Flip/fix existing:** `/priser` → `/tjanster` becomes obsolete (delete it — `/priser` is now canonical);
  `/portfolio` → `/utmarkelser` becomes `/portfolio` → `/tavlingar`.
- **Keep:** `/team`→`/personal`, `/karriar`→`/jobba-pa-novo`, `/villkor`→`/integritet`,
  `/forsta-besoket`→`/om-oss`, and the retired-commerce → `/` set.
- Update `redirects.test.ts` to assert the new targets.

### 12.5 Nav / footer components

- **`SiteHeader.astro`** — `navKeys = ["contact","staff","pricing","competitions","education","brands","work"]`
  (the seven tabs, client order). Remove `about`/`blog` from here.
- **`SiteFooter.astro`** — add footer links for `blog`, `about`, `privacy` (privacy already present).

### 12.6 Tests to update

`i18n.test.ts` (route map + new keys), `redirects.test.ts` (§12.4), `content.test.ts` if a
`pricing.json` loader is added. The `db`/`markdown`/`access`/`media`/`editor`/`posts`/`slug`/`seo`/
`images` suites are **unaffected** (admin/blog untouched). Gate: all suites green + `tsc` clean +
`astro build` green, every old URL resolves via 301, both locales present for all seven tabs.
