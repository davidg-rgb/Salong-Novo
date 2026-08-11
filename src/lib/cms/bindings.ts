/**
 * The single legal doorway to Cloudflare bindings (ARCHITECTURE ADR-08).
 *
 * Lifted from `src/pages/api/enquiry.ts` — that endpoint keeps its own copy on
 * purpose (it predates the CMS and is not part of this surface), but every new
 * module goes through here so the incorrect patterns stay grep-detectable.
 *
 * WHY A VARIABLE SPECIFIER, not a static or literal-dynamic import:
 *
 *   1. `cloudflare:workers` exists only inside the Workers runtime. A static
 *      import makes the module unresolvable for any other target, and the Vercel
 *      share-window build fails outright at bundle time.
 *   2. The specifier has to be opaque to the bundler. A literal string — even in
 *      a dynamic `import("cloudflare:workers")` — still gets analysed and resolved.
 *
 * WHERE IT ACTUALLY RESOLVES (the naive model is wrong — verified by a build
 * spike during architecture review): the import returns a LIVE env anywhere
 * workerd runs, and that includes `astro dev` (the adapter wires
 * `@cloudflare/vite-plugin` into the dev server) AND `astro build` on the
 * Cloudflare target, which prerenders INSIDE workerd against the developer's
 * local `.wrangler/state/v3/d1` store. It returns `{}` only on the Vercel
 * target, in the node test env, and wherever the Vite plugin isn't wired.
 *
 * The consequence is load-bearing: a `prerender = true` route that reads CMS
 * content would bake local dev data into shipped HTML. That is why every file
 * under `src/pages/admin/**` and `src/pages/api/**` opts out of prerendering,
 * and why `tests/build-gates.test.ts` enforces it.
 */
const CF_RUNTIME = "cloudflare:workers";

/**
 * Partial env — callers must null-check every binding they use. Never throws;
 * the ABSENCE of a binding is the error signal, not an exception.
 */
export async function bindings(): Promise<Partial<Env>> {
  try {
    const mod = await import(/* @vite-ignore */ CF_RUNTIME);
    return ((mod as { env?: Partial<Env> }).env ?? {}) as Partial<Env>;
  } catch {
    return {};
  }
}
