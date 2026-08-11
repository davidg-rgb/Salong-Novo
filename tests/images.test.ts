import { describe, it, expect } from "vitest";
import {
  variantKey,
  variantUrl,
  buildSrcset,
  widthsFor,
  imageAttrs,
  parseVariants,
  responsiveImageAttrs,
  VARIANT_WIDTHS,
} from "../src/lib/images";

const BASE = "https://img.salongnovo.se";

describe("variant keys + urls", () => {
  it("builds a webp variant key from any extension", () => {
    expect(variantKey("blog/cover.png", 960)).toBe("blog/cover-960.webp");
    expect(variantKey("blog/cover", 480)).toBe("blog/cover-480.webp");
  });
  it("joins base + key without double slashes", () => {
    expect(variantUrl(BASE + "/", "/blog/cover.jpg", 480)).toBe(
      "https://img.salongnovo.se/blog/cover-480.webp",
    );
  });
});

describe("widthsFor", () => {
  it("only includes widths <= original", () => {
    expect(widthsFor(1000)).toEqual([480, 960]);
  });
  it("always returns at least the smallest width", () => {
    expect(widthsFor(100)).toEqual([480]);
  });
});

describe("buildSrcset", () => {
  it("creates a valid srcset string", () => {
    const set = buildSrcset(BASE, "x.jpg", [480, 960]);
    expect(set).toBe(
      "https://img.salongnovo.se/x-480.webp 480w, https://img.salongnovo.se/x-960.webp 960w",
    );
  });
});

describe("imageAttrs", () => {
  it("returns lazy, async responsive attributes", () => {
    const a = imageAttrs(BASE, "x.jpg");
    expect(a.loading).toBe("lazy");
    expect(a.decoding).toBe("async");
    expect(a.src).toContain("x-960.webp");
    expect(a.srcset.split(",").length).toBe(VARIANT_WIDTHS.length);
  });
});

describe("parseVariants", () => {
  it("returns [] for null/undefined", () => {
    expect(parseVariants(null)).toEqual([]);
    expect(parseVariants(undefined)).toEqual([]);
  });
  it("returns [] for an empty JSON array", () => {
    expect(parseVariants("[]")).toEqual([]);
  });
  it("parses a valid array, filtered to known widths", () => {
    expect(parseVariants("[480,960]")).toEqual([480, 960]);
  });
  it("drops unknown widths and non-numbers", () => {
    expect(parseVariants("[480, 123, \"960\", 1600]")).toEqual([480, 1600]);
  });
  it("returns [] on garbage JSON or non-array JSON", () => {
    expect(parseVariants("not json")).toEqual([]);
    expect(parseVariants("{\"a\":1}")).toEqual([]);
    expect(parseVariants("42")).toEqual([]);
  });
});

describe("responsiveImageAttrs", () => {
  it("empty variants → served original via base, no srcset/sizes", () => {
    const a = responsiveImageAttrs(BASE, "blog/x.webp", [], { alt: "En bild" });
    expect(a.src).toBe("https://img.salongnovo.se/blog/x.webp");
    expect(a.srcset).toBeUndefined();
    expect(a.sizes).toBeUndefined();
    expect(a.loading).toBe("lazy");
    expect(a.decoding).toBe("async");
    expect(a.alt).toBe("En bild");
  });
  it("empty variants + empty base → Stage-A /api/media URL", () => {
    const a = responsiveImageAttrs("", "blog/x.webp", []);
    expect(a.src).toBe("/api/media/blog/x.webp");
    expect(a.srcset).toBeUndefined();
  });
  it("with variants → webp srcset + sizes, src from an available width", () => {
    const a = responsiveImageAttrs(BASE, "blog/x.webp", [480, 960], { sizes: "100vw" });
    expect(a.src).toBe("https://img.salongnovo.se/blog/x-960.webp");
    expect(a.srcset).toBe(
      "https://img.salongnovo.se/blog/x-480.webp 480w, https://img.salongnovo.se/blog/x-960.webp 960w",
    );
    expect(a.sizes).toBe("100vw");
  });
  it("falls back src to the largest width when 960 is absent", () => {
    const a = responsiveImageAttrs(BASE, "blog/x.webp", [480, 1600]);
    expect(a.src).toBe("https://img.salongnovo.se/blog/x-1600.webp");
  });
  it("omits alt when not provided", () => {
    const a = responsiveImageAttrs(BASE, "blog/x.webp", []);
    expect("alt" in a).toBe(false);
  });
});
