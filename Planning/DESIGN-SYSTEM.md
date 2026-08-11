# Salong NOVO v2 — Design System (LOCKED)

**Status:** ✅ Visual direction chosen 2026-06-01. This closes the "visual design" gate
(ARCHITECTURE §0/§9). Direction = **"Haute Editorial"** (the Stitch editorial concept),
elevated, + a **live-site recognition layer** in the action color and footer.

**Source of truth for:** `src/styles/tokens.css`, every `.astro` component's styling,
`SiteHeader`/`SiteFooter`/`BookingButton`. Reference implementation (all of this, rendered):
`Design input/Stitch mockups/novo-editorial-enhanced/index.html`.

---

## 1. Design philosophy

Modern fashion-editorial minimalism — the UI is a *silent frame* for award-winning hair
photography. High whitespace, extreme type contrast (serif display vs. grotesk body),
intentional asymmetry, 0px corners, hairline rules, **no shadows** (depth = tonal layering
and overlap, never drop-shadow).

Two ideas held at once:
1. **Editorial body** — charcoal / cream / bronze, gallery-like, restrained.
2. **Recognition layer** — the *action color* (terracotta) and the *footer* deliberately
   reuse the **current live site's** colors so returning clients feel continuity. The live
   site is a black bar + champagne band + coral **BOKA** button; we carry that signature into
   the new design at the two highest-recognition touchpoints: the **BOKA button (every page)**
   and the **footer**.

---

## 2. Color tokens

### Core (editorial)
| Token | Hex | Role |
|---|---|---|
| `--charcoal` | `#161616` | Hero base, dark sections |
| `--ink` | `#1A1A1A` | Primary text on light |
| `--cream` | `#F8F8F8` | Default warm surface (sections) |
| `--white` | `#FFFFFF` | Page canvas / gallery base |
| `--on-variant` | `#5B5A55` | Secondary/body text (AA on cream) |
| `--hairline` | `#E3E0DA` | 1px dividers, borders |
| `--clay` | `#D8CBB8` | Philosophy tonal block |

### Bronze — editorial **texture only** (NEVER a CTA fill)
| Token | Hex | Role |
|---|---|---|
| `--bronze` | `#A68B67` | Eyebrow lines, italic-serif display highlights, hover, decorative marks |
| `--bronze-muted` | `#8C7352` | Small-caps eyebrows, hairline accents |
| `--bronze-dark` | `#725A3A` | Deepest bronze, on light tonal blocks |

### Recognition layer (from the live site — exact samples)
| Token | Hex | Role |
|---|---|---|
| `--black` | `#000000` | **Footer base** — exact live top-bar match |
| `--champagne` | `#C2A581` | Footer accent band + footer headings + warm dividers (live nav band) |
| `--terracotta` | `#CC5A31` | **THE single action color** — every BOKA / booking CTA, site-wide (live coral) |
| `--terracotta-deep`| `#B34A26` | CTA hover + small-text-on-terracotta (AA-safe) |

### Decision (locked, see ARCHITECTURE §11): terracotta scope
Terracotta is the **primary CTA everywhere** (nav, hero, body, footer) — not footer-only.
Rationale: the coral BOKA button is the live site's single most-recognized element and it
appears on every screen, so it carries recognition far better than a footer most users never
reach; it is also the highest-contrast / best-conversion choice (per ui-ux-pro-max
"single high-contrast CTA" rule). Bronze is demoted to texture because bronze-on-cream is only
3.2:1 — unfit for a button (see §6).

---

## 3. Role separation — why the three warm tones don't clash

All three (bronze, terracotta, champagne) are one warm earth-tone family, so they harmonize
**only because they never compete for the same job**:

- **Bronze = texture** (lines, eyebrows, serif-italic highlights, hover). Never fills a button.
- **Terracotta = action** (the one saturated thing on the page; the BOKA button).
- **Champagne = surface** (footer band, warm dividers, the recognition band).
- **Black/charcoal = ground** (footer, hero, dark sections).

One action color, used sparingly, keeps its value. If bronze ever fills a button it competes
with terracotta and the system muddies — don't.

---

## 4. Typography

| Token | Family | Use |
|---|---|---|
| `--font-serif` | **Playfair Display** (400/500, italics) | Display, headlines, numerals, serif-italic accents |
| `--font-sans` | **Hanken Grotesk** (300–700) | Body, UI, labels, nav, buttons |

Scale (fluid `clamp()`): display 40→118px · h2 28→62px · h3 18–24px · body 16–18px ·
eyebrow/label-caps 11px / 600 / 0.15–0.22em tracking, uppercase. Headlines tracking −0.02em
("locked-in" editorial). Body line-height 1.6; measure 60–75ch.

`@import` (both): `Playfair+Display:ital,wght@0,400..700;1,400..600` +
`Hanken+Grotesk:wght@300..700` + `display=swap`.

---

## 5. Shape, depth, layout

- **Radius:** `0` everywhere (buttons, cards, image frames). Sharp = high-end.
- **Depth:** no shadows. Use tonal layering (`--cream`/`--clay`/`--black` blocks), 1px
  `--hairline` rules, and element overlap.
- **Grid:** 12-col, generous side margins `clamp(24px, 6vw, 80px)`. Large section gaps
  `clamp(88px, 13vw, 170px)`. Intentional asymmetry — align text blocks to one side, let
  imagery bleed; stagger editorial cards vertically.
- **Spacing rhythm:** 8px base.
- **Glass:** only the sticky header (high-opacity white blur), never decoratively.

---

## 6. Components & usage rules

