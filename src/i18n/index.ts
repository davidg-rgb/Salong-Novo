import sv from "./ui.sv.json";
import en from "./ui.en.json";
import { type Locale, DEFAULT_LOCALE } from "./routes";

export * from "./routes";

const DICTS: Record<Locale, Record<string, unknown>> = { sv, en };

/** Look up a dotted key (e.g. "cta.book") in the locale dictionary. */
function lookup(dict: Record<string, unknown>, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as object)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

/** Interpolate {placeholders} in a string. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    k in vars ? String(vars[k]) : m,
  );
}

/**
 * Translate a key for a locale. Falls back to the default locale, then the key
 * itself, so a missing translation never renders blank.
 */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const value =
    lookup(DICTS[locale], key) ?? lookup(DICTS[DEFAULT_LOCALE], key) ?? key;
  return interpolate(value, vars);
}

/** Curried translator bound to a locale: `const tr = useT("sv")`. */
export function useT(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) =>
    t(locale, key, vars);
}
