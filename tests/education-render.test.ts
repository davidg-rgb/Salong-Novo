import { describe, it, expect, beforeAll } from "vitest";
import { experimental_AstroContainer } from "astro/container";
import EducationSv from "~/pages/utbildning-och-kurser.astro";
import EducationEn from "~/pages/en/education.astro";

/**
 * The education pages carry NO closing "Boka tid" (client, 2026-10-10): beside a
 * course list the salon's booking button reads as "book a course", and courses
 * are booked by email. Rendered through the Container API like the shop pages,
 * so the assertion is on the HTML the visitor gets, not on a prop.
 */
const locals = { db: null, getCms: async () => ({ kv: null, source: "fallback" as const }) };
let container: experimental_AstroContainer;
beforeAll(async () => {
  container = await experimental_AstroContainer.create();
});

const renderPage = (page: unknown, path: string) =>
  container.renderToString(page as never, {
    locals: locals as never,
    request: new Request(`https://salongnovo.se${path}`),
  });

describe("the education pages, rendered", () => {
  it.each([
    [EducationSv, "/utbildning-och-kurser", "Boka tid"],
    [EducationEn, "/en/education", "Book now"],
  ])("%s has no closing booking button", async (page, path, label) => {
    const html = await renderPage(page, path);
    const article = html.slice(html.indexOf('<section class="article'), html.indexOf("</section>", html.indexOf('<section class="article')));
    expect(article.length).toBeGreaterThan(0);
    expect(article).not.toContain("data-booking");
    expect(article).not.toContain(`>${label}<`);
    // The header's own booking button is untouched: it is the site-wide CTA.
    expect(html).toContain("data-booking");
  });
});
