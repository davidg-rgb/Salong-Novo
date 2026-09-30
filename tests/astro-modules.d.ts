/**
 * Plain `tsc` cannot read `.astro` files — Astro 7 types them through its own
 * language server (`astro check`), not through an ambient declaration. The
 * render tests (`tests/keune-render.test.ts`) import components to hand to the
 * Container API, which only needs an opaque component factory, so this is all
 * `npm run typecheck` has to know. `astro check` resolves the real files and is
 * unaffected by a wildcard it never falls back to.
 */
declare module "*.astro" {
  const component: import("astro/runtime/server/index.js").AstroComponentFactory;
  export default component;
}
