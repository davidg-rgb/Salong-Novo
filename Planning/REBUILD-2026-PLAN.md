# Salong NOVO — Website Rebuild Plan (2026)

> Fresh, design-led, mostly-static **booking-focused brochure site** for a high-end
> fashion hair salon (Schwarzkopf flagship, Vasastan, Stockholm). Self-contained on
> Cloudflare, bilingual (SV primary / EN option), with a custom staff-writable blog.
>
> **Status:** Planning complete. Core app **built, tested, type-clean, builds green** (see
> `ARCHITECTURE.md`). Awaiting a design direction (visual layer) and the Admin Panel build
> (fully specified in `ARCHITECTURE.md §10`).
> **Supersedes:** the heavy Next.js + Sanity + Stripe webshop build in this repo
> (over-scoped, partly shipped). That build is the **asset/content donor**, not the base.

> ⚠️ **Reconciliation note (build reality > this plan).** `ARCHITECTURE.md` is the source of
> truth; this plan is the original intent and a few decisions evolved during the build. Where
> they differ, ARCHITECTURE.md wins. Material deltas already folded into the locked decisions
> below and §3:
> - **Blog body is Markdown** (`markdown-it`, raw HTML disabled), **not** rich-text/Tiptap HTML.
> - **No Tailwind** — plain CSS custom properties in `src/styles/tokens.css`.
> - **No `contact_submissions` table / `/api/contact`** — the contact page is info-only (§9.2).
> - Post slugs are **unique per locale** (`UNIQUE(locale, slug)`), not globally unique.
> - The **Admin Panel UI is not yet built** (only the JSON write API exists); its complete
>   build plan now lives in `ARCHITECTURE.md §10`.

---

## 1. Locked Decisions

| Area | Decision |
|------|----------|
| Approach | Fresh rebuild. Salvage assets, copy, award photos, blog imagery from old build. Discard old architecture. |
| Repo | New: `github.com/davidg-rgb/Salong-Novo` (old build is `Novo.git`). |
| Framework | **Astro** (hybrid: static marketing pages + server-rendered blog & admin). |
| Hosting | **Cloudflare Pages** (+ Pages Functions / Workers). |
| Database | **Cloudflare D1** (SQLite) — blog `posts` + `media`. (No contact submissions — contact page is info-only.) |
| Image storage | **Cloudflare R2** (no egress fees). Resize-at-upload → responsive `srcset` **(variant generation deferred; original served meanwhile — see ARCHITECTURE §9/§10.7)**. |
| Admin auth | **Cloudflare Access** (Zero Trust, free ≤50 users, email-code login, edge-enforced). |
| Blog editor | Custom **Markdown** editor with live preview (headings, bold, links, inline images, cover image, draft/publish). Body stored as Markdown, rendered with raw HTML disabled. *(Reversed from the original rich-text/Tiptap plan.)* Full spec: ARCHITECTURE §10. |
| Languages | Marketing pages: SV (root) + EN (`/en`). Blog posts: single-language, locale marker, default SV. |
| Booking | External **Voady**, single link `https://bokning.voady.se/novo`. Primary CTA sitewide. No on-site booking, no webshop. |
| Content | Reuse existing, client supplies updates. |
| Design | High-end fashion-magazine / Schwarzkopf flagship. Evolve dark + gold editorial. Parallel: client imports a Google Stitch concept; Claude generates alternative directions via design skills. |
| Analytics/SEO | GA4 (reuse), schema.org (LocalBusiness/HairSalon), sitemap, hreflang, OG. |
| Compliance | GDPR cookie consent, Swedish privacy policy, security headers. |

---

## 2. Sitemap & URL Structure

SV at root, EN under `/en`. Swedish slugs (SEO + brand consistency).

| Page | SV (root) | EN | Notes |
|------|-----------|----|-------|
| Home | `/` | `/en` | Editorial cover story. Hero → Boka. Awards highlight, staff teaser, latest blog. |
| About | `/om-oss` | `/en/about` | Salon story, Schwarzkopf flagship positioning, philosophy. |
| Staff | `/personal` | `/en/staff` | The 18 stylists. **Grid → modal** (photo, role, bio, IG, per-person "Boka tid hos [namn]" → Voady). No separate profile routes. |
| Services | `/tjanster` | `/en/services` | **Deferred — not in launch scope.** Delivered later; **no prices shown** on site (booking handles pricing). When built: treatment descriptions funnelling to Boka. |
| Work with NOVO | `/jobba-pa-novo` | `/en/careers` | Recruitment / culture / apply. |
| Contact | `/kontakt` | `/en/contact` | **Info-only, no submit form.** Address (Rörstrandsgatan 39C), embedded map, walking directions from T-bana S:t Eriksplan, hours, phone, email link. |
| Blog (list) | `/blogg` | `/en/blog` | Locale-filtered (SV posts on SV, EN posts on EN). |
| Blog (post) | `/blogg/[slug]` | `/en/blog/[slug]` | Server-rendered from D1. |
| Awards | `/utmarkelser` | `/en/awards` | Årets Frisör 2025/2026, Nordic Hairshot. Galleries. |
| Privacy | `/integritet` | `/en/privacy` | GDPR. |
| Admin | `/admin/*` | — | Behind Cloudflare Access. Not indexed. |

