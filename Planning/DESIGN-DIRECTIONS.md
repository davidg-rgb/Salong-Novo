# Salong NOVO — Design Directions (2026)

> Three distinct high-end directions for the rebuild, generated to sit **alongside** the
> Google Stitch concept you're importing — so you can compare apples to apples and pick
> (or blend). All three target the same brief: a **high-end fashion-magazine** experience
> for a Schwarzkopf flagship salon, photography-forward, booking-focused (Voady CTA),
> bilingual SV/EN.
>
> Grounded in the `ui-ux-pro-max` design DB (Editorial Grid, Exaggerated Minimalism,
> Swiss Modernism 2.0 styles; luxury serif font pairings).

---

## How to read this

Each direction defines: **concept → palette → type → layout → motion → sample hero**.
A shared evaluation rubric (§4) lets you score these *and* the Stitch concept on the
same axes. Nothing here is locked — the winner feeds Phase 1 (Design System) tokens.

---

## Direction A — "NOVO Noir" *(evolve the current dark + gold)*

**Concept.** The confident evolution of what NOVO already is. A black runway. Photography
glows against deep ink; gold is used like jewellery — rare, precious, never decorative.
Reads as a fashion *house* (Saint Laurent, Schwarzkopf Professional) more than a magazine.
Lowest risk, fully on-brand with the live site, fastest to build (tokens already exist).

**Palette.**
- Canvas `#0A0A0A` (ink) · Surface `#1A1A1A` · Text `#FEFEFE` (snow)
- Accent `#C9A962` (gold) + `#F7E7CE` (champagne) for warm highlights
- Gold used only on: kickers, hairline rules, active states, the Boka CTA.

**Type.** Cormorant Garamond (display, weights 300–500, huge & light) + Inter (body).
Keep the existing "editorial light headline" treatment — it's already right.

**Layout.** Full-bleed cinematic hero; asymmetric image/text spreads; gold hairline
section rules; generous black negative space; sticky minimal header with lang switch + Boka.

**Motion.** Slow fades + image hover crops; subtle parallax on hero; staggered reveals
(30–50ms). Respect `prefers-reduced-motion`.

**Sample hero (desktop):**
```
┌──────────────────────────────────────────────────────────────┐
│  NOVO            OM OSS  PERSONAL  TJÄNSTER  ...   [ BOKA TID ]│ ← gold CTA
│                                                                │
│   ░░░░░░░░░░ full-bleed editorial photo on near-black ░░░░░░░░ │
│                                                                │
│        ÅRETS KOLLEKTION ×3                  ← gold kicker, mono-spaced
│        Stockholms                                              │
│        mest prisbelönta                     ← Cormorant 300, oversized, light
│        frisörsalong                                            │
│                                                                │
│        [ Boka tid ]   Möt teamet →          ← 1 primary + 1 ghost
└──────────────────────────────────────────────────────────────┘
```
**Best when:** you want continuity, brand authority, and speed. **Risk:** familiar.

---

## Direction B — "Galleri" *(bright editorial magazine — biggest contrast)*

**Concept.** A printed fashion magazine spread, on screen. Gallery-white paper, near-black
ink, a disciplined 12-column asymmetric grid, drop caps, pull quotes, bylines, photo
credits. This is the most literal answer to "feels like a high-end fashion magazine"
(SSENSE / Vogue / Kinfolk energy). Photography pops hardest on white. The strongest
contrast to the current dark site — useful as the "other pole" against Stitch.

**Palette.**
- Canvas `#FAFAF7` (warm paper) · Text `#0A0A0A` · Muted `#6A6A6A`
- Accent: keep `#C9A962` gold **or** shift to a fashion `#B43C2E` vermillion / `#E8B4B8` blush.
- Hairline borders `#E4E0D8`; sections divided by thin rules + lots of air.

**Type.** **Bodoni Moda** (high-contrast display) + **Jost** (geometric sans body) —
"Luxury Minimalist" pairing. Alt: Playfair Display + Source Serif 4 (all-serif editorial).
Mono labels (JetBrains Mono, uppercase, tracking-widest) for kickers/dates/credits.

