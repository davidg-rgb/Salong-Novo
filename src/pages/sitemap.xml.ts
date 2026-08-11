import type { APIRoute } from "astro";
import { LOCALES, ROUTES, localizePath, type PageKey } from "../i18n";

/** Static sitemap of the fixed pages in both locales. Blog post URLs are
 *  added at request time by a future dynamic sitemap once posts exist. */
export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "https://salongnovo.se").replace(/\/$/, "");
  const keys = Object.keys(ROUTES) as PageKey[];
  const urls: string[] = [];
  for (const key of keys) {
    for (const locale of LOCALES) {
      urls.push(`${base}${localizePath(key, locale)}`);
    }
  }
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
