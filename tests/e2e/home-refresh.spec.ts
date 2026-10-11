/**
 * Home refresh — browser acceptance (2026-09-30).
 *
 * The first four describe blocks are the Desktop-Claude kit's 15 checks
 * (novo-refresh.spec.ts), assertions unchanged, selectors moved to the names the
 * components render natively: .strip-head (was .nr-strip-head), .scroll-cue
 * (.nr-scroll), .role-tag (.nr-role), li.owner (li.nr-owner). The rest are the
 * project's own: the paths the kit never had to cover once markup moved into
 * the components and Lenis became a real dependency.
 *
 *   npm run e2e    (builds, serves the Worker on :4321, runs Chromium)
 */
import { mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const HOME = "/";
const SHOTS = fileURLToPath(new URL("./__shots__/", import.meta.url));
const VIDEO_DIR = fileURLToPath(new URL("../../public/video/", import.meta.url));

// Since the hero film landed (2026-10-10) every home-page test starts a 4-11 MB
// mp4 download, and `wrangler dev`'s proxy worker dies ("Network connection
// lost", the whole server exits) when a page closes mid-stream — observed twice
// on the hero|reduced subset. The browser therefore gets the film from disk; the
// "served by the Worker" test below fetches it from the server in full, so the
// static-asset path is still proven. Production Workers are not affected.
test.beforeEach(async ({ page }) => {
  await page.route(/\/video\/hero-(?:1080|720)\.mp4$/, (route) =>
    route.fulfill({ path: `${VIDEO_DIR}${new URL(route.request().url()).pathname.split("/").pop()}`, contentType: "video/mp4" }),
  );
});

async function open(page: Page, width: number, height = 900, path = HOME) {
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.waitForFunction(() => document.documentElement.classList.contains("nr"));
  await page.waitForTimeout(400);
}

/** Team grid rows as item counts per visual row, e.g. [2,5,5,5]. */
async function teamRows(page: Page) {
  return page.$$eval(".team-grid > li", (lis) => {
    // offsetTop = layout position, unaffected by reveal transforms mid-animation
    const tops = lis.map((li) => (li as HTMLElement).offsetTop);
    const uniq = [...new Set(tops)];
    return uniq.map((t) => tops.filter((x) => x === t).length);
  });
}

// ── The kit's 15 ────────────────────────────────────────────────────────────

test.describe("runtime", () => {
  test("no script errors, layer active", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await open(page, 1440);
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
    await expect(page.locator("html")).toHaveClass(/\bnr\b/);
    await expect(page.locator("html")).toHaveClass(/\bnr-home\b/);
  });

  test("component markup is never duplicated (the script renders none of it)", async ({ page }) => {
    await open(page, 1440);
    await expect(page.locator(".strip-head")).toHaveCount(1);
    await expect(page.locator(".hero .scroll-cue")).toHaveCount(1);
    await expect(page.locator(".role-tag")).toHaveCount(2);
  });
});

