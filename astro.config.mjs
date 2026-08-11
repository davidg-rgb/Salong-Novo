// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// Static-by-default (cheapest/fastest on Cloudflare Pages). Blog + admin + API
// routes opt into server rendering with `export const prerender = false`.
// Locale routing is manual (SV at root, EN under /en) because slugs differ per
// locale (om-oss vs about), which Astro's built-in i18n routing can't express.
export default defineConfig({
  site: "https://salongnovo.se",
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
    platformProxy: { enabled: true },
  }),
  trailingSlash: "never",
  build: { format: "directory" },
});
