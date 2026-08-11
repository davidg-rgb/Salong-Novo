import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, extname } from "node:path";

/**
 * Static gates over the source tree. These are the checks that cannot be a unit
 * test of a function because the thing being guarded is a PROPERTY OF THE
 * REPOSITORY — "no file anywhere does X". Each one has already cost real time
 * once, or would cost an auth bypass the first time it slipped.
 *
 * `fileURLToPath`, never `URL.pathname`: the vault path contains a space.
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const p = (...parts: string[]) => join(ROOT, ...parts);
const read = (file: string) => readFileSync(file, "utf8");
const rel = (file: string) => relative(ROOT, file).replace(/\\/g, "/");

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.includes(extname(full))) out.push(full);
  }
  return out;
}

/** The frontmatter of an `.astro` file, or the whole source of a `.ts` one. */
function moduleSource(file: string): string {
  const source = read(file);
  if (extname(file) !== ".astro") return source;
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? "";
}

/**
 * Is `export const prerender = false` the first STATEMENT — imports and comments
 * aside? Presence alone would let it hide below a route handler, which reads as
 * an afterthought and invites the next editor to move it.
 */
function prerenderIsFirstStatement(source: string): boolean {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^(\/\/|\/\*|\*)/.test(line));

  let inImport = false;
  for (const line of lines) {
    if (inImport) {
      if (/\bfrom\s*["']|["'];?\s*$/.test(line)) inImport = false;
      continue;
    }
    if (/^import\b/.test(line)) {
      // Single-line import, or the opening of a braced multi-line one.
      if (!/\bfrom\s*["']/.test(line) && !/^import\s*["']/.test(line)) inImport = true;
      continue;
    }
    return /^export\s+const\s+prerender\s*=\s*false\s*;?/.test(line);
  }
  return false;
}

const SERVER_DIRS = [p("src", "pages", "admin"), p("src", "pages", "api")];
const PAGE_EXTS = [".astro", ".ts", ".js"];

describe("prerender gate (ADR-02 / P1-C5)", () => {
  const serverFiles = SERVER_DIRS.flatMap((dir) => walk(dir, PAGE_EXTS));

  it("finds the server surface (the gate is not vacuously passing)", () => {
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it("every file under src/pages/admin/** and src/pages/api/** opts out of prerendering", () => {
    // A missed flag is an AUTH BYPASS, not a glitch: the route prerenders to
    // static HTML that Cloudflare Static Assets serves without ever invoking the
    // Worker, so the middleware never runs and the identity gate never executes.
    // On the Vercel share window it becomes public HTML on a client-facing URL.
    const missing = serverFiles.filter((f) => !/export\s+const\s+prerender\s*=\s*false/.test(moduleSource(f)));
    expect(missing.map(rel)).toEqual([]);
  });

  it("the flag is the first statement in each of them, not a footnote", () => {
    const late = serverFiles.filter((f) => !prerenderIsFirstStatement(moduleSource(f)));
    expect(late.map(rel)).toEqual([]);
  });
});

describe("build-time-bindings gate (P2-C1, complement form)", () => {
  /**
   * Prerendering on the Cloudflare target runs INSIDE workerd with LIVE local
   * bindings, so a prerendered page that reads CMS content would bake the
   * developer's local D1 state into the shipped HTML.
   *
   * Stated as the COMPLEMENT — "every file WITHOUT the flag reads no content" —
   * so a page that merely FORGETS the flag cannot slip past by being absent from
   * an allowlist.
   */
  const CONTENT_READS = ["locals.getCms", "locals.db", "loadCollection"];

  it("no prerendered page reads request-time CMS content", () => {
    const pages = walk(p("src", "pages"), PAGE_EXTS);
    const offenders: string[] = [];
    for (const file of pages) {
      const source = read(file);
      if (/export\s+const\s+prerender\s*=\s*false/.test(moduleSource(file))) continue;
      const hits = CONTENT_READS.filter((needle) => source.includes(needle));
      if (hits.length) offenders.push(`${rel(file)} → ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("bindings access (ADR-08)", () => {
  const sources = walk(p("src"), [".ts", ".astro", ".js", ".mjs"]);

  it("nothing in src/ touches locals.runtime — the v14 adapter throws on it", () => {
    // App.Locals deliberately does not extend the adapter's Runtime, so this is
    // also a compile error. The grep catches it in comments and .astro islands
    // that a reader would otherwise trust.
    const offenders = sources.filter((f) => read(f).includes("locals.runtime"));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("nothing in src/ imports cloudflare:workers statically", () => {
    // A static import makes the module unresolvable off Workers and breaks the
    // Vercel bundle at build time. The only legal access is the opaque
    // variable specifier in src/lib/cms/bindings.ts.
    const offenders = sources.filter((f) => /from\s*["']cloudflare:workers["']/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("the opaque specifier lives in exactly one place", () => {
    // Nicole's copy allows a second holder (her pre-CMS enquiry route). This
    // project has no such route, so the rule is the strict form.
    const holders = sources
      .filter((f) => /["']cloudflare:workers["']/.test(read(f)))
      .map(rel)
      .sort();
    expect(holders).toEqual(["src/lib/cms/bindings.ts"]);
  });
});

describe("local D1 store — one store for migrations and for workerd", () => {
  /**
   * ESTABLISHED FACT, verified empirically during architecture review — do not
   * re-investigate, just keep it true: `wrangler d1 migrations apply --local`
   * and the workerd instance behind `astro dev` / a Cloudflare-target build read
   * the SAME `.wrangler/state/v3/d1` store. They agree because BOTH sides use
   * wrangler's default persistence root; the sqlite file is hash-named off the
   * database identity, which is why "is that my data?" is not answerable by
   * looking at the filename.
   *
   * The regression is therefore a CONFIG drift — someone redirects one side's
   * persistence and not the other, or renames the database. That is what these
   * assert. A migration that appears to succeed against a store the dev server
   * never reads costs an afternoon.
   */
  const pkg = JSON.parse(read(p("package.json"))) as { scripts: Record<string, string> };
  const wrangler = read(p("wrangler.toml"));
  const astroConfig = read(p("astro.config.mjs"));

  const DEFAULT_PERSIST = ".wrangler/state";

  it("the migrate script targets the database wrangler.toml declares", () => {
    const declared = wrangler.match(/database_name\s*=\s*"([^"]+)"/)?.[1];
    expect(declared).toBe("novo_db");
    expect(pkg.scripts["db:migrate:local"]).toContain(declared!);
    expect(pkg.scripts["db:migrate:local"]).toContain("--local");
  });

  it("no script redirects persistence away from the default root", () => {
    for (const [name, script] of Object.entries(pkg.scripts)) {
      const persist = script.match(/--persist-to[= ]([^\s]+)/)?.[1];
      if (persist) expect(persist, `${name} persists elsewhere`).toBe(DEFAULT_PERSIST);
    }
  });

  it("the migrate script does not pin its own persist root", () => {
    // It must inherit the default, which is what makes it agree with the Vite
    // plugin's workerd without either side naming a path.
    expect(pkg.scripts["db:migrate:local"]).not.toContain("--persist-to");
  });

  it("astro.config.mjs declares no platformProxy — v13-era, and a second persist root", () => {
    // Comment-stripped: the config explains at length WHY the option is absent,
    // and that explanation is the reason nobody re-adds it.
    const code = astroConfig
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("platformProxy");
  });
});

describe("shipped output", () => {
  it("a Cloudflare build emits no static admin HTML", () => {
    // Conditional on a build having run: this is the last line of defense behind
    // the prerender gate, and it checks the artifact rather than the source.
    const clientDir = p("dist", "client");
    if (!existsSync(clientDir)) return;
    expect(existsSync(join(clientDir, "admin"))).toBe(false);
  });

  it("robots.txt still disallows the admin surface", () => {
    const robots = read(p("src", "pages", "robots.txt.ts"));
    expect(robots).toContain("/admin");
    expect(robots).toContain("/api/");
  });
});