test.describe("layout", () => {
  for (const w of [390, 900, 1440]) {
    test(`no horizontal overflow at ${w}px`, async ({ page }) => {
      await open(page, w);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("team grid: owners + full rows, no orphan (desktop 2+5+5+5)", async ({ page }) => {
    await open(page, 1440);
    expect(await teamRows(page)).toEqual([2, 5, 5, 5]);
    await expect(page.locator(".team-grid > li.owner")).toHaveCount(2);
  });

  test("team grid tablet: 2 + rows of 3", async ({ page }) => {
    await open(page, 900);
    expect(await teamRows(page)).toEqual([2, 3, 3, 3, 3, 3]);
  });

  test("team grid mobile: owners full width, pairs, odd last card full width", async ({ page }) => {
    await open(page, 390, 844);
    expect(await teamRows(page)).toEqual([1, 1, 2, 2, 2, 2, 2, 2, 2, 1]);
  });
});

test.describe("header", () => {
  test("desktop: nav on one line, transparent over hero, solid after it", async ({ page }) => {
    await open(page, 1440);
    const heights = await page.$$eval(".nav-desktop a", (as) => as.map((a) => a.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeLessThan(24); // no two-line items
    await expect(page.locator(".site-header")).not.toHaveClass(/nr-solid/);
    const heroH = await page.locator(".hero").evaluate((el) => (el as HTMLElement).offsetHeight);
    await page.evaluate((y) => window.scrollTo(0, y), heroH + 50);
    await page.waitForTimeout(300);
    await expect(page.locator(".site-header")).toHaveClass(/nr-solid/);
  });

  test("below 1340px the mobile menu takes over and opens", async ({ page }) => {
    await open(page, 1200);
    await expect(page.locator(".nav-desktop")).toBeHidden();
    const toggle = page.locator(".nav-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".nav-mobile")).toBeVisible();
  });
});

test.describe("sections", () => {
  test("hero: wordmark split into 4 letters, intro runs", async ({ page }) => {
    await open(page, 1440);
    const letters = await page.$$eval(".hero .nr-letter", (els) => els.map((e) => (e as SVGElement).style.getPropertyValue("--l").trim()));
    expect(letters.sort()).toEqual(["0", "1", "2", "3"]);
    await expect(page.locator(".hero")).toHaveClass(/nr-go/, { timeout: 3000 });
  });

  test("awards: heading, numbered captions below the images, seamless loop", async ({ page }) => {
    await open(page, 1440);
    await expect(page.locator(".strip-head h2")).toContainText("Årets Frisör 2026");
    const caps = await page.$$eval(".strip-track > .tile:not([aria-hidden]) .cap", (cs) => cs.map((c) => (c as HTMLElement).dataset.n));
    expect(caps).toEqual(["01", "02", "03", "04", "05"]);
    await expect(page.locator(".strip .cap").first()).toHaveCSS("position", "static");
    await expect(page.locator(".strip-track > .tile[aria-hidden='true']")).toHaveCount(5);
    const altsOfClones = await page.$$eval(".strip-track > .tile[aria-hidden='true'] img", (ims) => ims.map((i) => (i as HTMLImageElement).alt));
    expect(altsOfClones.every((a) => a === "")).toBe(true);
    await expect(page.locator(".strip-track")).toHaveClass(/nr-marquee/);
  });

  test("booking block: italic accent + ink button (contrast fix)", async ({ page }) => {
    await open(page, 1440);
    await expect(page.locator(".fc-head .nr-em")).toHaveCSS("font-style", "italic");
    await expect(page.locator(".footer-cta .btn")).toHaveCSS("background-color", "rgb(26, 26, 26)");
  });

  test("small labels on white use bronze-dark (contrast fix)", async ({ page }) => {
    await open(page, 1440);
    await expect(page.locator(".story .kicker")).toHaveCSS("color", "rgb(114, 90, 58)");
    await expect(page.locator(".team .kicker")).toHaveCSS("color", "rgb(114, 90, 58)");
  });
});

// ── The hero film (2026-10-10) ──────────────────────────────────────────────
// refresh.ts attaches a source only with motion allowed, Save-Data off and both
// data-src paths present; every other path leaves the poster as the plate.

const video = (page: Page) => page.locator(".hero video.hero-video");
const videoSrc = (page: Page) => video(page).evaluate((v) => (v as HTMLVideoElement).getAttribute("src") ?? "");
/** Playing, by the class refresh.ts sets on `playing` or by the element itself. */
const playing = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>(".hero video.hero-video")!;
    return document.querySelector(".hero")!.classList.contains("nr-video-on") || !v.paused;
  });
/**
 * The film is attached only after window load plus an idle period (2026-10-11).
 * Resolves after that point: our idle callback is queued behind refresh.ts's, so a
 * test that asserts "no source" after this is asserting it past the deferral.
 */
const filmSettled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const idle = () => requestIdleCallback(() => setTimeout(resolve, 100), { timeout: 4000 });
        if (document.readyState === "complete") idle();
        else addEventListener("load", idle, { once: true });
      }),
  );

test.describe("hero film", () => {
  test("hero video attaches source and plays (desktop: 1080p)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await open(page, 1440);
    await expect.poll(() => videoSrc(page), { timeout: 5000 }).toMatch(/\/video\/hero-1080\.mp4$/);
    await expect.poll(() => playing(page), { timeout: 5000 }).toBe(true);
    await expect(page.locator(".hero")).toHaveClass(/nr-video-on/, { timeout: 5000 });
    await expect(video(page)).toHaveCSS("opacity", "1", { timeout: 3000 });
    expect(errors).toEqual([]);
  });

  test("both films are served by the Worker as static assets, whole", async ({ page }) => {
    for (const file of ["hero-1080.mp4", "hero-720.mp4"]) {
      const res = await page.request.get(`/video/${file}`);
      expect(res.status(), file).toBe(200);
      expect(res.headers()["content-type"], file).toContain("video/mp4");
      expect((await res.body()).length, file).toBe(statSync(`${VIDEO_DIR}${file}`).size);
    }
  });

  test("a 390px phone gets the 720p file", async ({ page }) => {
    await open(page, 390, 844);
    await expect.poll(() => videoSrc(page), { timeout: 5000 }).toMatch(/\/video\/hero-720\.mp4$/);
  });

  test("the film waits for window load: no source while an eager image is still loading", async ({ page }) => {
    // Hold one eager team portrait for 2.5 s, so boot() has long run but load has not fired.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/images\/staff\/[a-z-]+-(480|800)\.webp$/, async (route) => {
      await Promise.race([held, new Promise((r) => setTimeout(r, 2500))]);
      await route.continue();
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.classList.contains("nr"));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.readyState)).not.toBe("complete");
    expect(await videoSrc(page)).toBe("");
    release();
    await filmSettled(page);
    await expect.poll(() => videoSrc(page), { timeout: 5000 }).toMatch(/\/video\/hero-1080\.mp4$/);
  });

  for (const effectiveType of ["2g", "slow-2g"]) {
    test(`a ${effectiveType} connection: no source is attached and the poster stays the plate`, async ({ page }) => {
      await page.addInitScript((type) => {
        Object.defineProperty(navigator, "connection", { configurable: true, get: () => ({ saveData: false, effectiveType: type }) });
      }, effectiveType);
      await open(page, 1440);
      await filmSettled(page);
      expect(await videoSrc(page)).toBe("");
      await expect(page.locator(".hero")).toHaveClass(/nr-video-off/);
      await expect(page.locator(".hero")).not.toHaveClass(/nr-video-on/);
      await expect(video(page)).toHaveCSS("opacity", "1", { timeout: 3000 });
    });
  }

  test("without requestIdleCallback (Safari) the film attaches on the 1.5 s timer after load", async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error — removing the API is the point
      delete window.requestIdleCallback;
    });
    await open(page, 1440);
    await page.waitForLoadState("load");
    expect(await page.evaluate(() => typeof window.requestIdleCallback)).toBe("undefined");
    expect(await videoSrc(page)).toBe("");
    await expect.poll(() => videoSrc(page), { timeout: 4000 }).toMatch(/\/video\/hero-1080\.mp4$/);
  });

  test("a 4g connection still gets the film", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { configurable: true, get: () => ({ saveData: false, effectiveType: "4g" }) });
    });
    await open(page, 1440);
    await expect.poll(() => videoSrc(page), { timeout: 5000 }).toMatch(/\/video\/hero-1080\.mp4$/);
  });

  test("the decoder pauses once the hero leaves the viewport and resumes when it returns", async ({ page }) => {
    await open(page, 1440);
    await expect.poll(() => playing(page), { timeout: 5000 }).toBe(true);
    const heroH = await page.locator(".hero").evaluate((el) => (el as HTMLElement).offsetHeight);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), heroH * 2 + 200);
    await expect.poll(() => video(page).evaluate((v) => (v as HTMLVideoElement).paused), { timeout: 4000 }).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(() => video(page).evaluate((v) => (v as HTMLVideoElement).paused), { timeout: 4000 }).toBe(false);
  });

  test("Save-Data: no source is attached and the poster stays the plate", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { configurable: true, get: () => ({ saveData: true }) });
    });
    await open(page, 1440);
    await filmSettled(page);
    expect(await videoSrc(page)).toBe("");
    await expect(page.locator(".hero")).toHaveClass(/nr-video-off/);
    await expect(page.locator(".hero")).not.toHaveClass(/nr-video-on/);
    await expect(video(page)).toHaveCSS("opacity", "1", { timeout: 3000 });
  });

  test("an empty data-src skips the film: no source, poster stays", async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/",
      async (route) => {
        const response = await route.fetch();
        const body = (await response.text()).replace(/data-src-hd="[^"]*"/, 'data-src-hd=""');
        await route.fulfill({ response, body });
      },
    );
    await open(page, 1440);
    await filmSettled(page);
    expect(await videoSrc(page)).toBe("");
    await expect(page.locator(".hero")).toHaveClass(/nr-video-off/);
    await expect(video(page)).toHaveCSS("opacity", "1", { timeout: 3000 });
  });

  test("a refused play() leaves the poster as the plate, with no error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("autoplay refused", "NotAllowedError"));
    });
    await open(page, 1440);
    await expect.poll(() => videoSrc(page), { timeout: 5000 }).toMatch(/hero-1080\.mp4$/);
    await expect(page.locator(".hero")).toHaveClass(/nr-video-off/);
    await expect(page.locator(".hero")).not.toHaveClass(/nr-video-on/);
    await expect(video(page)).toHaveAttribute("poster", "/video/hero-poster.jpg");
    await expect(video(page)).toHaveCSS("opacity", "1", { timeout: 3000 });
    expect(errors).toEqual([]);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("no motion layer, no clones, everything visible", async ({ page }) => {
    await open(page, 1440);
    await expect(page.locator("html")).not.toHaveClass(/nr-motion/);
    // The film never loads: no source, the poster is the plate, fully opaque.
    await filmSettled(page);
    expect(await videoSrc(page)).toBe("");
    await expect(video(page)).toHaveAttribute("poster", "/video/hero-poster.jpg");
    await expect(video(page)).toHaveCSS("opacity", "1");
    await expect(page.locator(".strip-track > .tile")).toHaveCount(5);
    for (const li of await page.locator(".team-grid > li").all()) await expect(li).toHaveCSS("opacity", "1");
    await expect(page.locator(".story h2")).toBeVisible();
  });

  // Project check: the static strip scrolls on the TRACK, so the heading stays put.
  test("the static strip is a scroll-snap row on the track, not the section", async ({ page }) => {
    await open(page, 1440);
    const track = page.locator(".strip-track");
    await expect(track).toHaveCSS("overflow-x", "auto");
    await expect(track).toHaveCSS("scroll-snap-type", "x mandatory");
    await expect(track).not.toHaveClass(/nr-marquee/);
    expect(await track.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const strip = page.locator(".strip");
    expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
});

// ── Project checks ──────────────────────────────────────────────────────────

test.describe("locales", () => {
  test("/en renders the English strip heading, link and owner tags", async ({ page }) => {
    await open(page, 1440, 900, "/en");
    await expect(page.locator("html")).toHaveClass(/\bnr-home\b/);
    await expect(page.locator(".strip-head h2")).toContainText("Hairdresser of the Year 2026");
    await expect(page.locator(".strip-head a")).toHaveAttribute("href", "/en/competitions");
    await expect(page.locator(".role-tag")).toHaveText(["Co-owner", "Co-owner"]);
    await expect(page.locator(".scroll-cue span")).toHaveText("Scroll");
  });
});

test.describe("inner pages", () => {
  for (const path of ["/kontakt", "/en/staff", "/tavlingar"]) {
    test(`${path}: the script runs without a hero, and the header stays sticky glass`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await open(page, 1440, 900, path);
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(400);
      expect(errors).toEqual([]);
      await expect(page.locator("html")).not.toHaveClass(/\bnr-home\b/);
      // No hero, so no film: heroVideo() is never reached.
      await expect(page.locator("video")).toHaveCount(0);
      const header = page.locator(".site-header");
      await expect(header).toHaveCSS("position", "sticky");
      await expect(header).toHaveCSS("background-color", "rgba(255, 255, 255, 0.94)");
      await expect(header).not.toHaveClass(/nr-solid|nr-hide/);
    });
  }
});

