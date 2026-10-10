# Salong NOVO v2 — Claude Project Context

**This folder (`projects/salong-novo-v2/`) is the canonical Salong NOVO rebuild.** When David
references "Salong NOVO / this project / the build," work here. The sibling `../salong-novo/`
is an **asset/content donor only** (a launched-but-over-scoped Next.js build) — never build there.

## What this is

A booking-focused, fashion-magazine **brochure site** for Salong NOVO — a Schwarzkopf flagship
hair salon in Vasastan, Stockholm. Bilingual (SV primary / EN day one). Self-contained on
Cloudflare. Staff-writable blog. No on-site webshop or checkout (`/butik` links
out — checkout is on keune.com), no on-site booking (external Voady link).

## Stack (locked + built)

Astro 7 (static + server routes) on Cloudflare **Workers** (Static Assets) · D1 (blog + CMS) · R2 (images) · Cloudflare
Access (admin) · markdown-it (`html:false`) · Vitest. See `ARCHITECTURE.md`.

## Status

- ✅ **FULL BUILD COMPLETE.** 246 unit tests green (`npm test`), `npm run typecheck` clean,
  `npm run build` green. The §10.1 acceptance trace (create → write Markdown → publish → live on
  `/blogg`; drafts stay private) is **verified end-to-end against local D1** (2026-06-01).
- ✅ **Admin Panel UI built** (ARCHITECTURE §10, sub-phases 4a–4f): Cloudflare-Access auth core
  (RS256 via Web Crypto), middleware identity, dashboard (filter/search/delete), auto-slug +
  immutable-after-publish, image upload (magic-byte sniff) + cover/inline pickers + public R2
  streaming, draft/publish, and an Access-gated draft preview. No framework.
  **Editor since 2026-10-10:** in-place "Google Docs" editor (Tiptap 3.31.4 + `@tiptap/markdown`,
  ~145 KB gz, admin-only): Style select (Normal text / Rubrik H2 / Underrubrik H3), B/I, lists,
  quote, link dialog, image, undo/redo, Markdown-source toggle; Docs-style save status, autosave
  for drafts (30 s), Ctrl+S. **Storage stays Markdown** (markdown-it renders the site;
  `tests/editor-roundtrip.test.ts` pins parser agreement). Light admin theme, WCAG 2.2 AA computed
  by `tests/admin-contrast.test.ts`. The editor no longer calls `/api/admin/preview`.
- ✅ **Visual design applied** ("Haute Editorial" + recognition layer, §11): `tokens.css` + every
  public component restyled; Playfair Display + Hanken Grotesk fonts wired globally.
- ✅ **Forge CMS retrofit + client IA DONE (2026-08-11):** Astro 7 / Workers, all 7 client tabs
  (22 public routes, SSR-from-D1 with JSON-default fallback), CMS-editable copy/facts/collections,
  529+ tests. **`BUILD-LOG.md` is canonical** for everything after this line — read its tail first.
- ✅ **Live on David's test account (2026-08-11):** `https://salong-novo.david-geborek.workers.dev`
  (D1 `novo_db` + R2 `novo-images`; admin 403s on `*.workers.dev` by design — Access needs a zone).
  Real staff portraits + 2026 award imagery + generated textures wired (2026-08-12).
- ✅ **Keune product wall (2026-09-29):** `/butik` + `/en/shop` — 24 curated Keune products
  (`content/products.json`, CMS collection `products`), every CTA a salon-attributed deep link built
  by `src/lib/keune.ts`; stylist `picks` wired but empty; `npm run keune:check` keeps slugs/prices
  honest. 26 public page files. Mechanism: `Planning/KEUNE-KICKBACK.md`.
  **Products HIDDEN since 2026-10-10** (client request): the page is the copy + one `butik-all` link
  (`ShopPitch.astro`); ProductGrid, the data, the admin list and its tests stay for the return.
- ✅ **Home-page refresh (2026-09-30):** Desktop-Claude kit implemented natively (no override layer):
  fixed transparent→frosted header on `/` only, 1340px hamburger, 100svh hero with letter intro +
  scroll cue, awards strip head + numbered captions + marquee, owner cards from `owner`/`role`
  data, bio slide-up, ink CTA button, Lenis. Motion is JS-gated (`html.nr-motion`); reduced-motion
  and no-JS get the complete static page.
- ✅ **Hero film (2026-10-10):** the salon video ("Hemsida Novo Final") is the hero plate —
  `public/video/` (1080p ≥900px, 720p below, poster frames), attached by `refresh.ts` only with
  motion allowed + Save-Data off; no JS / reduced motion / refused autoplay keep the poster.
  `npm run e2e` (Playwright, 41). After the editor rebuild (same day): 854 tests / 36 files.
