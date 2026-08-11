/**
 * Pure media helpers (ARCHITECTURE §6.10).
 *
 * No env, no DB, no I/O — `base` is always passed in by the caller, so the
 * module stays edge-safe and fully unit-testable.
 *
 * THIS IS THE UPLOAD TRUST BOUNDARY. `sniffImageType` reads the REAL first bytes,
 * so a spoofed `Content-Type` or filename cannot get past it, and `mimeToExt`
 * derives the R2 key's extension from the validated MIME rather than from
 * anything the client said.
 *
 * Lifted from salong-novo-v2's `src/lib/media.ts` MINUS the markdown helpers
 * (`escapeAltForMarkdown`, `mediaMarkdown`, `extractMediaKeys`): nicole has no
 * prose editor, so there is no inline-image syntax to escape or scan.
 */

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

/** True if the buffer has at least `n` bytes equal to `sig` starting at `off`. */
function matchAt(bytes: Uint8Array, off: number, sig: readonly number[]): boolean {
  if (bytes.length < off + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[off + i] !== sig[i]) return false;
  }
  return true;
}

// "ftyp" box brands that identify an AVIF-family file (major or compatible brand).
const AVIF_BRANDS = new Set(["avif", "avis", "av01", "mif1", "msf1"]);

function asciiAt(bytes: Uint8Array, off: number, len: number): string {
  if (bytes.length < off + len) return "";
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[off + i]!);
  return s;
}

/**
 * Sniff the real image type from the first bytes; `null` if it matches none.
 *
 * - JPEG: `FF D8 FF`
 * - PNG:  `89 50 4E 47 0D 0A 1A 0A`
 * - WebP: `52 49 46 46` ("RIFF") at 0, `57 45 42 50` ("WEBP") at 8
 * - AVIF: "ftyp" box ("66 74 79 70") at offset 4, with a major/compatible
 *         brand in the AVIF family (avif/avis/av01/mif1/msf1).
 */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  // PNG — checked before JPEG: longest-specific signature first.
  if (matchAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (matchAt(bytes, 0, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  // WebP — RIFF container with a WEBP fourcc at offset 8.
  if (
    matchAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    matchAt(bytes, 8, [0x57, 0x45, 0x42, 0x50]) // "WEBP"
  ) {
    return "image/webp";
  }
  // AVIF — ISO-BMFF "ftyp" box. Layout: [size:4][type:4]["ftyp"][major:4][minor:4][compat…]
  if (matchAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])) {
    const majorBrand = asciiAt(bytes, 8, 4);
    if (AVIF_BRANDS.has(majorBrand)) return "image/avif";
    // Also accept an AVIF brand appearing as a COMPATIBLE brand (past the
    // 4-byte minor-version field at offset 12), tolerating writers that put a
    // generic major brand first.
    for (let off = 16; off + 4 <= bytes.length && off < 64; off += 4) {
      if (AVIF_BRANDS.has(asciiAt(bytes, off, 4))) return "image/avif";
    }
  }
  return null;
}

/**
 * MIME → file extension for the R2 key, so a spoofed filename can never pick
 * the extension. Unknown MIMEs collapse to `"bin"`.
 */
export function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}

/** Trim trailing slashes from a base URL so we never emit `//`. */
function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

/**
 * Stage A vs Stage B served URL (F-012).
 *
 * `base === ""` → same-origin `/api/media/<key>`, served by the public route;
 * a configured `PUBLIC_IMAGE_BASE` → `<base>/<key>` straight off the R2 custom
 * domain. `posterSrc` (src/lib/portfolio.ts) implements the identical switch for
 * portfolio posters; a parity test keeps the two from drifting.
 */
export function servedUrl(base: string, key: string): string {
  const clean = key.replace(/^\/+/, "");
  const root = trimBase(base.trim());
  return root ? `${root}/${clean}` : `/api/media/${clean}`;
}