test.describe("breakpoint", () => {
  for (const path of ["/", "/en"]) {
    test(`${path}: 1340px is the hamburger, 1341px is the one-line nav, and it fits`, async ({ page }) => {
      await open(page, 1340, 900, path);
      await expect(page.locator(".nav-desktop")).toBeHidden();
      await expect(page.locator(".nav-toggle")).toBeVisible();
      await page.setViewportSize({ width: 1341, height: 900 });
      await expect(page.locator(".nav-desktop")).toBeVisible();
      await expect(page.locator(".nav-toggle")).toBeHidden();
      const fit = await page.evaluate(() => {
        const inner = document.querySelector(".header-inner") as HTMLElement;
        const nav = document.querySelector(".nav-desktop") as HTMLElement;
        const right = document.querySelector(".header-right") as HTMLElement;
        const links = Array.from(document.querySelectorAll(".nav-desktop a")).map((a) => a.getBoundingClientRect().height);
        return {
          overflow: inner.scrollWidth - inner.clientWidth,
          clear: right.getBoundingClientRect().left - nav.getBoundingClientRect().right,
          tallest: Math.max(...links),
        };
      });
      expect(fit.overflow).toBeLessThanOrEqual(0);
      expect(fit.clear).toBeGreaterThanOrEqual(0);
      expect(fit.tallest).toBeLessThan(24);
    });
  }
});