**Layout.** Asymmetric editorial grid; oversized display headlines that break across lines;
drop caps on feature copy; full-bleed image breakouts between text columns; "issue"-style
section numbering (01 — OM OSS). Awards page becomes a literal photo essay.

**Motion.** Smooth scroll, reveal-on-scroll, gentle page-flip/crossfade transitions,
parallax on full-bleed images. Editorial = restraint over flash.

**Sample hero (desktop):**
```
┌──────────────────────────────────────────────────────────────┐
│  NOVO   OM OSS  PERSONAL  TJÄNSTER  AWARDS  ...   [ Boka tid ] │
│ ─────────────────────────────────────────────────────────────│ ← hairline rule
│  N° 01 — VASASTAN, STOCKHOLM        ← mono kicker              │
│                                                                │
│  Klippt som                 ░░░░░░░░░░░░░░░░░░░░               │
│  konst.                     ░░  editorial portrait ░░          │ ← Bodoni Moda,
│  ──────────                 ░░  (full-bleed right) ░░          │   huge, high-contrast
│  En Schwarzkopf-                                               │
│  flaggskeppssalong          ░░░░░░░░░░░░░░░░░░░░               │
│  [ Boka tid ]                                                  │
└──────────────────────────────────────────────────────────────┘
```
**Best when:** you want the clearest "magazine" feel and max differentiation. **Risk:**
biggest departure from current brand; light theme needs disciplined photography.

---

## Direction C — "Avant" *(bold statement / type-as-hero)*

**Concept.** Avant-garde, the way NOVO wins the *Avantgarde* category. Exaggerated
minimalism: oversized type as the hero, near-black canvas, one vivid accent, hard edges,
mono micro-labels, instant tap-inversions. The boldest, most fashion-forward — a salon
that clearly competes at the show/runway level, not the high-street level.

**Palette.**
- Canvas `#0A0A0A` or `#FFFFFF` (inverted sections) · Text opposite
- Single vivid accent: `#FF3B2F` vermillion **or** keep `#C9A962` gold for restraint.
- Strictly 2D — no shadows; 4px full-bleed rules; faint paper-noise (opacity 0.03).

**Type.** Playfair Display 900 (`tracking-tighter`, `leading-[0.9]`, words break
graphically) for heroes + Source Serif 4 body + JetBrains Mono labels. 100% serif/mono,
no UI sans — pure editorial manifesto.

**Layout.** `clamp(3rem,10vw,12rem)` display type; extreme negative space; inverted
section blocks (black↔white); numbers (×3, 18, 2026) as graphic features; minimal chrome.

**Motion.** Hard-edge slide transitions; instant inversion on tap/active; stagger reveals;
deliberate, mechanical timing. Avoid glow/gradient.

**Sample hero (desktop):**
```
┌──────────────────────────────────────────────────────────────┐
│ NOVO ───────────────────────────────────────────── [ BOKA ]   │
│                                                                │
│  PRIS-                                          ÅRETS          │
│  BELÖNT                                         KOLLEKTION     │ ← mono labels
│                                                 ×3             │   in corners
│  ███████  ← word-breaking 900-weight display, full width      │
│  HÅR.                                                          │
│                                                                │
│  18 stylister · Vasastan · sedan ____      [ Boka tid → ]      │
└──────────────────────────────────────────────────────────────┘
```
**Best when:** you want to stand out hard and own the "fashion-forward" claim. **Risk:**
polarising; demands excellent photography and tight execution or it reads as cold.

---

## Direction D — "Atelier" *(warm soft Scandinavian spa-luxe)*

**Concept.** The "lyxig svit" the salon's own About copy describes — calm, warm, organic.
Light cream canvas, soft terracotta/clay accent, rounded forms, generous air, interior
photography. Reads as a serene, premium wellness destination rather than a hard fashion
title. Inviting and feminine-leaning; the most *comfortable* direction.

