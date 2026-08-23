import type { APIRoute } from "astro";
import { siteNoindex } from "../lib/seo";

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "https://salongnovo.se").replace(/\/$/, "");
  // A staging build refuses every crawler outright — and publishes NO sitemap,
  // because pointing a bot at a list of URLs it was just told not to fetch is
  // the one thing that would still get the copy discovered.
  const body = siteNoindex()
    ? ["User-agent: *", "Disallow: /", ""].join("\n")
    : [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /api/",
        "",
        `Sitemap: ${base}/sitemap.xml`,
        "",
      ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