test.describe("no JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the static page is complete: every rendered element present, nothing hidden", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HOME);
    await expect(page.locator("html")).not.toHaveClass(/\bnr\b/);
    await expect(page.locator(".hero .scroll-cue")).toHaveCount(1);
    await expect(page.locator(".strip-head")).toHaveCount(1);
    await expect(page.locator(".strip-track > .tile")).toHaveCount(5);
    const caps = await page.$$eval(".strip .cap", (cs) => cs.map((c) => (c as HTMLElement).dataset.n));
    expect(caps).toEqual(["01", "02", "03", "04", "05"]);
    await expect(page.locator(".role-tag")).toHaveCount(2);
    await expect(page.locator(".site-header")).toHaveCSS("position", "sticky");
    for (const li of await page.locator(".team-grid > li").all()) await expect(li).toHaveCSS("opacity", "1");
    await expect(page.locator(".hero-soft")).toHaveCSS("opacity", "1");
    // No JS, no film: the poster is the plate.
    expect(await page.locator(".hero video").getAttribute("src")).toBeNull();
    await expect(page.locator(".hero video")).toHaveCSS("opacity", "1");
    expect(await teamRows(page)).toEqual([2, 5, 5, 5]);
  });
});

test.describe("header states", () => {
  test("hides reading down, returns reading up, and returns when focus enters it", async ({ page }) => {
    await open(page, 1440);
    const header = page.locator(".site-header");
    const heroH = await page.locator(".hero").evaluate((el) => (el as HTMLElement).offsetHeight);
    await page.evaluate((y) => window.scrollTo(0, y), heroH + 300);
    await page.waitForTimeout(150);
    await page.evaluate((y) => window.scrollTo(0, y), heroH + 900);
    await expect(header).toHaveClass(/nr-hide/);
    await page.evaluate((y) => window.scrollTo(0, y), heroH + 400);
    await expect(header).not.toHaveClass(/nr-hide/);
    await page.evaluate((y) => window.scrollTo(0, y), heroH + 1200);
    await expect(header).toHaveClass(/nr-hide/);
    await page.locator(".site-header .logo").focus();
    await expect(header).not.toHaveClass(/nr-hide/);
  });
});

