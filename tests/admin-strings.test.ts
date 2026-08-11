import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, extname } from "node:path";
import { STRINGS, adminString } from "~/lib/cms/strings.sv";

/**
 * The chrome's completeness gate (ARCHITECTURE §6.13, §11.1).
 *
 * `adminString` echoes an unmapped key rather than returning blank, which makes
 * a missing string visible instead of invisible — but "visible" means Nicole
 * reads `error.db_unavailable` off her screen. The contract is that a RAW CODE
 * NEVER REACHES HER, and that only holds if every code the API can emit has a
 * Swedish message.
 *
 * So this reads the codes out of the SOURCE rather than restating them: add a
 * new `error:` or `detail:` anywhere under src/ without writing its message and
 * this fails, which is the whole point. `fileURLToPath`, never `URL.pathname`:
 * the vault path contains a space.
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

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

const SOURCES = walk(join(ROOT, "src"), [".ts", ".astro"]).map((file) => readFileSync(file, "utf8"));

function harvest(pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const source of SOURCES) {
    for (const match of source.matchAll(pattern)) if (match[1]) found.add(match[1]);
  }
  return [...found].sort();
}

/** The §11.1 taxonomy, written out — the table is the contract, not a derivation. */
const TAXONOMY = [
  "unauthorized",
  "forbidden",
  "invalid_input",
  "file_required",
  "not_found",
  "too_large",
  "unsupported_type",
  "content_mismatch",
  "db_unavailable",
  "media_unbound",
  "misconfigured",
  "internal",
  /*
   * The blog admin's own codes. They predate the core taxonomy and are emitted
   * by `src/pages/api/admin/posts*.ts` and `media.ts`, which keep their
   * hand-rolled envelope (§10.5). Listing them here is not a widening of the
   * rule — the rule is "every code the source emits has a Swedish message", and
   * these are codes the source emits.
   */
  "id_required",
  "invalid_id",
  "invalid_locale",
  "invalid_status",
  "key_required",
  "title_required",
] as const;

describe("error taxonomy → Swedish (§11.1)", () => {
  it("every code in the taxonomy has a message", () => {
    const unmapped = TAXONOMY.filter((code) => !STRINGS[`error.${code}`]);
    expect(unmapped).toEqual([]);
  });

  it("every code the source actually emits is in the taxonomy", () => {
    // A route inventing a code outside the table would render as the generic
    // "something went wrong" — technically safe, and a silent loss of the reason.
    const emitted = harvest(/error:\s*"([a-z_]+)"/g);
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.filter((code) => !(TAXONOMY as readonly string[]).includes(code))).toEqual([]);
  });

  it("every `detail` the source emits has an inline field message", () => {
    // Details reach the screen through `showFieldError`, which maps
    // fieldError.<detail>. An unmapped one degrades to the generic message —
    // recoverable, but it means the form stops saying WHAT is wrong.
    const details = [
      ...harvest(/detail:\s*"([a-z_]+)"/g),
      ...harvest(/invalid\(\s*"[a-zA-Z_.]+"\s*,\s*"([a-z_]+)"\s*\)/g),
    ];
    expect(details.length).toBeGreaterThan(0);
    const unmapped = [...new Set(details)].filter((detail) => !STRINGS[`fieldError.${detail}`]);
    expect(unmapped).toEqual([]);
  });

  it("no message is blank, and the fallback echoes rather than empties", () => {
    const blank = Object.entries(STRINGS).filter(([, value]) => value.trim() === "");
    expect(blank.map(([key]) => key)).toEqual([]);
    expect(adminString("nope.not.a.key")).toBe("nope.not.a.key");
  });
});

describe("interpolated strings keep their token", () => {
  it("every string a caller fills still carries the placeholder it fills", () => {
    // The `{token}` is the contract between the string and its one caller; a
    // rewrite that drops it produces a sentence missing its number, silently.
    const tokens: Record<string, string> = {
      "dashboard.newEnquiries": "{count}",
      "provenance.fieldsLeft": "{count}",
      "media.inUse": "{usage}",
      "media.cleared": "{usage}",
      "media.unclearable": "{usage}",
    };
    for (const [key, token] of Object.entries(tokens)) {
      expect(adminString(key), key).toContain(token);
    }
  });
});
