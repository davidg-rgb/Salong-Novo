/**
 * Inner-page motion — browser acceptance (2026-10-11).
 *
 * The inner pages open with a masthead (kicker wipe, h1 word masks, lead) and then
 * reveal ONE object per page with the home's .nr-r / .nr-img at the inner-page speed
 * motion.css sets on <main>. These checks pin the paths that are not the happy one:
 * reduced motion, no JS, a 360px phone, a one-column grid, an element below the fold
 * at boot, fonts that never settle, an unsized blog cover — and that the home page's
 * reveal still computes exactly as before.
 *
 *   npm run e2e    (builds, serves the Worker on :4321, runs Chromium)
 */
import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, path: string, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.waitForFunction(() => document.documentElement.classList.contains("nr"));
}

const delays = (page: Page, selector: string) =>
  page.$$eval(selector, (els) => els.map((el) => parseInt((el as HTMLElement).style.getPropertyValue("--d"), 10)));

/** Scroll every match into view in turn, so each crosses the observer's threshold. */
async function scrollThrough(page: Page, selector: string) {
  const n = await page.locator(selector).count();
  for (let i = 0; i < n; i++) {
    await page.locator(selector).nth(i).evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(40);
  }
}

test.describe("masthead and object, with motion", () => {
  test("/personal: masthead goes, h1 is word-masked, every portrait reveals", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await open(page, "/personal");
    const mast = page.locator(".staff-page .shead");
    await expect(mast).toHaveClass(/\bnr-mast\b/);
    await expect(mast).toHaveClass(/\bnr-go\b/, { timeout: 1500 });
    expect(await page.locator(".shead h1 .nr-w > span").count()).toBeGreaterThan(0);
    await expect(page.locator(".shead .kicker")).toHaveClass(/\bnr-kick\b/);
    await expect(page.locator(".shead .intro")).toHaveClass(/\bnr-lead\b/);
    // Masthead h1 is started by .nr-go, never by the scroll observer.
    await expect(page.locator(".shead h1")).toHaveClass(/\bnr-in\b/);
    await scrollThrough(page, ".staff-grid > li");
    const lis = page.locator(".staff-grid > li");
    const n = await lis.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await expect(lis.nth(i)).toHaveClass(/\bnr-in\b/);
    expect(errors).toEqual([]);
  });

  test("/personal 1440: columns come from the computed grid; below the fold has no base", async ({ page }) => {
    await open(page, "/personal");
    const cols = await page.locator(".staff-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
    expect(cols).toBe(4);
    const d = await delays(page, ".staff-grid > li");
    // First row is inside the first viewport: base 560 + column × 70.
    expect(d.slice(0, 4)).toEqual([560, 630, 700, 770]);
    // The last row is below the fold at boot: column × 70 only.
    const last = d[d.length - 1]!;
    expect(last).toBeLessThan(560);
    expect(last % 70).toBe(0);
  });

  test("/varumarken 390: a one-column grid gets no column stagger", async ({ page }) => {
    await open(page, "/varumarken", 390, 844);
    const cols = await page.locator(".brand-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
    expect(cols).toBe(1);
    const d = await delays(page, ".brand-grid > .brand");
    expect(d.length).toBeGreaterThan(1);
    for (const v of d) expect([0, 560]).toContain(v);
  });

  test("/tavlingar: the year marks rise through word masks; the shots clip in", async ({ page }) => {
    await open(page, "/tavlingar");
    await expect(page.locator(".competitions .shead")).toHaveClass(/\bnr-go\b/, { timeout: 1500 });
    const marks = page.locator(".year-mark");
    expect(await marks.count()).toBeGreaterThan(0);
    await expect(marks.first()).toHaveClass(/\bnr-split\b/);
    await expect(page.locator(".shots > li").first()).toHaveClass(/\bnr-img\b/);
    await scrollThrough(page, ".year-mark");
    for (const m of await marks.all()) await expect(m).toHaveClass(/\bnr-in\b/);
    const dur = await page.locator(".year-mark .nr-w > span").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(dur).toBe("0.82s");
  });

  test("/kontakt: the map clips in after the masthead, the details follow at 60ms", async ({ page }) => {
    await open(page, "/kontakt");
    await expect(page.locator(".contact .map")).toHaveClass(/\bnr-img\b/);
    // Rolling: the visible details follow the masthead 60ms apart; the cancellation
    // note sits below a 900px fold, so it waits for the scroll instead (base 0).
    expect(await delays(page, ".info > address, .info > .dir, .info > .reach, .info > .btn, .info > .cancel")).toEqual([560, 620, 680, 740, 0]);
    await expect(page.locator(".contact .map")).toHaveClass(/\bnr-in\b/, { timeout: 3000 });
    // The revealed button keeps its hover fade beside the reveal.
    const t = await page.locator(".info > .btn").evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(t).toBe("opacity, transform, background-color, border-color");
  });

  test("the masthead still goes when the fonts never settle (900ms cap)", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(FontFaceSet.prototype, "ready", { configurable: true, get: () => new Promise(() => {}) });
    });
    await open(page, "/personal");
    await expect(page.locator(".shead")).toHaveClass(/\bnr-go\b/, { timeout: 1500 });
  });

  test("the staff modal opens with its keyframes and closes at once", async ({ page }) => {
    await open(page, "/personal");
    await page.locator(".staff-card").first().click();
    await expect(page.locator(".staff-modal")).toHaveClass(/\bopen\b/);
    await expect(page.locator(".sm-card")).toHaveCSS("animation-name", "nr-card");
    await expect(page.locator(".sm-bg")).toHaveCSS("animation-name", "nr-fade");
    await page.keyboard.press("Escape");
    await expect(page.locator(".staff-modal")).toBeHidden();
  });
});

