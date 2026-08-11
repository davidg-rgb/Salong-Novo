import { describe, it, expect } from "vitest";
import {
  ALLOWED_MIME,
  sniffImageType,
  mimeToExt,
  escapeAltForMarkdown,
  mediaMarkdown,
  servedUrl,
  extractMediaKeys,
} from "../src/lib/media";

// ---- byte-signature fixtures (minimal-but-real magic bytes) ----------------

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

// JPEG: FF D8 FF + a JFIF-ish tail (only the first 3 bytes are required).
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46);
// PNG: full 8-byte signature.
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d);
// WebP: "RIFF" .... "WEBP" (4 size bytes between).
const WEBP = bytes(
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x1a, 0x00, 0x00, 0x00, // (size, ignored)
  0x57, 0x45, 0x42, 0x50, // WEBP
  0x56, 0x50, 0x38, 0x20, // VP8 chunk
);
// AVIF: [size][ftyp][avif major brand][minor][compat brands].
const AVIF = bytes(
  0x00, 0x00, 0x00, 0x1c, // box size
  0x66, 0x74, 0x79, 0x70, // "ftyp"
  0x61, 0x76, 0x69, 0x66, // "avif" major brand
  0x00, 0x00, 0x00, 0x00, // minor version
  0x61, 0x76, 0x69, 0x66, // compatible brand "avif"
  0x6d, 0x69, 0x66, 0x31, // compatible brand "mif1"
);
// AVIF variant: generic major brand, "avif" only as a compatible brand.
const AVIF_COMPAT = bytes(
  0x00, 0x00, 0x00, 0x20,
  0x66, 0x74, 0x79, 0x70, // "ftyp"
  0x6d, 0x69, 0x66, 0x31, // "mif1" major brand (also AVIF-family)
  0x00, 0x00, 0x00, 0x00, // minor version
  0x61, 0x76, 0x69, 0x73, // compatible brand "avis"
);

describe("sniffImageType — real magic bytes", () => {
  it("recognizes a JPEG signature", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
  });
  it("recognizes a PNG signature", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
  });
  it("recognizes a WebP (RIFF....WEBP) signature", () => {
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });
  it("recognizes an AVIF ftyp/avif signature", () => {
    expect(sniffImageType(AVIF)).toBe("image/avif");
  });
  it("recognizes AVIF when avif/mif1 is the major brand (compat case)", () => {
    expect(sniffImageType(AVIF_COMPAT)).toBe("image/avif");
  });

  it("returns null for an unknown/garbage buffer", () => {
    expect(sniffImageType(bytes(0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07))).toBeNull();
  });
  it("returns null for a too-short buffer (length guard)", () => {
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull(); // JPEG needs 3 bytes
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull(); // PNG needs 8
    expect(sniffImageType(bytes())).toBeNull(); // empty
  });
  it("returns null for RIFF that is not WEBP (e.g. WAV)", () => {
    const wav = bytes(
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, // "WAVE", not "WEBP"
    );
    expect(sniffImageType(wav)).toBeNull();
  });
  it("returns null for ftyp with a non-image brand (e.g. mp4)", () => {
    const mp4 = bytes(
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // "ftyp"
      0x6d, 0x70, 0x34, 0x32, // "mp42" — not AVIF family
      0x00, 0x00, 0x00, 0x00,
      0x69, 0x73, 0x6f, 0x6d, // "isom"
    );
    expect(sniffImageType(mp4)).toBeNull();
  });

  it("returns PNG for a file CLAIMED as JPEG but carrying PNG bytes (mismatch the route uses)", () => {
    // The upload route compares this against the declared MIME to reject spoofs.
    const declaredJpegButReallyPng = PNG;
    expect(sniffImageType(declaredJpegButReallyPng)).toBe("image/png");
    expect(sniffImageType(declaredJpegButReallyPng)).not.toBe("image/jpeg");
  });

  it("only ever returns members of the ALLOWED_MIME set (or null)", () => {
    for (const buf of [JPEG, PNG, WEBP, AVIF, AVIF_COMPAT]) {
      const t = sniffImageType(buf);
      expect(t).not.toBeNull();
      expect(ALLOWED_MIME.has(t!)).toBe(true);
    }
  });
});

describe("mimeToExt", () => {
  it("maps each allowed MIME to its extension", () => {
    expect(mimeToExt("image/jpeg")).toBe("jpg");
    expect(mimeToExt("image/png")).toBe("png");
    expect(mimeToExt("image/webp")).toBe("webp");
    expect(mimeToExt("image/avif")).toBe("avif");
  });
  it("returns 'bin' for an unknown MIME", () => {
    expect(mimeToExt("application/octet-stream")).toBe("bin");
    expect(mimeToExt("image/gif")).toBe("bin");
    expect(mimeToExt("")).toBe("bin");
  });
});