**Palette.** Cream `#F4EFE7` · ink `#2C2722` · clay `#B6795B` · blush `#E7D3C6`.
**Type.** Fraunces (soft modern fashion serif, italics) + Inter. **Layout.** Arched/rounded
image frames, pill buttons, soft shadows, stat strip on a rounded panel. **Motion.** Gentle.
**Best when:** warmth and approachability matter more than edge. **Risk:** can read "spa"
rather than "fashion-forward" if photography isn't styled.

## Direction E — "Studio" *(brutalist Swiss monochrome)*

**Concept.** A gallery/studio: stark black-and-white, exposed grid lines, grotesque type,
huge uppercase, hard edges, near-zero colour with a single cobalt accent. Structural and
austere — Helmut Lang / Off-White minimalism. The most *architectural* direction.

**Palette.** Paper `#F2F1ED` · black `#000` · cobalt `#1A1AE5` · grey. **Type.** Space
Grotesk (display + body) + Space Mono labels. **Layout.** Visible 2px borders everywhere,
outlined-stroke headline, bordered stat + team grids. **Motion.** Minimal, mechanical.
**Best when:** you want maximum modern credibility and distinctiveness. **Risk:** can feel
cold/clinical; mono demands flawless photography.

## Direction F — "Chromatic" *(bold color-block fashion / duotone)*

**Concept.** Colour as identity. Aubergine, blush and butter colour-blocks with duotone
photography and a high-contrast fashion serif — magazine-*cover* energy. The warmest,
boldest, most contemporary-brand direction; differentiates hardest from the restrained set.

**Palette.** Cream `#FBF5EC` · aubergine `#3B2235` · blush `#EBC1C5` · butter `#E7B954`.
**Type.** DM Serif Display + Inter. **Layout.** Full-bleed duotone hero, alternating colour
sections, dark team block. **Motion.** Hover restores full-colour on duotone. **Best when:**
you want a distinctive, ownable colour brand. **Risk:** strongest departure from current
identity; colour choices need client sign-off.

> **Staff interaction (built into D, E, F):** the Personal section is a **grid → modal** —
> click a stylist to open a card with photo, role, bio, Instagram, and a **per-person
> "Boka tid hos [namn]" link**. This is the staff pattern for the real build.

---

## 4. Evaluation Rubric (score A–F / Stitch, 1–5)

| Axis | A Noir | B Galleri | C Avant | D Atelier | E Studio | F Chromatic | Stitch |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| "Fashion magazine" feeling |  |  |  |  |  |  |  |
| Brand continuity (vs current) |  |  |  |  |  |  |  |
| Photography showcase |  |  |  |  |  |  |  |
| Booking conversion clarity |  |  |  |  |  |  |  |
| Build speed / token reuse |  |  |  |  |  |  |  |
| Bilingual readability |  |  |  |  |  |  |  |
| Distinctiveness (not "AI") |  |  |  |  |  |  |  |
| Risk (lower = safer) |  |  |  |  |  |  |  |

**Quick map of the six:** A = dark luxe house · B = light print magazine · C = bold serif
statement · D = warm soft spa-luxe · E = hard mono studio · F = colourful duotone fashion.

**My read:** **B (Galleri)** is the truest "magazine" and closest to today's *light* live
site; **A (Noir)** is the safe on-brand evolution; **F (Chromatic)** is the most ownable
brand swing; **C/E** are the boldest/most polarising; **D** is the warmest, lowest-friction.
Strong blends: **B's editorial grid in A's dark gold** (a dark magazine), or **D's warmth
with F's colour**. Pick a hero direction (or blend), then we lock tokens in Phase 1.

---

## 5. Next

1. Compare these against the Stitch import on the §4 rubric.
2. Pick a hero direction (or a blend) + accent decision (gold vs vermillion/blush).
3. I build the Phase 1 design system (tokens, type scale, components) from the winner,
   then a one-page live HTML hero of the chosen direction to pressure-test it for real.
