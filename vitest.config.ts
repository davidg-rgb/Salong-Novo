/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";

/**
 * Wrapped in Astro's Vite config (2026-09-29) so `.astro` components compile
 * under Vitest — `tests/keune-render.test.ts` renders them through the Container
 * API. `configFile: false` is load-bearing: loading `astro.config.mjs` pulls in
 * the Cloudflare adapter's Vite plugin, which rejects Vitest's SSR environment
 * ("environment options are incompatible with the Cloudflare Vite plugin").
 * Without the adapter the components render in plain Node, which is what the
 * tests want; nothing here affects `astro build`.
 */
export default getViteConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // `fileURLToPath`, never `.pathname` — the vault path contains a space
    // ("Second Brain") and `.pathname` leaves it percent-encoded, which Vite
    // cannot resolve.
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      // `// @vitest-environment happy-dom-ssr` (2026-10-10): Vitest's docblock
      // only takes a bare name (`[\w-]+`) and resolves it as the package
      // `vitest-environment-<name>`; this alias is that package. See the file.
      "vitest-environment-happy-dom-ssr": fileURLToPath(new URL("./tests/helpers/happy-dom-ssr.ts", import.meta.url)),
    },
  },
}, { configFile: false });
