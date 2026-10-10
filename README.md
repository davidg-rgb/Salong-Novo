# Salong NOVO v2

Booking-focused, fashion-magazine brochure site for **Salong NOVO** — a Schwarzkopf
flagship hair salon in Vasastan, Stockholm. Bilingual (SV primary / EN), self-contained
on **Cloudflare**, with a staff-writable blog.

> **This is the canonical project folder.** Planning lives in `Planning/`, design directions
> and mockups in `Design input/`, the live-site snapshot in `Current actuals/`, structured
> content in `content/`. The runnable app is in `src/`. See `ARCHITECTURE.md` and
> `BUILD-GUIDELINES.md`.

## Status

| Layer | State |
|-------|-------|
| Core logic (i18n, slug, markdown, images, posts, db, seo, redirects, content, keune) | ✅ Built + **764 tests passing** (31 files, 2026-10-10) |
| App (Astro + Cloudflare): layout, components, all pages (SV+EN), blog, admin API, SEO | ✅ Builds green, `tsc` clean |
| Visual design | ✅ "Haute Editorial" applied (§11, 2026-06-01); home-page refresh 2026-09-30 (fixed transparent header, 100svh hero (the salon film as its plate since 2026-10-10, poster fallback), awards marquee, owner cards, Lenis + motion layer in `src/styles/motion.css` / `src/scripts/refresh.ts`) |
| Cloudflare resources (D1, R2, Access) | ⏳ Create at deploy (see below) |

The design is the only thing waiting. Everything in `src/` is design-independent scaffolding;
choosing a direction means **restyling** (tokens + component CSS), not rebuilding.

## Quick start

```bash
npm install
npm test            # 764 unit tests (vitest, incl. Astro Container render tests)
npm run e2e         # Playwright: builds, serves the Worker on :4321, runs the home-refresh suite
npm run typecheck   # tsc --noEmit
npm run dev         # Astro dev server (static pages; blog/admin need wrangler)
npm run build       # production build -> dist/
```

### Cloudflare resources (one-time, at deploy)

```bash
wrangler d1 create novo_db           # paste database_id into wrangler.toml
wrangler r2 bucket create novo-images
npm run db:migrate:local             # apply migrations/0001_init.sql locally
npm run db:migrate:remote            # ...and to the remote D1
# Admin auth: protect /admin and /api/admin with Cloudflare Access (Zero Trust).
# Secret (defense-in-depth): wrangler pages secret put ADMIN_API_TOKEN
```

## Scripts

| Script | Does |
|--------|------|
| `npm run dev` | Astro dev server |
| `npm run build` | Build to `dist/` (Workers output: `dist/client` + `dist/server`) |
| `npm test` / `test:watch` | Vitest unit suite |
| `npm run e2e` | Playwright suite `tests/e2e/home-refresh.spec.ts` in Chromium (the kit's 15 checks + project checks); builds + serves via `npm run preview -- --port 4321` unless a server already answers there; screenshots to `tests/e2e/__shots__/` (gitignored) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | `astro build && wrangler dev --config dist/server/wrangler.json` (full runtime incl. D1/R2; port 8787 unless `-- --port N`) |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |
| `npm run bildbank:seed:local` / `:remote` | Seed the admin media library with the shipped photographs (`scripts/bildbank-seed.mjs`) |
| `npm run keune:check` | Check every curated product in `content/products.json` against Keune's SE sitemap + Shopify feed; exit 1 if a slug left the sitemap |
| `npm run keune:update` | Rewrite matched rows' `price` + `_synced` from the feed (`-- --dry-run` to preview) |
| `npm run keune:images` | Fetch each product's keune.com page and save its gallery render (og:image as fallback) from Contentful as `public/images/keune/<slug>.webp` (1200 px); reports `gallery`/`og`/`MISSING` per slug, exit 1 on any MISSING or failed download (skips existing; `-- --force`, `-- --dry-run`) |

## Key facts (verified from live site, 2026-05-31)

- **Booking:** external Voady — `https://bokning.voady.se/novo` (primary CTA everywhere)
- **Address:** Rörstrandsgatan 39C, 113 40 Stockholm · T-bana S:t Eriksplan
- **17 stylists** (roster in `content/staff.json`)
- **Butik:** `/butik` + `/en/shop` show copy and ONE salon-attributed link to Keune's full range since
  2026-10-10 (client request: products hidden for now). The 24 curated products (`content/products.json`),
  `ProductGrid.astro` and the admin list stay for the return; every Keune link is built by
  `src/lib/keune.ts` so purchases credit the salon (`Planning/KEUNE-KICKBACK.md`)
- **Awards:** Årets Kollektion ×3, Ellen Rudd — Årets Nykomling 2026, Nordic Hairshot finalists

## Remaining before launch
1. **Pick a design direction** → apply tokens + component styling (Phase 1).
2. Migrate award/hero imagery into `public/`.
3. Create D1 + R2 + Cloudflare Access; deploy to Cloudflare Workers.
4. Confirm `salongnovo.se` DNS on Cloudflare; flip the redirect cutover.
5. EN copy sign-off; real services menu (deferred); GA4 + cookie consent.