test.describe("anchors and Lenis", () => {
  test("the skip link is never routed through Lenis: it lands on #main natively", async ({ page }) => {
    await open(page, 1440);
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#main");
  });

  test("an in-page link with a target glides via Lenis; one without a target is left to the browser", async ({ page }) => {
    await open(page, 1440);
    await page.evaluate(() => {
      for (const [id, href] of [["t-ok", "#main"], ["t-missing", "#nowhere"]]) {
        const a = document.createElement("a");
        a.id = id!;
        a.href = href!;
        a.textContent = id!;
        a.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:999;background:#fff;padding:8px";
        if (id === "t-missing") a.style.left = "120px";
        document.body.appendChild(a);
      }
    });
    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.waitForTimeout(300);
    await page.locator("#t-ok").click();
    // Prevented default: the hash does not change, and Lenis scrolls up over ~1.4s.
    expect(await page.evaluate(() => location.hash)).toBe("");
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 4000 }).toBeLessThan(5);
    await page.locator("#t-missing").click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#nowhere");
  });

  test("the wheel cannot scroll the page under the open menu; it can again once closed", async ({ page }) => {
    await open(page, 1200);
    await page.locator(".nav-toggle").click();
    await expect(page.locator("html")).toHaveClass(/lenis-stopped/);
    await page.mouse.move(600, 600);
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("html")).not.toHaveClass(/lenis-stopped/);
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 4000 }).toBeGreaterThan(100);
  });
});

