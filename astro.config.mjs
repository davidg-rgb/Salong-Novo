// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// Static-by-default (cheapest/fastest). Blog + admin + API routes opt into server
// rendering with `export const prerender = false`.
//
// The target is Cloudflare **Workers** (with Static Assets), NOT Pages:
// @astrojs/cloudflare v14 dropped the Pages target, so wrangler.toml is a Workers
// config — no `pages_build_output_dir`, and no `platformProxy` option here. That was
// a v13-era switch; local bindings now come from the Cloudflare Vite plugin reading
// wrangler.toml directly, which is why `astro dev` reaches real local D1/R2.
//
// Locale routing is manual (SV at root, EN under /en) because slugs differ per
// locale (om-oss vs about), which Astro's built-in i18n routing can't express.
export default defineConfig({
  site: "https://salongnovo.se",
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),
  trailingSlash: "never",
  // Every stylesheet ships inside the HTML (2026-10-11, performance pass). The pages are
  // SSR and the HTML is never cached, so the document is a fresh request anyway, and the
  // two render-blocking CSS round trips (Base + the page's own) were ~0.7 s of mobile
  // FCP. Measured: the largest page (/) inlines ~31 KB raw (Base 16.5 + Home 15.1), well
  // under the ~60 KB where "auto" would be the better call. The admin's CSP (_headers and
  // cms/http.ts) already allows inline styles: style-src 'self' 'unsafe-inline'.
  build: { format: "directory", inlineStylesheets: "always" },
  // Astro sessions are OFF. Admin auth is a Cloudflare Access JWT, so nothing
  // here uses a session — but @astrojs/cloudflare wants a KV namespace bound as
  // SESSION and auto-provisions an unused one at deploy unless told otherwise.
  // A boolean is only accepted on astro >= 7.2.0 + @astrojs/cloudflare >= 14.2.0
  // (below that it fails config validation with `Expected type "object"`).
  // RUNBOOK §5 step 10.
  session: false,
});
