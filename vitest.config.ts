import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // `fileURLToPath`, never `.pathname` — the vault path contains a space
    // ("Second Brain") and `.pathname` leaves it percent-encoded, which Vite
    // cannot resolve.
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
