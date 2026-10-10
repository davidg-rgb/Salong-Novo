import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * WCAG 2.2 AA pin for the admin blog theme (2026-10-10). admin-blog.css used to
 * declare a DARK token set on top of the light admin shell, and the owner got
 * #d8d8d8 button text on a cream page. This reads the colours OUT OF THE CSS —
 * the :root tokens (resolved through tokens.css) and the rule declarations that
 * carry a literal — and computes each ratio. No dependency: relative luminance
 * is a dozen lines. Change a colour in the CSS and its row here re-checks it.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const TOKENS = read("../src/styles/tokens.css");
const BLOG = read("../src/styles/admin-blog.css");

/** Every custom property declared in a `:root { … }` block of the given sheets. */
function rootVars(...sheets: string[]): Map<string, string> {
  const vars = new Map<string, string>();
  for (const css of sheets) {
    for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
      const body = block[1]!.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(m[1]!, m[2]!.trim());
    }
  }
  return vars;
}
const VARS = rootVars(TOKENS, BLOG);

/** Resolve `var(--x, fallback)` chains down to a hex colour. */
function resolve(value: string, depth = 0): string {
  if (depth > 10) throw new Error(`var() cycle at ${value}`);
  const v = value.trim();
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(v);
  if (!m) return v;
  const declared = VARS.get(m[1]!);
  if (declared !== undefined) return resolve(declared, depth + 1);
  if (m[2]) return resolve(m[2], depth + 1);
  throw new Error(`unresolved ${m[1]}`);
}
const token = (name: string) => resolve(`var(${name})`);

