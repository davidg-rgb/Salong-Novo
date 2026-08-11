---
name: Haute Editorial
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#725a3a'
  on-secondary: '#ffffff'
  secondary-container: '#feddb4'
  on-secondary-container: '#786040'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1c1b1a'
  on-tertiary-container: '#868382'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#feddb4'
  secondary-fixed-dim: '#e0c29a'
  on-secondary-fixed: '#281801'
  on-secondary-fixed-variant: '#584325'
  tertiary-fixed: '#e6e2df'
  tertiary-fixed-dim: '#cac6c4'
  on-tertiary-fixed: '#1c1b1a'
  on-tertiary-fixed-variant: '#484645'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  off-white: '#F8F8F8'
  bronze-muted: '#8C7352'
  hairline-gray: '#E5E5E5'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 72px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 44px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '1.2'
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.15em
  nav-link:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
spacing:
  unit: 8px
  margin-desktop: 80px
  margin-mobile: 24px
  gutter: 32px
  section-gap: 160px
---

## Brand & Style

This design system is built for the premium salon experience, positioning the product at the intersection of high-fashion editorial and architectural minimalism. The brand personality is sophisticated, authoritative, and avant-garde, mirroring the legacy of a flagship institution.

The visual style follows a **Modern Editorial** approach:
- **Minimalism:** High-ratio whitespace serves as a structural element, not just a container.
- **Photography-Driven:** The UI acts as a silent frame for high-fidelity brand imagery.
- **Fashion Influence:** Borrowing cues from legacy mastheads, the design utilizes asymmetrical balance and extreme typographic contrast to evoke a sense of luxury and exclusivity.

## Colors

The palette is strictly curated to reflect the prestige of a flagship salon. 

- **Deep Charcoal (#1A1A1A):** Used for primary typography, structural icons, and high-impact backgrounds. It provides more depth and softness than pure black.
- **Pure White (#FFFFFF):** The primary canvas. Generous use of white creates the "gallery" effect necessary for luxury branding.
- **Muted Gold/Bronze (#A68B67):** Reserved exclusively for calls to action, active states, and subtle branding accents. It must be used sparingly to maintain its value.
- **Neutral Accents:** Use `off-white` for subtle section depth and `hairline-gray` for delicate structural dividers.

## Typography

The typography system relies on a high-contrast pairing of a sophisticated Serif and a contemporary Sans-Serif.

- **Headlines:** Use **Playfair Display**. It provides the dramatic, high-contrast strokes characteristic of fashion editorials. Display sizes should use tighter letter spacing for a more "locked-in" look.
- **Body & UI:** Use **Hanken Grotesk**. This font provides a clean, neutral, and highly legible counterpoint to the serif headlines.
- **Asymmetry:** Headers should often be paired with significant left-side margins or staggered vertically to disrupt standard symmetrical patterns.
- **Labels:** Use `label-caps` for eyebrows, small descriptors, and secondary navigation to introduce a rhythmic, structural feel to the layouts.

## Layout & Spacing

The layout philosophy is defined by **intentional asymmetry** and **expansive breathing room**. 

- **Grid:** A 12-column fixed grid on desktop with generous 80px side margins. 
- **Rhythm:** Use large vertical gaps (`section-gap`) to separate services and portfolio pieces, forcing the user to focus on one piece of content at a time.
- **Asymmetrical Balance:** Avoid centering all content. Align text-heavy blocks to one side of the grid while allowing images to bleed or span across the remaining columns.
- **Dividers:** Use 1px `hairline-gray` lines for horizontal and vertical separations. Dividers should never feel heavy; they are "guides" rather than "walls."

## Elevation & Depth

In keeping with the minimalist editorial aesthetic, traditional shadows are replaced by **Tonal Layering** and **Lineal Definition**.

- **Surface Levels:** Most content sits flat on the `Pure White` base. Use `off-white` (#F8F8F8) for subtle full-width section backgrounds to distinguish between "content" and "utility" areas.
- **No Shadows:** Avoid drop shadows entirely. Depth should be achieved through the overlapping of elements (e.g., text slightly overlapping an image) or through high-contrast color blocks.
- **Glassmorphism:** Use only for fixed navigation headers—a very high-opacity white blur (90%) to maintain legibility while hinting at the content underneath.

## Shapes

The shape language is **Architectural and Sharp**. 

- **Corners:** Use 0px radius for all primary elements, including buttons, cards, and image containers. Sharp corners reinforce the high-end, professional, and slightly "hard" edge of fashion branding.
- **Imagery:** Photos should be strictly rectangular or square. Avoid circular masks unless used for tiny avatars or social icons.
- **Containers:** Border-driven containers should use the thin 1px `hairline-gray` weight.

## Components

### Buttons
- **Primary:** Rectangle with 0px radius. Background: `Bronze (#A68B67)`, Text: `White (#FFFFFF)`. 
- **Ghost:** Rectangle with 0px radius. 1px Border: `Deep Charcoal (#1A1A1A)`.
- **Interaction:** On hover, primary buttons should shift to `bronze-muted` or slightly increase in size (1.02x) without a transition blur.

### Input Fields
- Underline style only. No containing boxes. Label floats above in `label-caps` style. Focus state changes the underline from `hairline-gray` to `Deep Charcoal`.

### Cards
- Borderless. Typography sits either directly below or partially overlapping the image. Use a fixed aspect ratio for all portfolio cards (e.g., 4:5 or 2:3) to maintain the vertical editorial feel.

### Lists & Menus
- Navigation items should have high letter spacing. Active items are indicated by a subtle 1px `Bronze` underline or a small bronze dot rather than a background change.

### Dividers
- Vertical dividers should be used to separate column-based text (like a newspaper) to emphasize the editorial narrative.