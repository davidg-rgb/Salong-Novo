/**
 * Performance pass — browser acceptance (2026-10-11).
 *
 * Self-hosted fonts and WebP <picture>s for the build-shipped photography. These
 * pin what the unit tests cannot see: that no request leaves for Google, that the
 * faces actually load from /fonts, that Chromium picks the WebP, that the staff
 * modal reuses it (and falls back to the JPEG for a photo with no variants), and
 * that the wrapper costs no layout shift.
 *
 *   npm run e2e    (builds, serves the Worker on :4321, runs Chromium)
 */
import { expect, test, type Page } from "@playwright/test";

function watch(page: Page) {
  const google: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) google.push(r.url());
  });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return { google, errors };
}

/** Layout-shift sum (excluding input-driven shifts) once the page has settled. */
async function cls(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let sum = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (!e.hadRecentInput) sum += e.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(sum), 1500);
      }),
  );
}

for (const path of ["/", "/personal"]) {
  test(`${path}: no Google font request, the self-hosted faces load, no console error`, async ({ page }) => {
    const { google, errors } = watch(page);
    const fontResponses: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/fonts/") && r.status() === 200) fontResponses.push(new URL(r.url()).pathname);
    });
    await page.goto(path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px "Playfair Display"'))).toBe(true);
    expect(await page.evaluate(() => document.fonts.check('500 16px "Hanken Grotesk"'))).toBe(true);
    expect(fontResponses).toEqual(expect.arrayContaining(["/fonts/playfair-display-400.woff2", "/fonts/hanken-grotesk-var-300-700.woff2"]));
    expect(google).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${path}: every stylesheet is inline — no CSS request, no stylesheet link`, async ({ page }) => {
    const css: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "stylesheet" || new URL(r.url()).pathname.endsWith(".css")) css.push(r.url());
    });
    await page.goto(path, { waitUntil: "load" });
    expect(css).toEqual([]);
    expect(await page.locator('link[rel="stylesheet"]').count()).toBe(0);
    // The inlined CSS is really applied: the tokens' sans stack is on <body>.
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Hanken Grotesk");
  });
}

test("/personal: the first portrait is the WebP; the 500 serif face is what the names use", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/personal", { waitUntil: "load" });
  const first = page.locator(".staff-grid .portrait").first();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\/images\/staff\/[a-z-]+-(480|800)\.webp$/);
  // The <img> keeps its sizing and priority attributes through the wrapper.
  await expect(first).toHaveAttribute("width", "600");
  await expect(first).toHaveAttribute("height", "800");
  await expect(first).toHaveAttribute("fetchpriority", "high");
  await expect(first).toHaveAttribute("loading", "eager");
  // <picture> adds no box: the portrait still fills its frame exactly.
  const [img, frame] = await Promise.all([first.boundingBox(), page.locator(".staff-grid .frame").first().boundingBox()]);
  expect(img).toEqual(frame);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('500 16px "Playfair Display"'))).toBe(true);
});

test("/personal: the modal reuses the WebP; a card with no variants falls back to the JPEG", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/personal", { waitUntil: "load" });
  const photo = page.locator("#sm-photo");
  await page.locator(".staff-card").first().click();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\.webp$/);
  await page.keyboard.press("Escape");
  // A client upload (an R2 photo) carries no data-photo-webp: the source must be cleared.
  const second = page.locator(".staff-card").nth(1);
  await second.evaluate((el) => el.removeAttribute("data-photo-webp"));
  await second.click();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\/images\/staff\/[a-z-]+\.jpg$/);
  expect(await page.locator("#sm-photo-webp").getAttribute("srcset")).toBeNull();
});

test("/tavlingar and /varumarken: award and brand shots serve WebP", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tavlingar", { waitUntil: "load" });
  const shot = page.locator(".shots img").first();
  await shot.scrollIntoViewIfNeeded();
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\.webp$/);
  await page.goto("/varumarken", { waitUntil: "load" });
  const brand = page.locator(".shot img").first();
  await brand.scrollIntoViewIfNeeded();
  await expect.poll(() => brand.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\.webp$/);
});

for (const width of [390, 1440]) {
  test(`/personal at ${width}: layout shift stays under 0.02`, async ({ page }) => {
    const { errors } = watch(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/personal", { waitUntil: "load" });
    expect(await cls(page)).toBeLessThan(0.02);
    expect(errors).toEqual([]);
  });
}

test.describe("home header class before first paint (desktop CLS)", () => {
  const delayModules = (page: Page) =>
    page.route(/\/_astro\/.*\.js$/, async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });

  test("with the module 600 ms late, the home page does not shift (< 0.01)", async ({ page }) => {
    await delayModules(page);
    await page.setViewportSize({ width: 1350, height: 940 });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.classList.contains("nr"));
    expect(await cls(page)).toBeLessThan(0.01);
  });

  test("the check is real: without data-nr-home the same load shifts the hero", async ({ page }) => {
    await delayModules(page);
    await page.route(
      (url) => url.pathname === "/",
      async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/ data-nr-home(="")?/, "") });
      },
    );
    await page.setViewportSize({ width: 1350, height: 940 });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.classList.contains("nr"));
    expect(await cls(page)).toBeGreaterThan(0.03);
  });

  test("/personal never gets nr-home", async ({ page }) => {
    await page.goto("/personal", { waitUntil: "load" });
    await expect(page.locator("html")).not.toHaveClass(/\bnr-home\b/);
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`home with the module aborted (${reducedMotion}): after the hold the header is the solid glass bar`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.route(/\/_astro\/.*\.js$/, (route) => route.abort());
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/", { waitUntil: "load" });
      const header = page.locator(".site-header");
      await expect(page.locator("html")).toHaveClass(/\bnr-home\b/);
      await expect(page.locator("html")).not.toHaveClass(/(^|\s)nr(\s|$)/);
      await expect(header).toHaveCSS("position", "fixed");
      await expect(header).toHaveCSS("background-color", "rgba(255, 255, 255, 0.94)", { timeout: 4000 });
      // --on-variant #5b5a55 and --ink #1a1a1a: the solid state's colours, not cream.
      await expect(header.locator(".nav-desktop a").first()).toHaveCSS("color", "rgb(91, 90, 85)");
      await expect(header.locator(".lang-current:visible").first()).toHaveCSS("color", "rgb(26, 26, 26)");
      // The keyframe resolves invert(1) -> none as invert(0): the uninverted ink logo.
      await expect(header.locator(".logo svg")).toHaveCSS("filter", /^(none|invert\(0\))$/);
    });
  }

  test("with the module running, the home header is transparent over the hero as before", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.classList.contains("nr"));
    await page.waitForTimeout(2300); // past the hold: the fallback must not have fired
    await expect(page.locator(".site-header")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });
});
