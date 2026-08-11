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
| Core logic (i18n, slug, markdown, images, posts, db, seo, redirects, content) | ✅ Built + **62 tests passing** |
| App (Astro + Cloudflare): layout, components, all pages (SV+EN), blog, admin API, SEO | ✅ Builds green, `tsc` clean |
| Visual design | ⏳ **Gated on direction pick** (A–F or Stitch) — neutral placeholder tokens in `src/styles/tokens.css` |
| Cloudflare resources (D1, R2, Access) | ⏳ Create at deploy (see below) |

The design is the only thing waiting. Everything in `src/` is design-independent scaffolding;
choosing a direction means **restyling** (tokens + component CSS), not rebuilding.

## Quick start

```bash
npm install
npm test            # 62 unit tests (vitest)
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
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | `wrangler dev --config dist/server/wrangler.json` (full runtime incl. D1/R2) |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |

## Key facts (verified from live site, 2026-05-31)

- **Booking:** external Voady — `https://bokning.voady.se/novo` (primary CTA everywhere)
- **Address:** Rörstrandsgatan 39C, 113 40 Stockholm · T-bana S:t Eriksplan
- **18 stylists** (roster in `content/staff.json`)
- **Awards:** Årets Kollektion ×3, Ellen Rudd — Årets Nykomling 2026, Nordic Hairshot finalists

## Remaining before launch
1. **Pick a design direction** → apply tokens + component styling (Phase 1).
2. Migrate award/hero imagery into `public/`.
3. Create D1 + R2 + Cloudflare Access; deploy to Cloudflare Workers.
4. Confirm `salongnovo.se` DNS on Cloudflare; flip the redirect cutover.
5. EN copy sign-off; real services menu (deferred); GA4 + cookie consent.
