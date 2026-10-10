/**
 * happy-dom, but modules transform through Vite's SSR environment (2026-10-10).
 * Vitest's built-in happy-dom environment uses the CLIENT environment, where
 * Astro's Vite plugin will not compile a `.astro` component for the Container
 * API ("NoMatchingRenderer"). tests/editor-dom.test.ts needs both: the real
 * PostEditor markup rendered server-side and a DOM for the client to boot on.
 * Opt in per file: `// @vitest-environment happy-dom-ssr` (aliased in vitest.config.ts).
 */
import { builtinEnvironments, type Environment } from "vitest/runtime";

const env: Environment = {
  ...builtinEnvironments["happy-dom"],
  name: "happy-dom-ssr",
  viteEnvironment: "ssr",
};
export default env;