### Buttons
- **Primary (`.btn`) — booking/BOKA, every page:** fill `--terracotta`, text `#FFFFFF`,
  0 radius, 12–14px / 600 / uppercase / 0.14em. Hover → `--terracotta-deep` + −1px lift +
  tracking 0.18em. **This is the only filled-accent button.**
- **Secondary (`.btn--ghost`) — non-booking (Directions, etc.):** transparent, 1px `--ink`
  border; hover inverts to ink fill. Never terracotta.
- One primary CTA per view (the booking action).

### Hero
- Full-bleed **competition-level editorial hair photography** (the salon's award work),
  `--charcoal` base, optional bronze duotone wash for palette cohesion, dark top-gradient for
  legibility. Masthead eyebrow (Est. 2013 · Schwarzkopf flaggskepp), Playfair display headline
  with one serif-italic bronze word, terracotta BOKA, vertical side label, issue numeral.

### Footer = recognition bar (the live signature)
- Base `--black`; **4px `--champagne` top band**; section headings `--champagne`; NOVO
  wordmark white; **terracotta BOKA button**; hairline `rgba(255,255,255,.12)`; socials hover
  `--champagne`. This is a deliberate near-replica of the live black-bar/champagne/coral
  signature, anchored at the bottom of every page.

### Cards / lists / dividers
- Borderless image cards, caption below or overlapping, fixed 4:5 / 3:4 ratios. Numbered
  editorial lists (services 01–07). 1px `--hairline` rules as "guides," never heavy.

### Nav
- Sticky glass header, NOVO wordmark (Playfair, wide tracking), uppercase grotesk links with
  bronze underline-on-hover, SV/EN toggle, terracotta BOKA.

---

## 7. Accessibility (verified contrast)

| Pair | Ratio | Verdict |
|---|---|---|
| White on `--terracotta` `#CC5A31` | **4.14:1** | AA for ≥14px-bold / UI label. For body-size text on terracotta use `--terracotta-deep`. |
| White on `--terracotta-deep` `#B34A26` | **5.01:1** | AA all text. Use for any small text on the action color. |
| `--champagne` on `--black` (footer headings) | **8.99:1** | AAA. |
| `--ink` on `--cream` (body) | ~14:1 | AAA. |
| `--on-variant` `#5B5A55` on `--cream` | ~6.6:1 | AA — use for secondary/body, not bronze. |
| `--bronze` `#A68B67` on white | **3.2:1** | **Large/decorative text ONLY** — never body-size labels. |
| `--bronze-muted` `#8C7352` eyebrows on cream | ~4.2:1 | Acceptable at 600 weight for eyebrows; for critical small text use `--on-variant`. |

Plus: visible focus rings (2px), `prefers-reduced-motion` disables animation, 44px min touch
targets, SV/EN both fully localized, alt text on all imagery.

---

## 8. Ready-to-paste `src/styles/tokens.css`

Replaces the neutral placeholder. Keeps existing class/var names (`.wrap`, `.btn`,
`.btn--ghost`, `.kicker`, `--maxw`) so components don't break; repoints values + adds tokens.

```css
:root{
  /* core / editorial */
  --charcoal:#161616; --ink:#1a1a1a; --white:#ffffff; --cream:#f8f8f8;
  --on-variant:#5b5a55; --hairline:#e3e0da; --clay:#d8cbb8;
  /* bronze — texture only, never a CTA fill */
  --bronze:#a68b67; --bronze-muted:#8c7352; --bronze-dark:#725a3a;
  /* recognition layer (live-site colors) */
  --black:#000000; --champagne:#c2a581; --terracotta:#cc5a31; --terracotta-deep:#b34a26;
  /* aliases kept for existing components */
  --snow:var(--cream); --gold:var(--bronze); --muted:var(--on-variant);
  --line:var(--hairline);
  --maxw:1200px;
  --font-sans:"Hanken Grotesk","Helvetica Neue",Arial,sans-serif;
  --font-serif:"Playfair Display",Georgia,serif;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--white);color:var(--ink);font-family:var(--font-sans);
  font-weight:400;line-height:1.6;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
h1,h2,h3{font-family:var(--font-serif);font-weight:400;line-height:1.05;letter-spacing:-.02em}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 1.5rem}
.btn{display:inline-flex;align-items:center;gap:.5rem;cursor:pointer;
  font-size:.8rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
  padding:.9rem 1.6rem;background:var(--terracotta);color:#fff;
  border:1px solid var(--terracotta);border-radius:0;transition:background .3s,transform .25s}
.btn:hover{background:var(--terracotta-deep);border-color:var(--terracotta-deep);transform:translateY(-1px)}
.btn--ghost{background:transparent;color:var(--ink);border-color:var(--ink)}
.btn--ghost:hover{background:var(--ink);color:#fff}
.kicker{font-size:.72rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--bronze-muted)}
section{padding:clamp(88px,13vw,170px) 0}
:focus-visible{outline:2px solid var(--terracotta);outline-offset:3px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
```

---

## 9. Imagery directive

Hero + signature imagery = the salon's **competition / award editorial photography** (avant-
garde, color, structural work — the same caliber shown on the live site's award galleries),
full-bleed, treated grayscale→color on hover for cards, charcoal-anchored for hero. This is a
content/asset task (R2 migration) — placeholders in the mockup are durable stand-ins, not final.
Final imagery must be real NOVO competition work.

*Settled with `ui-ux-pro-max` design intelligence, 2026-06-01. Implemented + browser-verified
in `Design input/Stitch mockups/novo-editorial-enhanced/index.html`.*
