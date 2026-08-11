import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? "https://salongnovo.se").replace(/\/$/, "");
  const body = [
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
