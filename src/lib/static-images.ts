/**
 * Responsive WebP for the BUILD-SHIPPED photography (2026-10-11, performance pass).
 *
 * The sibling of `images.ts`, which does the same job for client uploads in R2.
 * `scripts/image-variants.mjs` writes `${stem}-${w}.webp` beside every JPEG under
 * public/images/{staff,awards-*,nordic-hairshot-2025,brands,textures,story} and records
 * what it wrote in `static-image-variants.json`. This module only READS that
 * manifest, so a srcset can never name a file that is not on disk — a source the
 * manifest does not know (an R2 upload, a PNG logo, a path the script has not
 * seen yet) gets `null`, and the caller renders the plain <img> it always did.
 *
 * Pure + deterministic: the manifest is an argument (defaulting to the shipped
 * one), so the tests can drive every branch without touching the filesystem.
 */
import shipped from "./static-image-variants.json";

export interface VariantEntry {
  /** Source width in px. */
  width: number;
  /** Short content hash of the source (staleness check in the script). */
  hash: string;
  /** Widths written, ascending; the largest is capped at `width`. */
  variants: number[];
}
export type VariantManifest = Record<string, VariantEntry>;

export interface StaticPicture {
  /** `srcset` for the `<source type="image/webp">`. */
  webpSrcset: string;
  sizes: string;
  /** The original JPEG, unchanged: the <img> src for browsers without WebP. */
  fallback: string;
}

const MANIFEST = shipped as VariantManifest;

/** `<stem>.jpg` at 480 → `<stem>-480.webp`, the R2 `variantKey` convention. */
export function staticVariantPath(src: string, width: number): string {
  return `${src.replace(/\.[a-z0-9]+$/i, "")}-${width}.webp`;
}

/**
 * The <picture> data for a build-shipped JPEG, or `null` when there is nothing to
 * serve beyond the original: empty src, an unknown path, or a `widths` filter that
 * matches no variant.
 *
 * `widths` (optional) narrows the set. A requested width above the source is
 * capped at the source width — the same rule the script writes by — so asking for
 * 1200 of a 1000px original yields the 1000 variant, never an upscale and never
 * a 404.
 */
export function staticPicture(
  src: string | null | undefined,
  opts: { sizes: string; widths?: readonly number[] },
  manifest: VariantManifest = MANIFEST,
): StaticPicture | null {
  if (!src) return null;
  const entry = Object.prototype.hasOwnProperty.call(manifest, src) ? manifest[src] : undefined;
  if (!entry || entry.variants.length === 0) return null;
  const wanted = opts.widths
    ? [...new Set(opts.widths.map((w) => Math.min(w, entry.width)))].filter((w) => entry.variants.includes(w))
    : entry.variants;
  if (wanted.length === 0) return null;
  return {
    webpSrcset: [...wanted]
      .sort((a, b) => a - b)
      .map((w) => `${staticVariantPath(src, w)} ${w}w`)
      .join(", "),
    sizes: opts.sizes,
    fallback: src,
  };
}

/** Every variant path the manifest promises — the exists-on-disk test walks this. */
export function allStaticVariantPaths(manifest: VariantManifest = MANIFEST): string[] {
  return Object.entries(manifest).flatMap(([src, e]) => e.variants.map((w) => staticVariantPath(src, w)));
}
