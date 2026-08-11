# Salong NOVO v2 — Claude Project Context

**This folder (`projects/salong-novo-v2/`) is the canonical Salong NOVO rebuild.** When David
references "Salong NOVO / this project / the build," work here. The sibling `../salong-novo/`
is an **asset/content donor only** (a launched-but-over-scoped Next.js build) — never build there.

## What this is

A booking-focused, fashion-magazine **brochure site** for Salong NOVO — a Schwarzkopf flagship
hair salon in Vasastan, Stockholm. Bilingual (SV primary / EN day one). Self-contained on
Cloudflare. Staff-writable blog. No webshop, no on-site booking (external Voady link).

## Stack (locked + built)

Astro 7 (static + server routes) on Cloudflare **Workers** (Static Assets) · D1 (blog + CMS) · R2 (images) · Cloudflare
Access (admin) · markdown-it (`html:false`) · Vitest. See `ARCHITECTURE.md`.

## Status

- ✅ **FULL BUILD COMPLETE.** 246 unit tests green (`npm test`), `npm run typecheck` clean,
  `npm run build` green. The §10.1 acceptance trace (create → write Markdown → publish → live on
  `/blogg`; drafts stay private) is **verified end-to-end against local D1** (2026-06-01).
- ✅ **Admin Panel UI built** (ARCHITECTURE §10, sub-phases 4a–4f): Cloudflare-Access auth core
  (RS256 via Web Crypto), middleware identity, dashboard (filter/search/delete), Markdown editor
  with server-rendered live preview (preview == production), auto-slug + immutable-after-publish,
  image upload (magic-byte sniff) + cover/inline pickers + public R2 streaming, draft/publish, and
  an Access-gated draft preview. Vanilla-TS client (<8 KB), no framework.
- ✅ **Visual design applied** ("Haute Editorial" + recognition layer, §11): `tokens.css` + every
  public component restyled; Playfair Display + Hanken Grotesk fonts wired globally.
- ⏳ **Remaining = content/ops, not code:** real NOVO competition imagery via R2; the deferred WebP
  variant Worker (render path already falls back gracefully); create Cloudflare Access app + D1/R2
  + prod env vars at deploy (§8); GA4/consent.
- **Local dev:** `.dev.vars` (gitignored) sets `DEV_ADMIN_EMAIL` + `ADMIN_API_TOKEN`; run
  `npm run db:migrate:local` then `npm run dev` — admin works at `/admin` without Cloudflare Access.

## Key decisions (don't relitigate)

- Fresh rebuild, simpler than the old build. **No webshop / gift cards / commerce.**
- Booking = external **Voady** `https://bokning.voady.se/novo` (NOT Voyado), primary CTA everywhere.
- **Bilingual day one** (SV root + EN `/en`). Blog posts single-language with locale marker.
- **Staff = grid → modal** on the **Team** page (bio + per-person "Boka tid hos [namn]" Voady link).
  No profile routes. The **homepage** team section adds a **hover/focus/tap bio reveal** (§2A.2).
- **Contact = info-only, no form** (address, map, walking directions from S:t Eriksplan, email).
- Admin auth = Cloudflare Access (no app password). Blog body = Markdown (no raw HTML).

**⚠ Client-confirmed IA (2026-06-01) — see `ARCHITECTURE.md §2A + §12, supersedes older route map):**
- **7 nav tabs** (client order): Kontakta oss · Team · Bokning & priser · Tävlingar · Utbildning &
  kurser · Våra brands · Jobba hos oss.
- **Prices are now SHOWN** — "Bokning & priser" page (reverses the old "no prices / services deferred").
- **New pages:** Utbildning & kurser, Våra brands. **Renames:** `services`→`pricing`, `awards`→`Tävlingar`.
- **About** story folds into the **homepage**; `/om-oss` demoted to footer. **Blog** kept (per David) but
  moved to the **footer** — manual Access editor (§10) unchanged.
- Per-tab copy + most imagery (salon video, hair strip, owners photo, stylist texts, prices) are being
  **mailed by the client as each tab is done** — pages ship a "Innehåll kommer snart" state until then.
- **Not built yet** — this is the spec; Phase 5 (§12) is the code migration.

## Where things live

- `Planning/` — REBUILD-2026-PLAN.md, DESIGN-DIRECTIONS.md (6 directions + rubric).
- `Design input/Mockups/` — 6 HTML mockups (A Noir, B Galleri, C Avant, D Atelier, E Studio,
  F Chromatic) + `index.html` + previews. D/E/F have the working staff modal.
- `Current actuals/` — live-site audit + 5 screenshots (the lean 5-page SV site we replace).
- `content/` — staff.json (18 stylists), services.json, awards.json, site.json, copy.md.
- `src/` — the app. `src/lib` + `src/i18n` = pure tested logic; `.astro` = thin presentation.
- `ARCHITECTURE.md`, `BUILD-GUIDELINES.md`, `README.md` — read these before changing code.

## How to work here

- Follow `BUILD-GUIDELINES.md`: logic in `src/lib` with tests; strings via `t()`; site facts
  via `getSite()`; both locales for every route.
- Before merge: `npm test` + `npm run typecheck` + `npm run build` all green.
- Verified facts (live site, 2026-05-31): Rörstrandsgatan 39C, 113 40 Stockholm · T-bana
  S:t Eriksplan · 08-663 30 14 · info@salongnovo.se · @salongnovo · 18 stylists · founded 2013.
- Repo remote (when initialized): `github.com/davidg-rgb/Salong-Novo`. Commit only when asked.