test.describe("touch", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("tablet (hover: none): the first tap slides the bio up instead of navigating", async ({ page }) => {
    await open(page, 900, 1200);
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
    const card = page.locator(".team-grid > li.owner .team-card").first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    await card.tap();
    await expect(card).toHaveClass(/is-revealed/);
    await expect(card.locator(".bio")).toHaveCSS("opacity", "1");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("phone (≤699px): the bio is hidden, so the first tap navigates", async ({ page }) => {
    await open(page, 390, 844);
    await expect(page.locator(".team-card .bio").first()).toHaveCSS("display", "none");
    const card = page.locator(".team-grid > li .team-card").nth(3);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1600);
    await card.tap();
    await expect(page).toHaveURL(/\/personal$/);
  });
});

// ── Screenshots (review artefacts, gitignored) ─────────────────────────────

test.describe("screenshots", () => {
  test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

  for (const [locale, path] of [["sv", "/"], ["en", "/en"]] as const) {
    for (const width of [1440, 390]) {
      test(`${locale} @ ${width}: hero, awards, team`, async ({ page }) => {
        await open(page, width, width === 390 ? 844 : 900, path);
        await page.waitForTimeout(2600); // the hero intro
        await page.screenshot({ path: `${SHOTS}${locale}-${width}-hero.png` });
        for (const section of ["strip", "team"] as const) {
          const el = page.locator(`section.${section}`);
          // Walk the section through the viewport from its top, the way a reader
          // would, so every reveal fires. (scrollIntoViewIfNeeded CENTRES a section
          // taller than the viewport, and its top never intersects.)
          const [top, h] = await el.evaluate((node) => {
            const r = node.getBoundingClientRect();
            return [r.top + scrollY, r.height];
          });
          for (let y = top - 200; y < top + h; y += 300) {
            await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
            await page.waitForTimeout(120);
          }
          await expect(el.locator(".nr-r:not(.nr-in), .nr-split:not(.nr-in)")).toHaveCount(0);
          await page.waitForFunction(
            (sel) => Array.from(document.querySelectorAll<HTMLImageElement>(`${sel} img:not([alt=""])`)).every((i) => i.complete),
            `section.${section}`,
          );
          await page.waitForTimeout(1600); // the last reveals land
          // The fixed header would be painted wherever the viewport sat mid-capture.
          await el.screenshot({
            path: `${SHOTS}${locale}-${width}-${section === "strip" ? "awards" : "team"}.png`,
            style: ".site-header { visibility: hidden; }",
          });
        }
      });
    }
  }

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("sv @ 1440: hero, reduced motion", async ({ page }) => {
      await open(page, 1440);
      await page.screenshot({ path: `${SHOTS}sv-1440-hero-reduced-motion.png` });
    });
  });
});