test.describe("early paint", () => {
  test("/personal: html.nr-motion is set at DOMContentLoaded, with no console error or CSP violation", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[]; __dcl: string };
      w.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(e.violatedDirective));
      document.addEventListener("DOMContentLoaded", () => (w.__dcl = document.documentElement.className));
    });
    await page.goto("/personal", { waitUntil: "domcontentloaded" });
    const seen = await page.evaluate(() => (window as unknown as { __dcl: string }).__dcl);
    expect(seen).toMatch(/\bnr-motion\b/);
    await page.waitForFunction(() => document.documentElement.classList.contains("nr"));
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the head script alone sets nr-motion; if the module never runs, <main> still shows at 2.5s", async ({ page }) => {
    // Block the bundled module: whatever is on <html> now came from the inline script.
    await page.route(/\/_astro\/.*\.js$/, (route) => route.abort());
    await page.goto("/personal", { waitUntil: "domcontentloaded" });
    const cls = await page.evaluate(() => document.documentElement.className);
    expect(cls).toMatch(/\bnr-motion\b/);
    expect(cls.split(/\s+/)).not.toContain("nr");
    await expect(page.locator("main")).toHaveCSS("opacity", "0");
    await expect(page.locator("main")).toHaveCSS("opacity", "1", { timeout: 4000 });
    await expect(page.locator(".shead h1")).toBeVisible();
  });
});

test.describe("the home page's reveal is unchanged", () => {
  test("home .nr-r computes 1.1s / 1.3s and 28px; inner main 0.55s / 0.65s and 18px; the footer keeps the home's", async ({ page }) => {
    await page.route(/\/video\/hero-(?:1080|720)\.mp4$/, (route) => route.abort());
    await open(page, "/");
    // The home's cards are marked after first paint, so they transition INTO the held
    // state (pre-existing, unchanged); read them once that has settled.
    await page.waitForTimeout(2500);
    const home = await page.locator(".team-grid > li").last().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { dur: cs.transitionDuration, ty: new DOMMatrix(cs.transform).m42, cls: el.className };
    });
    expect(home.cls).toContain("nr-r");
    expect(home.cls).not.toContain("nr-in");
    expect(home.dur).toBe("1.1s, 1.3s");
    expect(home.ty).toBe(28);

    await open(page, "/personal");
    const inner = await page.locator(".staff-grid > li").last().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { dur: cs.transitionDuration, ty: new DOMMatrix(cs.transform).m42 };
    });
    expect(inner).toEqual({ dur: "0.55s, 0.65s", ty: 18 });
    const foot = await page.locator(".site-footer .foot > *").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(foot).toBe("1.1s, 1.3s");
  });
});

