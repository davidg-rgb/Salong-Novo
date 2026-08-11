/** Locale + route configuration. SV is canonical (root); EN is served under /en. */

export const LOCALES = ["sv", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "sv";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export type PageKey =
  | "home"
  | "staff"
  | "pricing"
  | "competitions"
  | "education"
  | "brands"
  | "work"
  | "contact"
  | "blog"
  | "about"
  | "privacy";

/**
 * Localized slug for each page (empty string = locale root).
 * Primary nav order (client-confirmed 2026-06-01, ARCHITECTURE §2A): contact, staff,
 * pricing, competitions, education, brands, work. about/blog/privacy are footer-only.
 */
export const ROUTES: Record<PageKey, Record<Locale, string>> = {
  home: { sv: "", en: "" },
  staff: { sv: "personal", en: "staff" },
  pricing: { sv: "priser", en: "prices" },
  competitions: { sv: "tavlingar", en: "competitions" },
  education: { sv: "utbildning-och-kurser", en: "education" },
  brands: { sv: "varumarken", en: "brands" },
  work: { sv: "jobba-pa-novo", en: "careers" },
  contact: { sv: "kontakt", en: "contact" },
  blog: { sv: "blogg", en: "blog" },
  about: { sv: "om-oss", en: "about" },
  privacy: { sv: "integritet", en: "privacy" },
};

/** Build the absolute path for a page key in a locale. */
export function localizePath(key: PageKey, locale: Locale): string {
  const slug = ROUTES[key][locale];
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  if (!slug) return prefix || "/";
  return `${prefix}/${slug}`;
}

/** hreflang alternates for a page key. */
export function alternates(key: PageKey): { locale: Locale; path: string }[] {
  return LOCALES.map((locale) => ({ locale, path: localizePath(key, locale) }));
}

/** Detect the locale from a pathname (defaults to SV). */
export function localeFromPath(pathname: string): Locale {
  const seg = pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  return isLocale(seg) ? seg : DEFAULT_LOCALE;
}
