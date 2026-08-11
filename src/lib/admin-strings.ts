/**
 * Admin UI copy — Swedish only. The admin serves 1–3 internal users who operate
 * in Swedish; post locale (SV/EN) is an orthogonal field, NOT the chrome
 * language, so there is no admin language switcher. Kept separate from the
 * public `ui.sv.json` so tool copy never enters the public bundle. One flat,
 * typed const — every admin module imports `ADMIN`. See ARCHITECTURE §10.6.
 *
 * `{placeholders}` are filled at the call site (e.g. ADMIN.dashboard.deleteConfirm
 * with `{title}`); the helpers below do the substitution.
 */
export const ADMIN = {
  nav: {
    dashboard: "Dashboard",
    newPost: "Nytt inlägg",
    viewSite: "Visa sajt",
    logout: "Logga ut",
  },

  dashboard: {
    // Table headers
    colTitle: "Titel",
    colLocale: "Språk",
    colStatus: "Status",
    colUpdated: "Uppdaterad",
    colActions: "Åtgärder",
    // Row actions
    edit: "Redigera",
    delete: "Ta bort",
    view: "Visa",
    // Filter bar
    searchPlaceholder: "Sök titel…",
    filterAll: "Alla",
    filterDraft: "Utkast",
    filterPublished: "Publicerat",
    localeAll: "Alla",
    localeSv: "SV",
    localeEn: "EN",
    // Status labels
    statusDraft: "Utkast",
    statusPublished: "Publicerat",
    // Empty state
    empty: "Inga inlägg ännu.",
    emptyCta: "Skriv ditt första inlägg",
    // Delete confirm — fill {title}
    deleteConfirm: 'Ta bort "{title}"? Detta går inte att ångra.',
  },

  editor: {
    title: "Titel",
    slug: "Slug",
    slugEdit: "✎ redigera",
    slugAuto: "auto",
    locale: "Språk",
    localeSv: "SV",
    localeEn: "EN",
    excerpt: "Utdrag",
    excerptSuggest: "Föreslå",
    bodyPlaceholder: "Skriv ditt inlägg i Markdown…",
    previewPlaceholder: "Förhandsvisning visas här",
    cover: "Omslagsbild",
    coverChange: "Byt",
    coverRemove: "Ta bort",
    seoTitle: "SEO-titel",
    seoDesc: "SEO-beskrivning",
    // Action bar
    saveDraft: "Spara utkast",
    publish: "Publicera",
    preview: "Förhandsgranska",
    delete: "Ta bort",
    saveChanges: "Spara ändringar",
    unpublish: "Avpublicera",
  },

  states: {
    saving: "Sparar…",
    // Fill {time}
    saved: "Sparat {time}",
    previewLoading: "Skriver…",
    previewError: "Kunde inte ladda förhandsvisning · Försök igen",
    unsavedGuard: "Du har osparade ändringar. Lämna sidan?",
    // Fill {n}
    fixFields: "Rätta {n} fält innan publicering",
    sessionExpired:
      "Din session har gått ut — ladda om sidan och logga in igen.",
  },

  errors: {
    uploadTooLarge: "Bilden är för stor (max 10 MB)",
    uploadBadType: "Filtypen stöds inte (använd JPG, PNG, WebP)",
    uploadNetwork: "Uppladdning misslyckades — försök igen",
    generic: "Något gick fel — försök igen",
  },

  aria: {
    bold: "Fetstil",
    italic: "Kursiv",
    heading: "Rubrik",
    quote: "Citat",
    bulletList: "Punktlista",
    orderedList: "Numrerad lista",
    link: "Länk",
    image: "Bild",
  },
} as const;

export type AdminStrings = typeof ADMIN;

/** Fill `{key}` placeholders in an admin string. Unknown keys are left intact. */
export function fmt(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