- ✅ **Inner-page motion (2026-10-11, branch `genjutsu-trial`):** every inner page opens with a
  masthead (kicker wipe, h1 word masks, lead) and reveals one object (portraits, years + shots, map,
  brand cards, course/post rows; prose pages masthead only) at inner-page speed; home unchanged. `npm run e2e` (Playwright, 63; `--workers=3` if wrangler dies under 6);
  863 tests / 38 files.
- ⏳ **Remaining:** client content for Bokning & priser / Utbildning / Våra brands; RUNBOOK §5 on the
  client's Cloudflare account + domain (Access, DNS); the deferred WebP variant Worker; GA4/consent.
- **Local dev:** `.dev.vars` (gitignored) sets `DEV_ADMIN_EMAIL` + `ADMIN_API_TOKEN`; run
  `npm run db:migrate:local` then `npm run dev` — admin works at `/admin` without Cloudflare Access.

## Key decisions (don't relitigate)

- Fresh rebuild, simpler than the old build. **No webshop / gift cards / commerce.** (2026-09-29:
  `/butik` is an OUTBOUND Keune page — no cart, no checkout, no payment on this site.)
- Booking = external **Voady** `https://bokning.voady.se/novo` (NOT Voyado), primary CTA everywhere.
- **Bilingual day one** (SV root + EN `/en`). Blog posts single-language with locale marker.
- **Staff = grid → modal** on the **Team** page (bio + per-person "Boka tid hos [namn]" Voady link).
  No profile routes. The **homepage** team section adds a **hover/focus/tap bio reveal** (§2A.2).
- **Contact = info-only, no form** (address, map, walking directions from S:t Eriksplan, email).
- Admin auth = Cloudflare Access (no app password). Blog body = Markdown (no raw HTML).

**⚠ Client-confirmed IA (2026-06-01) — see `ARCHITECTURE.md §2A + §12, supersedes older route map):**
- **7 nav tabs** (client order): Kontakta oss · Team · Bokning & priser · Tävlingar · Utbildning &
  kurser · Våra brands · Jobba hos oss.
  *On disk now (`SiteHeader.astro` `navKeys`, 2026-09-29): 9 tabs — Kontakta oss · Team ·
  Behandlingar · Utmärkelser · Utbildning & kurser · Våra brands · Butik · Blogg · Jobba hos oss.*
- **Prices are now SHOWN** — "Bokning & priser" page (reverses the old "no prices / services deferred").
- **New pages:** Utbildning & kurser, Våra brands. **Renames:** `services`→`pricing`, `awards`→`Tävlingar`.
- **About** story folds into the **homepage**; `/om-oss` demoted to footer. **Blog** kept (per David) but
  moved to the **footer** — manual Access editor (§10) unchanged.
- Per-tab copy + most imagery (salon video, hair strip, owners photo, stylist texts, prices) are being
  **mailed by the client as each tab is done** — pages ship a "Innehåll kommer snart" state until then.
- **Built** (Phase B2, 2026-08-11): every tab above is a live route in both locales; §12 is done.

## Where things live

- `Planning/` — REBUILD-2026-PLAN.md, DESIGN-DIRECTIONS.md (6 directions + rubric).
- `Design input/Mockups/` — 6 HTML mockups (A Noir, B Galleri, C Avant, D Atelier, E Studio,
  F Chromatic) + `index.html` + previews. D/E/F have the working staff modal.
- `Current actuals/` — live-site audit + 5 screenshots (the lean 5-page SV site we replace).
- `content/` — staff.json (17 stylists), services.json, awards.json, brands.json, courses.json,
  products.json (24 Keune products), site.json, copy.md, `Logos/`.
- `src/` — the app. `src/lib` + `src/i18n` = pure tested logic; `.astro` = thin presentation.
- `ARCHITECTURE.md`, `BUILD-GUIDELINES.md`, `README.md` — read these before changing code.

## How to work here

- Follow `BUILD-GUIDELINES.md`: logic in `src/lib` with tests; strings via `t()`; site facts
  via `getSite()`; both locales for every route.
- Before merge: `npm test` + `npm run typecheck` + `npm run build` all green.
- Verified facts (live site, 2026-05-31): Rörstrandsgatan 39C, 113 40 Stockholm · T-bana
  S:t Eriksplan · 08-663 30 14 · info@salongnovo.se · @salongnovo · 18 stylists · founded 2013.
- Repo remote (when initialized): `github.com/davidg-rgb/Salong-Novo`. Commit only when asked.