test.describe("360px phone", () => {
  test("/integritet: the h1 is not word-masked and rises as one block", async ({ page }) => {
    await open(page, "/integritet", 360, 740);
    const h1 = page.locator(".article h1");
    expect(await h1.locator(".nr-w").count()).toBe(0);
    await expect(h1).toHaveClass(/\bnr-lead\b/);
    await expect(page.locator(".article")).toHaveClass(/\bnr-go\b/, { timeout: 1500 });
    await expect(h1).toHaveCSS("opacity", "1", { timeout: 2500 });
    expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });
});

test.describe("blog cover", () => {
  // No post is guaranteed in the local database, so the post markup is served over a
  // real inner page: the script decides from the <img> it finds at boot.
  for (const [name, src, expected] of [
    ["an unsized, unloaded cover gets no clip", "/__missing-cover.jpg", false],
    ["a cover that already has a height is clipped in", "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", true],
  ] as const) {
    test(name, async ({ page }) => {
      await page.route(
        (url) => url.pathname === "/integritet",
        async (route) => {
          const response = await route.fetch();
          const html = await response.text();
          const post = `<main id="main"><article class="post wrap"><h1>Ett inlägg</h1><figure class="cover"><img src="${src}" alt=""></figure><div class="body"><p>Text.</p></div></article></main>`;
          await route.fulfill({ response, body: html.replace(/<main[\s\S]*?<\/main>/, post) });
        },
      );
      await open(page, "/integritet");
      const cover = page.locator(".post .cover");
      if (expected) await expect(cover).toHaveClass(/\bnr-img\b/);
      else await expect(cover).not.toHaveClass(/\bnr-img\b/);
      await expect(page.locator(".post")).toHaveClass(/\bnr-go\b/, { timeout: 1500 });
    });
  }
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  for (const [path, object] of [
    ["/personal", ".staff-grid > li"],
    ["/tavlingar", ".year-mark, .shots > li"],
    ["/kontakt", ".contact .map, .info > *"],
  ] as const) {
    test(`${path}: nothing is held, offset or clipped`, async ({ page }) => {
      await open(page, path);
      await expect(page.locator("html")).not.toHaveClass(/nr-motion/);
      await expect(page.locator(".nr-mast")).toHaveCount(0);
      const bad = await page.$$eval(`main .kicker, main h1, main .intro, ${object}`, (els) =>
        els
          .map((el) => {
            const cs = getComputedStyle(el);
            return { el: el.className, op: cs.opacity, clip: cs.clipPath, tf: cs.transform };
          })
          .filter((s) => s.op !== "1" || s.clip !== "none" || s.tf !== "none"),
      );
      expect(bad).toEqual([]);
      await expect(page.locator("main")).toHaveCSS("opacity", "1");
    });
  }
});

test.describe("no JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("/personal: no nr- classes anywhere, everything visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/personal");
    const withNr = await page.$$eval("*", (els) => els.filter((el) => /\bnr(-|\b)/.test(el.getAttribute("class") ?? "")).length);
    expect(withNr).toBe(0);
    await expect(page.locator("main")).toHaveCSS("opacity", "1");
    await expect(page.locator(".shead h1")).toBeVisible();
    await expect(page.locator(".shead .kicker")).toHaveCSS("clip-path", "none");
    for (const li of await page.locator(".staff-grid > li").all()) await expect(li).toHaveCSS("opacity", "1");
  });
});