describe("escapeAltForMarkdown + mediaMarkdown", () => {
  it("escapes a closing bracket so it can't end the alt span early", () => {
    const out = escapeAltForMarkdown("a ] b");
    expect(out).toBe("a \\] b");
  });
  it("escapes an opening bracket defensively", () => {
    expect(escapeAltForMarkdown("a [ b")).toBe("a \\[ b");
  });
  it("collapses newlines/carriage returns to a single space", () => {
    expect(escapeAltForMarkdown("line1\nline2\r\nline3")).toBe("line1 line2 line3");
  });
  it("escapes pre-existing backslashes (no double-unescape surprises)", () => {
    expect(escapeAltForMarkdown("a\\b")).toBe("a\\\\b");
  });
  it("handles empty/nullish alt deterministically", () => {
    expect(escapeAltForMarkdown("")).toBe("");
    // @ts-expect-error — guarding the runtime nullish path
    expect(escapeAltForMarkdown(undefined)).toBe("");
  });

  it("produces markdown with exactly one unescaped ] before the (url) even with hostile alt", () => {
    const hostile = "evil] (javascript:alert(1)) ![x](y) [link\nbreak]";
    const url = "/api/media/blog/abc.jpg";
    const out = mediaMarkdown(hostile, url);

    // Structure: ![ <escaped-alt> ]( <url> )
    expect(out.startsWith("![")).toBe(true);
    expect(out.endsWith(`](${url})`)).toBe(true);

    // Find the FIRST unescaped ']' — it must be the syntactic alt terminator,
    // and it must be immediately followed by "(url)".
    const body = out.slice(2); // drop leading "!["
    let idx = -1;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === "]" && body[i - 1] !== "\\") {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThan(-1);
    expect(body.slice(idx)).toBe(`](${url})`);

    // And there is exactly one unescaped ']' in the whole string.
    let unescaped = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === "]" && out[i - 1] !== "\\") unescaped++;
    }
    expect(unescaped).toBe(1);
  });

  it("round-trips a normal alt unchanged inside the link", () => {
    expect(mediaMarkdown("Frisör klipper hår", "/api/media/blog/x.jpg")).toBe(
      "![Frisör klipper hår](/api/media/blog/x.jpg)",
    );
  });
});

describe("servedUrl", () => {
  it("empty base → same-origin /api/media/<key>", () => {
    expect(servedUrl("", "blog/x.jpg")).toBe("/api/media/blog/x.jpg");
  });
  it("custom base → <base>/<key>", () => {
    expect(servedUrl("https://img.salongnovo.se", "blog/x.jpg")).toBe(
      "https://img.salongnovo.se/blog/x.jpg",
    );
  });
  it("trims a trailing slash on the base (no double slash)", () => {
    expect(servedUrl("https://img.salongnovo.se/", "blog/x.jpg")).toBe(
      "https://img.salongnovo.se/blog/x.jpg",
    );
  });
});

describe("extractMediaKeys", () => {
  it("returns the two inline R2 keys (Stage A), deduped, excluding external", () => {
    const body = [
      "# Intro",
      "![first](/api/media/blog/aaaa-1111.jpg)",
      "Some text.",
      "![external](https://example.com/photo.png)",
      "![second](/api/media/blog/bbbb-2222.webp)",
    ].join("\n\n");

    expect(extractMediaKeys(body, "")).toEqual([
      "blog/aaaa-1111.jpg",
      "blog/bbbb-2222.webp",
    ]);
  });

  it("dedupes a key referenced twice", () => {
    const body =
      "![a](/api/media/blog/dup.jpg)\n\n![a again](/api/media/blog/dup.jpg)";
    expect(extractMediaKeys(body, "")).toEqual(["blog/dup.jpg"]);
  });

  it("maps Stage-B custom-base URLs back to keys (trailing slash tolerant)", () => {
    const base = "https://img.salongnovo.se/";
    const body =
      "![a](https://img.salongnovo.se/blog/cdn-1.avif)\n\n" +
      "![ext](https://other.cdn/blog/nope.jpg)";
    expect(extractMediaKeys(body, base)).toEqual(["blog/cdn-1.avif"]);
  });

  it("handles an absolute same-origin Stage-A served URL", () => {
    const body = "![a](https://salongnovo.se/api/media/blog/abs.jpg)";
    expect(extractMediaKeys(body, "")).toEqual(["blog/abs.jpg"]);
  });

  it("ignores fragments/queries when extracting the key", () => {
    const body = "![a](/api/media/blog/q.jpg?v=2#frag)";
    expect(extractMediaKeys(body, "")).toEqual(["blog/q.jpg"]);
  });

  it("returns [] when there are no media images", () => {
    expect(extractMediaKeys("![x](https://example.com/a.png) plain text", "")).toEqual([]);
    expect(extractMediaKeys("", "")).toEqual([]);
  });
});