**Booking** is not a page — it's a button (`Boka tid`) in the header, hero, and every
service/stylist card, linking out to Voady (new tab, `rel="noopener"`, GA4 event).

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Cloudflare Pages (Astro hybrid)                              │
│                                                              │
│  Static (SSG, edge-cached):                                  │
│   /  /om-oss  /personal  /tjanster  /jobba-pa-novo           │
│   /kontakt  /utmarkelser  /integritet  (+ /en/*)             │
│                                                              │
│  Server-rendered (Pages Functions / Astro endpoints):        │
│   /blogg, /blogg/[slug]        ── read ──►  D1 (posts)        │
│   /admin/*  (Cloudflare Access) ── R/W ──►  D1 + R2           │
│   /api/admin/posts (POST/PUT/DELETE) ─ write ─► D1            │
│   /api/admin/upload (POST, admin)    ─ write ─► R2 (+ media)  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
      D1 (SQLite)         R2 (images)        Cloudflare Access
      posts, media        originals          (admin identity)
                          (variants TODO)
```

**Why Astro hybrid:** marketing pages ship as static HTML (cheapest, fastest, best
Lighthouse); only the blog and admin need a server. One framework, one repo, one deploy.
Publishing a post writes to D1 and is live immediately (edge cache purged) — no rebuild.

### Data model (D1)

```sql
-- posts   (as built — see migrations/0001_init.sql)
id            INTEGER PRIMARY KEY AUTOINCREMENT
slug          TEXT NOT NULL                -- url segment (UNIQUE per locale, see below)
locale        TEXT NOT NULL DEFAULT 'sv'   -- 'sv' | 'en'  (post shows only on this locale)
title         TEXT NOT NULL
excerpt       TEXT NOT NULL DEFAULT ''
body          TEXT NOT NULL                -- Markdown (rendered with raw HTML disabled)
cover_image   TEXT                         -- R2 key
author        TEXT NOT NULL DEFAULT ''
status        TEXT NOT NULL DEFAULT 'draft'-- 'draft' | 'published'
seo_title     TEXT
seo_desc      TEXT
published_at  TEXT
created_at    TEXT NOT NULL
updated_at    TEXT NOT NULL
UNIQUE (locale, slug)                       -- slugs are unique per locale, not globally

-- media   (R2 keys + generated variants)
id, post_id, r2_key, alt, width, height, variants, created_at

-- NOTE: no contact_submissions table — the contact page is info-only (no form). Dropped per §9.2.
```

### Image pipeline (free, self-contained)
On upload: validate type/size → store original in R2 → **[deferred]** generate responsive
variants (e.g. 480/960/1600 webp) via a Worker (`@cf-wasm/photon` or `wasm-image-optimization`)
→ store variants in R2 → serve `<img srcset>`. No Cloudflare Images subscription.
**Built today:** original stored + `media` row; `src/lib/images.ts` already builds the
`srcset` for when variants exist; front-end falls back to the original meanwhile. The
variant-generation Worker is the explicit deferral — its seam is specified in `ARCHITECTURE §10.7`.

### Admin (the biggest workstream)
- Gated by Cloudflare Access — no auth code in the app; Access passes a verified identity.
- Dashboard: post list (filter draft/published, locale), new/edit/delete.
- Editor: title, slug (auto from title, editable), locale, **Markdown body with live preview**,
  cover image, inline image upload, excerpt, SEO fields, draft/publish, preview.
- Markdown (not rich-text HTML): body is authored + stored as Markdown and rendered with
  `markdown-it` **`html: false`** — author input can never inject `<script>`/event handlers,
  so no server-side HTML sanitiser is needed. *(Reversed from the original Tiptap/ProseMirror
  plan.)* **This UI is not yet built — full spec + build plan in `ARCHITECTURE.md §10`.**

---

## 4. Design Direction (Art Direction Brief)

> Full exploration runs via the `ui-ux-pro-max` / `front-end-design` skills (separate
> deliverable). This is the brief that governs it.

**Feeling:** a high-end fashion magazine you can book an appointment from. Editorial, not
corporate. NOVO is a Schwarzkopf flagship and a 3× Collection-of-the-Year winner — the
site should carry that authority with restraint.

**Foundation to evolve (from old build, reusable):**
- Palette: ink `#0A0A0A`, snow `#FEFEFE`, gold `#C9A962`, champagne `#F7E7CE`, neutral grays.
- Type: **Cormorant Garamond** (display serif, light weights on big headlines) + **Inter** (sans/body).
- Dark, photography-forward, gold used sparingly as a precious accent.

**Editorial moves to push it to "magazine":**
- Oversized, light-weight serif display headlines; generous negative space.
- Full-bleed, art-directed photography; asymmetric editorial grids; "cover story" hero.
- Issue/spread-style section transitions; refined kicker labels & rules in gold.
- Slow, tasteful motion (reveal-on-scroll, parallax restraint, image hover crops).
- Numbers as design: "Årets Kollektion ×3", "18 stylister", award years as typographic features.

**Benchmarks:** luxury fashion house & editorial salon sites (Aesop/COS-level restraint,
Vogue/SSENSE editorial rhythm). Avoid generic "AI salon template" gradients & stock sliders.

**Parallel track:** client importing a Google Stitch concept (separate chat/MCP). Claude
produces 2–3 alternative directions for comparison; winner feeds Phase 1 tokens/components.

---

## 5. Content Plan (reuse + update)

| Source (old build / live site) | Reused for |
|---|---|
| `public/awards/**` + `AWARDS_MAPPING.md` | Awards page (Nordic Hairshot 2025; Årets Frisör 2025 collection winner + nominations; Årets Frisör 2026 — Ellen Rudd, Nykomling). |
| Old Sanity blog posts + `public/images/blog/**` | Seed blog posts (migrate into D1/R2). |
| Old stylist bios (Sanity) | Staff page — **client confirms current 18-person roster + photos.** |
| Old page copy (om-oss, karriar, kontakt) | Starting copy for About / Work / Contact (SV + EN). |
| `logo.svg`, hero webps, textures | Brand + hero imagery. |
| Live site facts | Phone `08-663 30 14`, Instagram `@salongnovo`, Rörstrandsgatan (Vasastan), evening/weekend hours. |

**Client to supply:** current staff list + portraits, service menu + price ranges,
confirmed awards list, any new brand photography, EN translation sign-off.

---

## 6. Phased Build Roadmap

Each phase: deliverable + acceptance criteria. Sized for solo dev + Claude.

**Phase 0 — Foundation** ✅ *(built)*
- New repo `Salong-Novo`; Astro scaffold (**plain CSS custom properties, no Tailwind**);
  Cloudflare Pages project; Wrangler; create D1 db + R2 bucket; bind in `wrangler.toml`;
  migrate reusable assets from old repo.
- ✅ `npm run dev` runs; Pages preview deploys; D1/R2 bound; assets present.

**Phase 1 — Design System** ⏳ *(gated on chosen direction)*
- Tokens (from §4 + chosen direction) as **CSS custom properties in `src/styles/tokens.css`**
  (neutral placeholders stand in today), typography scale, layout grid, core components
  (Header w/ lang switch + Boka, Footer, Button, Card, Kicker, Section, ImageFigure),
  motion primitives. *(No Tailwind — restyle the existing thin `.astro` components.)*
- ✅ Preview page renders all components; matches chosen direction.

**Phase 2 — i18n + Core Marketing Pages**
- Routing (SV root / EN `/en`), translation system, hreflang. Build Home, About, Staff,
  Services & Prices, Work with NOVO, Contact (static). Booking CTAs wired sitewide.
- ✅ All pages render SV+EN; Boka links fire GA4 + open Voady; responsive; a11y baseline.

**Phase 3 — Blog (public)**
- D1 read layer; `/blogg` list (locale-filtered, pagination), `/blogg/[slug]` post view
  (Markdown render, cover, related). Migrate seed posts + images into D1/R2.
- ✅ Posts render per locale; SEO tags + schema; images responsive.

**Phase 4 — Admin Panel** *(largest — NOT yet built; fully specified in `ARCHITECTURE.md §10`)*
- Cloudflare Access on `/admin`; dashboard; create/edit/delete; **Markdown editor with live
  preview**; cover + inline image upload → R2; draft/publish; slug + SEO fields. (No HTML
  sanitiser needed — Markdown rendered with raw HTML disabled.)
- ✅ A non-technical user can log in, write a post with formatting + images, publish, see it live.
- ▶ **Build breakdown:** see `ARCHITECTURE.md §10.10` (sub-phases 4a–4f, each with acceptance criteria).

**Phase 5 — Image Pipeline**
- Resize-at-upload Worker (webp variants), `srcset` everywhere, `img.salongnovo.se` domain.
- ✅ Uploads produce variants; pages serve right size; CLS≈0; no subscription.

**Phase 6 — Contact Page (info-only)**
- Static contact page: address `Rörstrandsgatan 39C, 113 40 Stockholm`, embedded map
  (Google/Leaflet), **walking directions from T-bana S:t Eriksplan**, opening hours,
  `tel:` + `mailto:info@salongnovo.se`, IG link. **No submit form, no backend** at launch.
- (Deferred: a contact form + D1/email can be added later if wanted.)
- ✅ Page gives everything needed to find/reach the salon; map + directions render; bilingual.

**Phase 7 — SEO, Analytics, Compliance**
- GA4, schema.org (HairSalon, Article, BreadcrumbList), sitemap.xml, robots, OG/Twitter,
  hreflang audit. Cookie consent + privacy policy (SV/EN). Security headers (CSP, etc.).
- ✅ Lighthouse SEO 100; consent gates analytics; headers pass observatory.

**Phase 8 — Polish & Performance**
- Motion pass, accessibility audit (WCAG AA, keyboard, focus, alt text), perf budget.
- ✅ Lighthouse Perf/Best-Practices/A11y 90+ mobile; cross-browser; reduced-motion respected.

**Phase 9 — Launch**
- Cloudflare DNS cutover for `salongnovo.se`; 301 redirect map from old URLs; SSL; final
  smoke test; Search Console + sitemap submit; rollback note.
- ✅ Live on Cloudflare; redirects resolve; analytics flowing; admin reachable.

---

## 7. Reusable Tech From Old Build

Keep (port/reference, don't run the old app): design tokens, award/blog/hero **assets**,
copy & bios, GA4 measurement ID, schema patterns, redirect knowledge, Voady URL, GDPR copy.
Drop: Next.js app, Sanity, Stripe/Klarna webshop, gift cards, cart/checkout, Upstash,
prescription system, education platform — all out of scope.

---

## 8. Security & Privacy Notes

- Admin: Cloudflare Access only; no app-level password store. Secrets (API keys, email)
  in Wrangler/CF env vars — never in repo.
- Blog body: stored + rendered as **Markdown with raw HTML disabled** (`markdown-it html:false`)
  — author input can't inject `<script>`/event handlers, so no HTML allowlist sanitiser is
  needed (proven in `markdown.test.ts`).
- Uploads: type + size validation (MIME allowlist + 10 MB cap), randomized R2 keys. *(EXIF strip
  rides along with the deferred variant Worker — see ARCHITECTURE §10.7.)*
- Contact: no form at launch (info-only page) → no submission PII to handle.
- Headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

---

## 9. Open Decisions (need David)

1. ~~**Repo/folder name** on disk~~ — **RESOLVED:** canonical folder is
   `projects/salong-novo-v2/`. All planning/design/project docs live in `salong-novo-v2/Planning/`;
   the old `salong-novo/` is an asset donor only. Phase 0 scaffolds the Astro app inside v2.
2. ~~**Contact-form email delivery**~~ — **RESOLVED:** no form at launch. Contact page is
   info-only (address, map, walking directions, email link). Form deferred.
3. ~~**Staff detail pages**~~ — **RESOLVED:** **grid → modal**. Clicking a stylist opens a
   modal with photo, role, bio, Instagram, and a **per-person "Boka tid hos [namn]" link**
   (deep-links to Voady). No separate profile routes. Pattern demoed in mockups D/E/F.
4. ~~**EN at launch**~~ — **RESOLVED:** **fully bilingual day one** — SV primary (root) +
   complete **EN translation live at launch** (`/en`). All marketing pages translated;
   blog posts remain single-language with locale marker.
5. ~~**Domain state / what's live**~~ — **RESOLVED:** live site = **lean 5-page Swedish-only**
   (home, om-oss, personal, jobba-pa-novo, kontakt) → see `Current actuals/CURRENT-SITE-AUDIT.md`.
   Redirect map is 1:1 on Swedish slugs. **DNS:** target is Cloudflare; David to confirm with
   whoever controls the registrar and move/verify DNS there before Phase 9 cutover.
6. ~~**Services & Prices**~~ — **RESOLVED (hold):** Services page **deferred** (delivered
   later); **no prices** shown on the site. Not in launch scope.

---

## 10. Immediate Next Steps

1. Design exploration via `ui-ux-pro-max` / `front-end-design` (parallel to Stitch import). ✅ done — see `DESIGN-DIRECTIONS.md`.
2. David picks a design direction (A/B/C/Stitch) + answers §9 (esp. 5 domain state, 6 services menu).
3. Scaffold Phase 0 (Astro + Cloudflare) inside `salong-novo-v2/` once the direction is chosen.
