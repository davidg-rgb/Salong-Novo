import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  allStaticVariantPaths,
  staticPicture,
  staticVariantPath,
  type VariantManifest,
} from "~/lib/static-images";
import { flatAwards, getBrands, getStaff } from "~/lib/content";
import { awardImages } from "~/lib/awards";

/**
 * The performance pass of 2026-10-11: build-shipped photos as <picture> with
 * WebP variants, and self-hosted fonts. `fileURLToPath`, never `URL.pathname`:
 * the vault path contains a space.
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const p = (...parts: string[]) => join(ROOT, ...parts);
const read = (...parts: string[]) => readFileSync(p(...parts), "utf8");
const onDisk = (url: string) => existsSync(p("public", ...url.split("/")));

const SIZES = "(max-width: 680px) 50vw, 270px";
const M: VariantManifest = {
  "/images/staff/a.jpg": { width: 800, hash: "x", variants: [480, 800] },
  "/images/awards-2026/b.jpg": { width: 1000, hash: "y", variants: [480, 800, 1000] },
  "/images/empty/c.jpg": { width: 800, hash: "z", variants: [] },
};

describe("staticPicture", () => {
  it("builds the WebP srcset, passes sizes through, keeps the JPEG as fallback", () => {
    expect(staticPicture("/images/staff/a.jpg", { sizes: SIZES }, M)).toEqual({
      webpSrcset: "/images/staff/a-480.webp 480w, /images/staff/a-800.webp 800w",
      sizes: SIZES,
      fallback: "/images/staff/a.jpg",
    });
  });

  it("caps a requested width above the source at the source width (no upscale, no 404)", () => {
    expect(staticPicture("/images/awards-2026/b.jpg", { sizes: SIZES, widths: [480, 1200] }, M)?.webpSrcset).toBe(
      "/images/awards-2026/b-480.webp 480w, /images/awards-2026/b-1000.webp 1000w",
    );
  });

  it("drops a requested width that was never written; null when none is left", () => {
    expect(staticPicture("/images/staff/a.jpg", { sizes: SIZES, widths: [600, 800] }, M)?.webpSrcset).toBe(
      "/images/staff/a-800.webp 800w",
    );
    expect(staticPicture("/images/staff/a.jpg", { sizes: SIZES, widths: [600] }, M)).toBeNull();
    expect(staticPicture("/images/staff/a.jpg", { sizes: SIZES, widths: [] }, M)).toBeNull();
  });

  it("returns null (the caller renders the plain <img>) for empty, absent and unknown sources", () => {
    expect(staticPicture("", { sizes: SIZES }, M)).toBeNull();
    expect(staticPicture(undefined, { sizes: SIZES }, M)).toBeNull();
    expect(staticPicture(null, { sizes: SIZES }, M)).toBeNull();
    // A non-JPEG (a PNG logo), an R2 upload and a path the script never saw.
    expect(staticPicture("/images/brands/keune.png", { sizes: SIZES }, M)).toBeNull();
    expect(staticPicture("https://img.salongnovo.se/staff/x.jpg", { sizes: SIZES }, M)).toBeNull();
    expect(staticPicture("/images/staff/nobody.jpg", { sizes: SIZES }, M)).toBeNull();
    // An entry with no variants, and a prototype key, are not matches.
    expect(staticPicture("/images/empty/c.jpg", { sizes: SIZES }, M)).toBeNull();
    expect(staticPicture("constructor", { sizes: SIZES }, M)).toBeNull();
  });

  it("names variants by the R2 stem convention", () => {
    expect(staticVariantPath("/images/staff/a.jpg", 480)).toBe("/images/staff/a-480.webp");
    expect(staticVariantPath("/images/x/b.JPEG", 800)).toBe("/images/x/b-800.webp");
  });
});

describe("shipped variants exist on disk", () => {
  it("the check is real — a missing variant comes back false", () => {
    expect(onDisk("/images/staff/chriss-berner-480.webp")).toBe(true);
    expect(onDisk("/images/staff/chriss-berner-481.webp")).toBe(false);
  });

  it("every variant the manifest promises is a file in public/", () => {
    const paths = allStaticVariantPaths();
    expect(paths.length).toBeGreaterThan(150);
    expect(paths.filter((path) => !onDisk(path))).toEqual([]);
  });

  it("every staff portrait, award shot, brand shot and home tile has a WebP picture", () => {
    const home = read("src", "components", "Home.astro");
    const tiles = [...home.matchAll(/src: "(\/images\/[^"]+\.jpg)"/g)].map((m) => m[1]!);
    expect(tiles).toHaveLength(5);
    const sources = [
      ...getStaff().map((s) => s.photo).filter((x): x is string => !!x),
      ...flatAwards().flatMap((a) => awardImages(a)).filter((x) => x.startsWith("/images/")),
      ...getBrands().map((b) => b.product).filter((x): x is string => !!x),
      ...tiles,
    ];
    expect(sources.length).toBeGreaterThan(60);
    const missing: string[] = [];
    for (const src of sources) {
      const pic = staticPicture(src, { sizes: SIZES });
      if (!pic) missing.push(`${src} → no manifest entry`);
      else for (const part of pic.webpSrcset.split(", ")) {
        const url = part.split(" ")[0]!;
        if (!onDisk(url)) missing.push(url);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("scripts/image-variants.mjs", () => {
  // A temp project root with one real 600px JPEG, so every branch runs on real
  // files without touching public/ or the shipped manifest.
  let root = "";
  const script = p("scripts", "image-variants.mjs");
  const run = (...args: string[]) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [script, ...args], { env: { ...process.env, IMAGE_VARIANTS_ROOT: root }, encoding: "utf8" }) };
    } catch (err) {
      const e = err as { status: number; stdout: string };
      return { code: e.status, out: e.stdout };
    }
  };
  const staff = () => join(root, "public", "images", "staff");
  const jpeg = (width: number, rgb: [number, number, number]) =>
    sharp({ create: { width, height: width, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).jpeg().toBuffer();

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "novo-variants-"));
    mkdirSync(staff(), { recursive: true });
    mkdirSync(join(root, "src", "lib"), { recursive: true });
    writeFileSync(join(staff(), "a.jpg"), await jpeg(600, [120, 90, 60]));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("--check fails on missing variants, the run writes them capped at the source, then --check passes", async () => {
    const before = run("--check");
    expect(before.code).toBe(1);
    expect(before.out).toContain("MISSING /images/staff/a.jpg -> 480w");
    expect(before.out).toContain("MANIFEST out of date");

    expect(run().code).toBe(0);
    // 800 requested, source is 600 wide: capped to 600, never upscaled.
    expect(existsSync(join(staff(), "a-480.webp"))).toBe(true);
    expect(existsSync(join(staff(), "a-600.webp"))).toBe(true);
    expect(existsSync(join(staff(), "a-800.webp"))).toBe(false);
    // From a buffer: sharp keeps a FILE it opened locked on Windows, and the next run
    // has to overwrite this one.
    expect((await sharp(readFileSync(join(staff(), "a-600.webp"))).metadata()).width).toBe(600);
    const manifest = JSON.parse(readFileSync(join(root, "src", "lib", "static-image-variants.json"), "utf8"));
    expect(manifest["/images/staff/a.jpg"].variants).toEqual([480, 600]);

    expect(run("--check")).toMatchObject({ code: 0 });
    expect(run().out).toContain("0 written");
  });

  it("a source replaced in place is STALE until re-run (content hash, not mtime)", async () => {
    writeFileSync(join(staff(), "a.jpg"), await jpeg(600, [10, 200, 30]));
    const stale = run("--check");
    expect(stale.code).toBe(1);
    expect(stale.out).toContain("STALE /images/staff/a.jpg -> 600w");
    expect(run().out).toContain("2 written");
    expect(run("--check").code).toBe(0);
  });

  it("a deleted variant is MISSING even with a fresh manifest", () => {
    rmSync(join(staff(), "a-480.webp"));
    expect(run("--check").out).toContain("MISSING /images/staff/a.jpg -> 480w");
    expect(run().out).toContain("1 written");
  });

  it("a manifest checked out with CRLF line endings is still in sync (core.autocrlf)", () => {
    const path = join(root, "src", "lib", "static-image-variants.json");
    writeFileSync(path, readFileSync(path, "utf8").replace(/\n/g, "\r\n"));
    expect(run("--check").code).toBe(0);
  });

  it("the shipped tree is in sync (the CI gate)", () => {
    const out = execFileSync(process.execPath, [script, "--check"], { encoding: "utf8" });
    expect(out).toMatch(/image-variants: OK \(\d+ sources, \d+ variants\)/);
  });
});

describe("self-hosted fonts", () => {
  const css = read("src", "styles", "fonts.css");
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]!);

  it("one @font-face per shipped file, each swap + latin unicode-range, files on disk", () => {
    expect(faces).toHaveLength(4);
    for (const face of faces) {
      expect(face).toContain("font-display: swap;");
      expect(face).toMatch(/unicode-range: U\+0000-00FF,/);
      const url = face.match(/url\("([^"]+)"\)/)![1]!;
      expect(url).toMatch(/^\/fonts\/[a-z0-9-]+\.woff2$/);
      expect(onDisk(url)).toBe(true);
    }
    const families = faces.map((f) => `${f.match(/font-family: "([^"]+)"/)![1]}|${f.match(/font-weight: ([^;]+);/)![1]}|${f.match(/font-style: ([^;]+);/)![1]}`);
    expect(families.sort()).toEqual([
      "Hanken Grotesk|300 700|normal",
      "Playfair Display|400|italic",
      "Playfair Display|400|normal",
      "Playfair Display|500|normal",
    ]);
  });

  it("the family names match the tokens, and tokens.css imports fonts.css first", () => {
    const tokens = read("src", "styles", "tokens.css");
    expect(tokens).toContain('--font-sans: "Hanken Grotesk"');
    expect(tokens).toContain('--font-serif: "Playfair Display"');
    const firstRule = tokens.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(firstRule.startsWith('@import "./fonts.css";')).toBe(true);
  });

  it("OFL licence texts ship beside the fonts", () => {
    for (const f of ["OFL-PlayfairDisplay.txt", "OFL-HankenGrotesk.txt"]) {
      expect(read("public", "fonts", f)).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });

  it("Base.astro loads nothing from Google and preloads the two above-the-fold faces", () => {
    const base = read("src", "layouts", "Base.astro");
    expect(base).not.toMatch(/googleapis|gstatic/);
    for (const file of ["playfair-display-400.woff2", "hanken-grotesk-var-300-700.woff2"]) {
      expect(base).toContain(`<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/${file}" />`);
    }
  });

  it("_headers caches /fonts/* for a year, immutable", () => {
    expect(read("public", "_headers")).toMatch(/^\/fonts\/\*\r?\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
  });
});