/** The declarations of the FIRST rule whose selector list is exactly `selector`. */
function decl(selector: string, prop: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "m").exec(BLOG);
  if (!rule) throw new Error(`no rule ${selector}`);
  const d = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+);`).exec(rule[1]!);
  if (!d) throw new Error(`${selector} has no ${prop}`);
  // `border: 1px solid X` → X
  return resolve(d[1]!.trim().split(/\s+(?![^(]*\))/).pop()!);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function ratio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

const WHITE = "#ffffff";
const BG = token("--admin-bg");
const PANEL = token("--admin-panel");

describe("admin-blog.css tokens are the LIGHT theme", () => {
  it("surfaces resolve to cream / white / container-high and text to ink", () => {
    expect(BG.toLowerCase()).toBe("#f8f8f8");
    expect(PANEL.toLowerCase()).toBe("#ffffff");
    expect(token("--admin-panel-2").toLowerCase()).toBe("#ece7df");
    expect(token("--admin-text").toLowerCase()).toBe("#1a1a1a");
    expect(token("--admin-heading").toLowerCase()).toBe("#1a1a1a");
    expect(token("--admin-accent").toLowerCase()).toBe("#836044");
  });
});

// (label, fg, bg, min) — every pair the theme relies on.
const PAIRS: [string, string, string, number][] = [
  ["body text on page", token("--admin-text"), BG, 4.5],
  ["body text on panel", token("--admin-text"), PANEL, 4.5],
  ["dim text on page", token("--admin-text-dim"), BG, 4.5],
  ["dim text on panel", token("--admin-text-dim"), PANEL, 4.5],
  ["dim text on panel-2 (draft badge)", token("--admin-text-dim"), token("--admin-panel-2"), 4.5],
  ["disabled button text on its neutral fill", token("--admin-text-dim"), token("--admin-panel-2"), 4.5],
  ["field boundary on page (1.4.11)", token("--admin-line"), BG, 3],
  ["field boundary on panel (1.4.11)", token("--admin-line"), PANEL, 3],
  ["focus ring on page", token("--admin-accent"), BG, 3],
  ["focus ring on panel", token("--admin-accent"), PANEL, 3],
  ["primary button: white on accent", WHITE, decl(".btn-primary", "background"), 4.5],
  ["primary hover: white on accent-deep", WHITE, token("--admin-accent-deep"), 4.5],
  ["ghost button text", decl(".btn-ghost", "color"), decl(".btn-ghost", "background"), 4.5],
  ["ghost hover text on panel-2", decl(".btn-ghost", "color"), token("--admin-panel-2"), 4.5],
  ["danger-ghost text on panel", decl(".btn-danger-ghost", "color"), decl(".btn-danger-ghost", "background"), 7],
  ["danger-ghost border on panel", decl(".btn-danger-ghost", "border-color"), PANEL, 3],
  ["danger fill: white on danger", WHITE, decl(".btn-danger", "background"), 4.5],
  ["link-btn on panel", decl(".link-btn", "color"), PANEL, 7],
  ["link-btn on page", decl(".link-btn", "color"), BG, 4.5],
  ["row-action on page", decl(".row-action", "color"), BG, 4.5],
  ["slug toggle on panel-2", decl(".slug-chip__toggle", "color"), token("--admin-panel-2"), 4.5],
  ["counter ok on panel", decl('.counter[data-state="ok"]', "color"), PANEL, 4.5],
  ["counter ok on page", decl('.counter[data-state="ok"]', "color"), BG, 4.5],
  ["counter warn on panel", decl('.counter[data-state="warn"]', "color"), PANEL, 4.5],
  ["counter warn on page", decl('.counter[data-state="warn"]', "color"), BG, 4.5],
  ["counter over on panel", decl('.counter[data-state="over"]', "color"), PANEL, 4.5],
  ["counter over on page", decl('.counter[data-state="over"]', "color"), BG, 4.5],
  ["published badge", decl(".badge--published", "color"), decl(".badge--published", "background"), 4.5],
  ["validation summary", decl(".validation-summary", "color"), decl(".validation-summary", "background"), 4.5],
  ["preview banner", decl(".preview-banner", "color"), decl(".preview-banner", "background"), 4.5],
  ["preview banner back-link", decl(".preview-banner__back", "color"), decl(".preview-banner", "background"), 4.5],
  ["toast (the one dark element)", decl(".toast", "color"), decl(".toast", "background"), 4.5],
  ["sheet blockquote", decl(".sheet__doc.body blockquote", "color"), PANEL, 4.5],
  ["sheet link", decl(".sheet__doc.body a", "color"), PANEL, 4.5],
  ["upload/cover error text", decl(".cover-picker__error, .img-picker__error, .field__error", "color"), PANEL, 4.5],
  ["active segment: white on accent", decl(".seg--on, .seg--on:hover", "color"), decl(".seg--on, .seg--on:hover", "background"), 4.5],
];

describe("WCAG 2.2 AA contrast, computed from the CSS", () => {
  it.each(PAIRS)("%s", (_label, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe("the colours that must NOT carry text or a field edge", () => {
  it("bronze (--admin-gold) fails 4.5:1 on white, so no rule uses it as a text colour", () => {
    expect(ratio(token("--admin-gold"), WHITE)).toBeLessThan(4.5);
    expect(BLOG).not.toMatch(/(?:^|[\s;{])color:\s*var\(--admin-gold\)/m);
  });
  it("the hairline fails 3:1, so no input/select/segmented boundary uses it", () => {
    expect(ratio(token("--admin-hairline"), BG)).toBeLessThan(3);
    for (const sel of [".field__input, .field__textarea", ".tool-style", ".segmented", ".btn-ghost"]) {
      const edge = sel === ".btn-ghost" ? decl(sel, "border-color") : decl(sel, "border");
      expect(edge.toLowerCase(), sel).toBe(token("--admin-line").toLowerCase());
    }
  });
  it("the old dark tokens are gone (comments aside: the header records them)", () => {
    const code = BLOG.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
    for (const dark of ["#161616", "#1f1f1f", "#262626", "#d8d8d8"]) {
      expect(code).not.toContain(dark);
    }
  });
  it("the ratio function itself is right (black/white = 21, same colour = 1)", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#836044", "#836044")).toBe(1);
    expect(() => ratio("not-a-colour", "#fff")).toThrow();
  });
});
