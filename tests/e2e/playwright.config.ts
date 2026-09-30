import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * The home refresh's browser suite (2026-09-30): the Desktop-Claude kit's 15
 * acceptance checks adapted to our class names, plus the project's own checks
 * (inner pages, no-JS, anchors, the menu and Lenis, the 1340px breakpoint).
 *
 * `npm run e2e` builds and serves the Worker — `npm run preview` is `astro build`
 * then `wrangler dev` — unless something already answers on the port, in which
 * case that server is reused and NOTHING is rebuilt: wrangler dev holds dist/, so
 * a build must never run while it is up. `--port` is passed explicitly because
 * wrangler's own default is 8787. BASE_URL points the suite at any other server
 * and skips the local one.
 *
 * Kept out of Vitest by name: vitest.config.ts includes `*.test.ts` only.
 */
const PORT = 4321;
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: fileURLToPath(new URL("../../test-results", import.meta.url)),
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --port ${PORT}`,
        url: BASE_URL,
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        reuseExistingServer: true,
        timeout: 240_000,
      },
});
