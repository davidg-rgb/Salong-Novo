/**
 * Responsive image helpers. On upload, the worker generates fixed-width WebP
 * variants in R2 under `${key}-${w}.webp`. These helpers build the public URLs
 * and the `srcset` the front-end serves. Pure + deterministic → fully testable.
 */

export const VARIANT_WIDTHS = [480, 960, 1600] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** R2 object key for a generated variant. */
export function variantKey(key: string, width: number): string {
  const stem = key.replace(/\.[a-z0-9]+$/i, "");
  return `${stem}-${width}.webp`;
}

/** Public URL for a specific variant. */
export function variantUrl(base: string, key: string, width: number): string {
  return joinUrl(base, variantKey(key, width));
}

/** Public URL for the stored original. */
export function originalUrl(base: string, key: string): string {
  return joinUrl(base, key);
}

/** Which variant widths to generate/serve given the source width. */
export function widthsFor(originalWidth: number): VariantWidth[] {
  const widths = VARIANT_WIDTHS.filter((w) => w <= originalWidth);
  return widths.length ? widths : [VARIANT_WIDTHS[0]];
}

/** Build a `srcset` string for the given key + available widths. */
export function buildSrcset(
  base: string,
  key: string,
  widths: readonly number[] = VARIANT_WIDTHS,
): string {
  return widths
    .map((w) => `${variantUrl(base, key, w)} ${w}w`)
    .join(", ");
}

/** Default `sizes` attribute (full-width on mobile, capped on desktop). */
export const DEFAULT_SIZES = "(max-width: 768px) 100vw, 960px";

/** Everything a responsive <img> needs. */
export function imageAttrs(
  base: string,
  key: string,
  opts: { widths?: readonly number[]; sizes?: string; fallback?: VariantWidth } = {},
) {
  const widths = opts.widths ?? VARIANT_WIDTHS;
  const fallback = opts.fallback ?? 960;
  return {
    src: variantUrl(base, key, fallback),
    srcset: buildSrcset(base, key, widths),
    sizes: opts.sizes ?? DEFAULT_SIZES,
    loading: "lazy" as const,
    decoding: "async" as const,
  };
}

/** Served URL for the stored original (Stage-A `/api/media/*` when base is empty). */
function servedOriginal(base: string, key: string): string {
  return base ? originalUrl(base, key) : `/api/media/${key}`;
}

/**
 * Parse a stored `media.variants` JSON value to the known `VariantWidth`s.
 * Guards `JSON.parse` and filters to `VARIANT_WIDTHS` → null/`"[]"`/garbage → [].
 */
export function parseVariants(json: string | null | undefined): VariantWidth[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const known = new Set<number>(VARIANT_WIDTHS);
  return parsed.filter((w): w is VariantWidth => typeof w === "number" && known.has(w));
}

/** Attributes returned by `responsiveImageAttrs`. */
export interface ResponsiveImageAttrs {
  src: string;
  srcset?: string;
  sizes?: string;
  loading: "lazy";
  decoding: "async";
  alt?: string;
}

/**
 * Graceful, fallback-aware `<img>` attributes (ARCHITECTURE §10.7 / A5).
 *
 * - **No variants** (`variants.length === 0`): serve the stored original via
 *   `servedOriginal` with NO `srcset`/`sizes` (a `-{w}.webp` srcset would 404
 *   until the deferred variant Worker exists).
 * - **Has variants**: emit a real `srcset` + `sizes`; `src` falls back to a
 *   sensible width that is actually present in `variants`.
 *
 * `opts.alt` is passed through when provided.
 */
export function responsiveImageAttrs(
  base: string,
  key: string,
  variants: readonly number[],
  opts: { sizes?: string; alt?: string } = {},
): ResponsiveImageAttrs {
  if (variants.length === 0) {
    return {
      src: servedOriginal(base, key),
      loading: "lazy",
      decoding: "async",
      ...(opts.alt !== undefined ? { alt: opts.alt } : {}),
    };
  }
  // Prefer 960 when present, else the largest available width.
  const fallback = variants.includes(960)
    ? 960
    : Math.max(...variants);
  return {
    src: variantUrl(base, key, fallback),
    srcset: buildSrcset(base, key, variants),
    sizes: opts.sizes ?? DEFAULT_SIZES,
    loading: "lazy",
    decoding: "async",
    ...(opts.alt !== undefined ? { alt: opts.alt } : {}),
  };
}
