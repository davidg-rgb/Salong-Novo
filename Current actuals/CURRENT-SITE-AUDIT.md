# Current Site Audit — salongnovo.se

> Snapshot captured 2026-05-31 via Playwright (desktop 1440×900). Full-page screenshots in
> `live-site-screenshots/`. This is the **source of truth for what's live today** — used for
> the redirect map (Plan §9.5), content migration, and design reference.

## Verdict

The live site is **lean, Swedish-only, awards-forward** — NOT the heavy 11-page Next.js
build in the old `salong-novo/` repo. 5 pages, external Voady booking, no blog, no services
page, no e-commerce, no EN. The rebuild replaces *this* lean site, so the redirect map is small.

**Aesthetic:** black header with white NOVO wordmark + champagne accent bar → **light/white
body**, centered serif headings, editorial fashion-hair photography in category grids.
Booking ("BOKA") is a coral/orange button top-right. Confirms editorial direction; note the
body is currently *light* (relevant to Direction B vs A).

## Pages (live URLs → new sitemap)

| Live URL | Title | New page | Notes |
|----------|-------|----------|-------|
| `/` | Salong NOVO | Home | Leads with latest award win + nominee galleries. |
| `/om-oss` | Om oss | About | Brand story (see copy below). |
| `/personal` | Personal | Staff | 18 stylists, each w/ IG handle + email. |
| `/jobba-pa-novo` | Jobba på NOVO | Work with NOVO | Rental-chair recruitment pitch. |
| `/kontakt` | Kontakt | Contact | Address, transit, cancellation policy. |
| — | (none) | Services & Prices | **New page, deferred** — see Plan §9.6. |
| — | (none) | Blog | **New.** |
| — | (none) | Awards | **New** standalone page (currently award content lives on home). |

**Redirect map:** the 5 live Swedish slugs map 1:1 to the rebuild's slugs
(`/om-oss`, `/personal`, `/jobba-pa-novo`, `/kontakt`, `/`). Keep them identical → minimal SEO risk.

## Global elements

- **Header nav:** Om oss · Personal · Jobba på NOVO · Kontakt + **BOKA** (and the salon's
  contact strip: @salongnovo · info@salongnovo.se · 08-663 30 14).
- **Booking:** single external link → `https://bokning.voady.se/novo` (Voady, confirmed).
- **Banner line:** "Vi har även öppet på kvällar och helger!"
- **Language:** Swedish only (`<html lang="sv">`). No EN on live site today.

## Contact details (verified — for the info-only Contact page)

- **Address:** Rörstrandsgatan 39C, 113 40 Stockholm
- **Transit:** T-bana **S:t Eriksplan**
- **Phone:** 08-663 30 14 · **Email:** info@salongnovo.se · **IG:** @salongnovo
- **Cancellation policy (verbatim intent):** changes/cancellations via the Voady portal or
  email; later than 48h before = 50% charge; no-show = 100% of treatment time.

## Page content captured

**Om oss:** "NOVO betyder förnyelse… sedan starten 2013… alltid fokus framåt." Was 8 years
on Riddargatan (Östermalm), moved autumn 2021 to Rörstrandsgatan, Vasastan — 300 m²
dream salon, soft colors, custom interior, sustainable materials, big windows / light,
shampoo area with massage chairs. Positioning: "Stockholms bästa frisörer."

**Personal (18 listed):** Chriss Berner (Ägare/owner), Jannie Olofsson (Ägare/owner),
Fanny Wallén, Kristiana Buta, Ola Oterkjaer (& Svante), Isabella Valentino, Emma Gahn,
Caroline Olofsson, Linnéa Widman, Therese Frieberg, Michelle Kesen, Daniel Huynh,
Iris Paula, Jasmina Rosengren, Ellen Rudd, Linnéa Hellström, Merike Janson Ruuth, Marianne.
Each row = name + Instagram handle + personal email. (Per-stylist booking is via Voady.)

**Jobba på NOVO:** Recruitment pitch — looks for glad, service-minded, hungry team players.
Offers **hyrstolar** (rental chairs), up to 16 hairdressers, SPA room w/ massage chairs,
real espresso machine, photo studio. Apply: email info@salongnovo.se. Signed "Chriss och Jannie."

**Home awards (currently on homepage, → new Awards page):**
- Årets Nykomling **(Vinnare)** — Ellen Rudd
- Årets Herr (Nominerad) — Isabella Valentino (foto: Ellen Simone)
- Årets Färg (Nominerad) — Chriss Berner (foto: Fredrik Hjerling)
- Årets Avantgarde (Nominerad) — Ola Oterkjaer (foto: Fredrik Hjerling)
- (Plus older: Årets Kollektion ×3, Nordic Hairshot 2025 — from old build's AWARDS_MAPPING.)

## Screenshots

`live-site-screenshots/live-01-home.png` · `…-02-om-oss.png` · `…-03-personal.png`
· `…-04-jobba-pa-novo.png` · `…-05-kontakt.png`
