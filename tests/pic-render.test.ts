import { describe, it, expect, beforeAll } from "vitest";
import { experimental_AstroContainer } from "astro/container";
import Pic from "~/components/Pic.astro";
import StaffGrid from "~/components/StaffGrid.astro";

/**
 * <Pic> and its callers as RENDERED HTML (2026-10-11 performance pass): the
 * <picture> branch for a shipped JPEG, the bare-<img> branch for anything the
 * variant manifest does not know, and every attribute passed through untouched.
 */
let container: experimental_AstroContainer;
beforeAll(async () => {
  container = await experimental_AstroContainer.create();
});

const render = (props: Record<string, unknown>) => container.renderToString(Pic as never, { props });
const locals = { db: null, getCms: async () => ({ kv: null, source: "fallback" as const }) };

describe("Pic", () => {
  it("a shipped JPEG becomes <picture> with a WebP source; the img keeps every attribute", async () => {
    const html = await render({
      src: "/images/staff/chriss-berner.jpg",
      sizes: "(max-width: 680px) 50vw, 270px",
      class: "portrait",
      alt: "Chriss Berner",
      width: "600",
      height: "800",
      loading: "eager",
      fetchpriority: "high",
      decoding: "async",
    });
    expect(html).toMatch(/^<picture><source type="image\/webp" srcset="\/images\/staff\/chriss-berner-480\.webp 480w, \/images\/staff\/chriss-berner-800\.webp 800w" sizes="\(max-width: 680px\) 50vw, 270px"><img /);
    const img = html.match(/<img [^>]*>/)![0];
    for (const attr of ['src="/images/staff/chriss-berner.jpg"', 'class="portrait"', 'alt="Chriss Berner"', 'width="600"', 'height="800"', 'loading="eager"', 'fetchpriority="high"', 'decoding="async"']) {
      expect(img).toContain(attr);
    }
    expect(img).not.toContain("sizes=");
  });

  it("an R2 upload, a PNG and an unknown path render the bare <img>, as before", async () => {
    for (const src of ["https://img.salongnovo.se/staff/new.jpg", "/images/brands/keune.png", "/images/staff/nobody.jpg"]) {
      const html = await render({ src, sizes: "100vw", alt: "", loading: "lazy" });
      expect(html).not.toContain("<picture");
      expect(html).not.toContain("<source");
      expect(html).toContain(`<img src="${src}"`);
      expect(html).toContain('loading="lazy"');
    }
  });

  it("an absent src renders an <img> with no src (the old `src={null}` output)", async () => {
    const html = await render({ src: null, sizes: "100vw", alt: "" });
    expect(html).not.toContain("<picture");
    expect(html).toMatch(/^<img alt(="")?>$/);
  });
});

describe("StaffGrid — the modal gets the grid's WebP srcset", () => {
  it("every shipped portrait card carries data-photo-webp; the modal has an empty WebP source", async () => {
    const html = await container.renderToString(StaffGrid as never, { props: { locale: "sv" }, locals: locals as never });
    const cards = [...html.matchAll(/<button class="staff-card"[^>]*>/g)].map((m) => m[0]);
    expect(cards.length).toBe(17);
    for (const card of cards) expect(card).toMatch(/data-photo-webp="\/images\/staff\/[a-z-]+-480\.webp 480w, \/images\/staff\/[a-z-]+-800\.webp 800w"/);
    expect(html).toMatch(/<picture[^>]*><source id="sm-photo-webp" type="image\/webp" sizes="[^"]+"[^>]*><img class="sm-photo" id="sm-photo"/);
    expect(html.match(/<source id="sm-photo-webp"[^>]*>/)![0]).not.toContain("srcset");
  });
});
