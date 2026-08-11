# NOVO — Editorial Enhanced (mockup v2)

An enhanced take on the Stitch **"Haute Editorial"** direction
(`../stitch_novo_editorial_landing_page_v1/`). Same design language — elevated,
and grounded in NOVO's *real* content instead of Stitch's placeholders.

**Open:** `index.html` (single self-contained file; needs internet for Google Fonts
+ Picsum placeholder photos, but degrades gracefully offline to tonal frames).

## Design language carried over from the Stitch DESIGN.md (unchanged spec)
- **Type:** Playfair Display (display/headline) + Hanken Grotesk (UI/body).
- **Palette:** charcoal `#161616` · cream `#F8F8F8` · bronze `#A68B67` / muted `#8C7352`,
  used sparingly · clay `#D8CBB8` philosophy block.
- **Shape & depth:** 0px radius everywhere · 1px hairline dividers · **no shadows** ·
  tonal layering · glass nav only.
- **Layout:** intentional asymmetry, expansive whitespace, large section gaps,
  `label-caps` eyebrows (0.15em+ tracking).

## What was enhanced over the Stitch baseline
| Stitch v1 | Enhanced v2 |
|---|---|
| Fake content ("Ellen Rudd, Creative Director", invented "Collections") | **Real** content from `content/*.json` + live site |
| No awards anywhere | **Awards ledger** — the brand's actual differentiator (3× Årets Kollektion, Årets Nykomling 2026, Nordic Hairshot finalist) as an editorial table |
| 4 fake team members | **Real 18-stylist roster**, owners tagged, specialties + IG handles |
| English-only | **Bilingual SV/EN toggle** (SV default, per project locale decision) |
| Generic "BOKA" buttons | Every CTA → real **Voady** link `bokning.voady.se/novo` |
| Static | Marquee, scroll-reveal, count-up stats, hover duotone→colour, sticky glass nav, animated map pin |
| Plain service blurb | **Numbered editorial service list** 01–07, no prices (per decision), Voady funnel |
| — | Real **Visit** block: Rörstrandsgatan 39C, S:t Eriksplan transit, hours, contact, schematic map |

## Sections
Marquee · Nav · Hero · Positioning + stats · Signatures · **Awards ledger** ·
Services · Team (18) · Philosophy · Visit/Contact · Footer.

## Honest caveats (mockup-stage)
- **Imagery is placeholder.** Picsum seeded-grayscale photos sit under a bronze duotone
  wash so they cohere with the palette — they are *not* salon photography. Real imagery
  is a separate asset-migration task. Swap the `<img src>`s when assets land.
- **Hours** are the draft values from `site.json` (`_verify` flag) — confirm with salon.
- **Specialties** show in Swedish even in EN (roster has one value per stylist); add
  `_en` specialty fields if a fully-localised team section is wanted.
- This is a **design mockup**, not the Astro build. To adopt: port these tokens into
  `src/styles/tokens.css` and restyle the existing components — don't rebuild (per
  project status: visual design is the only open gate).

## Update — design LOCKED (2026-06-01)
Direction settled with `ui-ux-pro-max` and David's call. Two changes from first draft:
- **Action color = terracotta `#CC5A31`** (the live site's coral BOKA) on **every** booking
  CTA site-wide — not bronze. Bronze demoted to editorial texture (eyebrows/rules/hover).
- **Footer = live-site recognition bar:** black `#000000` base + 4px champagne `#C2A581`
  band + champagne headings + terracotta BOKA — a near-replica of the current live black-bar /
  champagne / coral signature, so returning clients recognize it.

Full locked spec + tokens + WCAG math: `../../../Planning/DESIGN-SYSTEM.md`.
Integrated into the build spec: `../../../ARCHITECTURE.md` §11.

*Built 2026-06-01. Source direction: Google Stitch "NOVO Editorial Landing Page".*
