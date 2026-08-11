/**
 * Pure media helpers for the admin upload + inline-image pipeline (§10.7).
 *
 * No env, no DB, no I/O — `base` is always passed in by the caller (so the
 * module stays edge-safe and fully unit-testable). This is the trust boundary
 * for image uploads: `sniffImageType` validates the REAL bytes (a spoofed
 * `Content-Type`/filename can't get past it), and `mimeToExt` derives the R2
 * key extension from the validated MIME — never from the user's filename.
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
  // PNG — check before JPEG: both are short, longest-specific first.
  if (matchAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // JPEG
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
  // AVIF — ISO-BMFF "ftyp" box. Box layout: [size:4][type:4]["ftyp"]...
  // The "ftyp" type is at offset 4; the major brand follows at offset 8.
  if (matchAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])) {
    const majorBrand = asciiAt(bytes, 8, 4);
    if (AVIF_BRANDS.has(majorBrand)) return "image/avif";
    // Also accept an AVIF brand appearing as a compatible brand (after the
    // 4-byte minor-version field at offset 12), to tolerate writers that put
    // a generic major brand first.
    for (let off = 16; off + 4 <= bytes.length && off < 64; off += 4) {
      if (AVIF_BRANDS.has(asciiAt(bytes, off, 4))) return "image/avif";
    }
  }
  return null;
}

/**
 * MIME → file extension for the R2 key (so a spoofed filename can't pick the
 * ext). Unknown MIMEs collapse to `"bin"`.
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

/**
 * Escape alt text so `]` / newlines / `[` can't break `![alt](url)` markdown
 * link syntax. Deterministic. The real breaker is the `]` that closes the alt
 * span; `[` is escaped defensively, and newlines/`\r` collapse to a single
 * space so the image stays on one line.
 */
export function escapeAltForMarkdown(alt: string): string {
  return (alt ?? "")
    .replace(/[\r\n]+/g, " ") // newlines would break the inline image
    .replace(/\\/g, "\\\\") // escape existing backslashes first
    .replace(/\[/g, "\\[") // defensive: opening bracket
    .replace(/\]/g, "\\]"); // the real breaker: closing bracket
}

/** Build the ready-to-insert inline image markdown `![alt](url)`. */
export function mediaMarkdown(alt: string, url: string): string {
  return `![${escapeAltForMarkdown(alt)}](${url})`;
}

/** Trim trailing slashes from a base URL (so we don't emit `//`). */
function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

/**
 * Stage-A vs Stage-B served URL (§10.7).
 * `base === ""` → same-origin `/api/media/<key>`; else `<base>/<key>`.
 */
export function servedUrl(base: string, key: string): string {
  return base ? `${trimBase(base)}/${key}` : `/api/media/${key}`;
}

// All markdown image links: ![alt](URL). Captures the URL (group 1), allowing
// an optional "title" after the URL. URL stops at whitespace or `)`.
const IMAGE_RE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)/g;

/**
 * Extract the R2 keys an inline body references (covers are handled separately
 * by the route). Maps each served media URL back to its `blog/uuid.ext` key:
 *   - Stage A: `/api/media/<key>` (optionally same-origin-absolute)
 *   - Stage B: `<base>/<key>`
 * External / non-media URLs are ignored. Returns the unique key list.
 */
export function extractMediaKeys(body: string, base: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const trimmedBase = base ? trimBase(base) : "";

  const push = (key: string) => {
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  };

  IMAGE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMAGE_RE.exec(body ?? "")) !== null) {
    let url = m[1]!;
    // Strip a fragment/query if present (keys never contain them).
    url = url.split("#")[0]!.split("?")[0]!;

    // Stage B: configured custom base (e.g. https://img.salongnovo.se/<key>).
    if (trimmedBase && url.startsWith(trimmedBase + "/")) {
      push(url.slice(trimmedBase.length + 1));
      continue;
    }

    // Stage A: /api/media/<key>, possibly as an absolute same-origin URL.
    const apiIdx = url.indexOf("/api/media/");
    if (apiIdx !== -1) {
      // Accept either a root-relative ("/api/media/...") or absolute
      // ("https://host/api/media/...") served URL.
      const key = url.slice(apiIdx + "/api/media/".length);
      push(key);
      continue;
    }
    // Otherwise: external / unrelated image — ignore.
  }

  return keys;
}
