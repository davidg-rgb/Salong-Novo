/**
 * Every admin-visible string, in Swedish (ARCHITECTURE §6.13).
 *
 * The admin chrome is Swedish-only by decision — Nicole is the only person who
 * uses it. Keeping the strings in ONE module (rather than inline in the
 * components) is what makes the chrome swappable when the core is vendored into
 * a project whose client speaks something else.
 *
 * The `error.*` block is the §11.1 taxonomy: the API returns machine codes and
 * the client maps them here. A raw code must never reach the screen.
 *
 * Keys are dot-namespaced by surface, and each phase adds the strings for the
 * screens it builds.
 */
export const STRINGS: Record<string, string> = {
  // ── shell ────────────────────────────────────────────────────────────────
  "admin.title": "Salong NOVO Admin",
  "admin.signedInAs": "Inloggad som",
  "admin.logout": "Logga ut",
  "admin.viewSite": "Visa sajten",

  // ── dashboard ────────────────────────────────────────────────────────────
  "dashboard.title": "Översikt",
  "dashboard.lede": "Här redigerar du innehållet på sajten. Ändringar syns direkt — ingen ny publicering behövs.",
  "dashboard.card.posts": "Skriv, redigera och publicera inlägg på bloggen.",
  "dashboard.card.media": "Ladda upp och hantera bilderna som används på sajten.",
  "dashboard.card.enquiries": "Förfrågningar som kommit in via kontaktformuläret.",
  /** The badge on the enquiries card (F-016). `{count}` is the unread count. */
  "dashboard.newEnquiries": "{count} nya",
  "dashboard.enquiriesQuiet": "Inga nya förfrågningar just nu.",
  "dashboard.enquiriesDown": "Antalet förfrågningar kunde inte hämtas just nu.",

  /**
   * F-018, the dashboard half: what is still showing an invented value. The
   * point is that "nobody has checked this yet" is visible from the front page,
   * not only when you happen to open the right form.
   */
  "provenance.title": "Att gå igenom",
  "provenance.lede":
    "Texter som ingen har bekräftat än. De visas på sajten som de står — gå in, ändra eller tryck Bekräfta så försvinner de härifrån.",
  "provenance.fieldsLeft": "{count} fält kvar",
  "provenance.allConfirmed":
    "Allt är genomgånget. Ingen text på sajten är en platshållare längre.",
  "provenance.down": "Kunde inte läsa vad som är bekräftat — databasen svarar inte just nu.",

  // ── navigation (keys referenced by CMS.adminNav) ─────────────────────────
  "nav.dashboard": "Översikt",
  "nav.blog": "Blogg",
  "nav.media": "Bildbank",
  "nav.enquiries": "Förfrågningar",
  /** Heading over the derived per-group / per-collection links. */
  "nav.content": "Innehåll",
  /** The phone-sized <summary> that folds the derived chip row away. */
  "nav.contentToggle": "Innehåll att redigera",

  // ── shared form vocabulary ───────────────────────────────────────────────
  "form.save": "Spara",
  "form.saving": "Sparar…",
  "form.saved": "Sparat",
  "form.cancel": "Avbryt",
  "form.delete": "Ta bort",
  "form.confirmDelete": "Är du säker? Detta går inte att ångra.",
  "form.reset": "Återställ till standard",
  "form.sv": "Svenska",
  "form.en": "Engelska",
  "form.required": "Obligatoriskt",
  "form.optional": "Valfritt",
  "form.placeholderBadge": "Platshållare",
  "form.confirmPlaceholder": "Bekräfta",
  "form.dirtyWarning": "Du har osparade ändringar. Vill du lämna sidan ändå?",

  /** F-017: shown when an admin write comes back as an Access login redirect. */
  "form.sessionExpired":
    "Din session har gått ut — logga in i ny flik och spara igen",

  // ── content forms: site facts + page copy (F-008, F-009, F-018) ──────────
  "content.factsLede":
    "Uppgifterna om dig som visas på sajten. Ändringar syns direkt — ingen ny publicering behövs.",
  "content.copyLede":
    "Texterna på sidan. Lämnar du ett fält tomt används originaltexten, den som står grå i rutan.",
  "content.saved": "Ändringarna är sparade",
  "content.nothingToSave": "Inget har ändrats",
  "content.emptyDb": "Innehållet är inte tillgängligt — databasen svarar inte just nu.",
  "content.confirmReset":
    "Återställ fältet till originaltexten? Din version tas bort.",
  /** R-5: an untranslated English side is normal, not an error. */
  "content.enFallbackHint": "Lämnas tomt visas den svenska texten även på engelska.",
  "content.imageHint": "Välj en fil för att byta bild. Den läggs samtidigt i bildbanken.",
  "content.imageUploaded": "Bilden är uppladdad — glöm inte att spara.",

  // ── collections (F-010) ──────────────────────────────────────────────────
  "collection.lede":
    "Listan som visas på sajten. Ordningen här är ordningen på sajten — dra eller använd pilarna.",
  "collection.addTitle": "Lägg till nytt",
  "collection.add": "Lägg till",
  "collection.saved": "Sparat",
  "collection.deleted": "Borttaget",
  "collection.confirmDelete": "Ta bort posten? Detta går inte att ångra.",
  "collection.empty": "Listan är tom. Lägg till den första posten här nedanför.",
  "collection.emptyDb": "Listan är inte tillgänglig — databasen svarar inte just nu.",

  /**
   * The admin half of this project's no-seed provenance rule
   * (`src/lib/collections.ts`): zero rows here does NOT mean an empty page, the
   * JSON defaults are still showing. Saying so — and offering the one-press copy
   * — is what stops the client from either panicking or typing a nineteenth
   * stylist that makes the other eighteen vanish. `{n}` is the default count.
   */
  "collection.fallbackNotice":
    "Listan är tom här, men hemsidan visar standardlistan ({n} poster). Kopiera in den för att kunna redigera posterna — efter det styr listan här vad som visas.",
  "collection.copyDefaults": "Kopiera standardlistan ({n} poster)",
  "collection.copyDefaultsNotEmpty": "Listan är inte tom längre — laddar om.",
  "collection.copyDefaultsFailed":
    "Kopieringen misslyckades. Försök igen, eller kontakta David.",
  "collection.reorderHint":
    "Dra en post för att flytta den, eller använd pilarna. Ordningen sparas direkt.",
  "collection.listHint": "En rad per punkt.",
  "collection.moveUp": "Flytta upp",
  "collection.moveDown": "Flytta ner",

  // ── media library (F-011) ────────────────────────────────────────────────
  "media.title": "Bildbank",
  "media.lede":
    "Alla bilder som laddats upp till sajten — omslagsbilder till inlägg och bilder inne i texterna. Ladda upp en gång, återanvänd var som helst.",
  "media.upload": "Ladda upp bild",
  "media.uploading": "Laddar upp…",
  "media.file": "Bildfil",
  /** ADR-05: single-size originals, so the guidance IS the optimisation. */
  "media.guidance":
    "JPEG, PNG, WebP eller AVIF. Max 10 MB. Ladda upp den största versionen du har — bilden skalas ner, aldrig upp.",
  "media.alt": "Beskrivning (för dig)",
  "media.altHint":
    "Bara till för att känna igen bilden här i bildbanken. Texten som syns för besökare skriver du där bilden används.",
  "media.altSave": "Spara beskrivning",
  "media.altSaved": "Beskrivningen sparad",
  "media.uploaded": "Bilden är uppladdad",
  "media.deleted": "Bilden är borttagen",
  "media.empty": "Inga bilder än. Ladda upp den första här ovanför.",
  "media.emptyDb": "Bildbanken är inte tillgänglig — databasen svarar inte just nu.",
  "media.confirmDelete": "Ta bort bilden? Detta går inte att ångra.",
  /** §9.6: the soft in-use warning, filled with the referencing labels. */
  "media.inUse": "Bilden används av: {usage}. Ta bort ändå?",
  "media.cleared": "Bilden togs bort. Referenser rensade: {usage}.",
  "media.unclearable":
    "Obs: dessa referenser måste du rensa själv, de gick inte att rensa automatiskt: {usage}.",

  // inline field errors — keyed by the API's `detail`, so a 400 lands ON the field
  "fieldError.required": "Måste fyllas i.",
  "fieldError.too_long": "För långt.",
  "fieldError.unparseable": "Länken känns inte igen.",
  "fieldError.bad_shape": "Ogiltigt värde.",
  "fieldError.out_of_range": "Utanför tillåtet intervall.",
  "fieldError.unknown": "Ogiltigt val.",
  "fieldError.too_many": "För många rader.",
  "fieldError.duplicate": "Samma post förekommer två gånger.",
  /**
   * The four shape errors. A client can only provoke these by sending a body the
   * form does not produce, so they read as "reload and try again" rather than
   * naming a type — but they are mapped, because an unmapped detail is a raw code
   * one `adminString` call away from the screen.
   */
  "fieldError.expected_object": "Något gick fel med formuläret. Ladda om sidan och försök igen.",
  "fieldError.expected_array": "Något gick fel med listan. Ladda om sidan och försök igen.",
  "fieldError.expected_string": "Ogiltigt värde.",
  "fieldError.not_an_id": "Ogiltig post i listan. Ladda om sidan och försök igen.",
  "fieldError.generic": "Fel ifyllt.",

  // ── enquiry inbox (F-013, §9.8) ──────────────────────────────────────────
  "enquiries.title": "Förfrågningar",
  "enquiries.lede":
    "Meddelanden från kontaktformuläret. Svara från din vanliga mejl — knapparna här är bara till för att hålla ordning på vad du hunnit titta på.",
  "enquiries.empty": "Inga förfrågningar än. De som skickas via kontaktformuläret hamnar här.",
  /** The per-tab empty state: the inbox is not empty, this shelf is. */
  "enquiries.emptyFiltered": "Inga förfrågningar med den märkningen.",
  "enquiries.emptyDb": "Förfrågningarna är inte tillgängliga — databasen svarar inte just nu.",

  "enquiries.filter.all": "Alla",
  "enquiries.status.new": "Ny",
  "enquiries.status.read": "Läst",
  "enquiries.status.archived": "Arkiverad",
  "enquiries.status.spam": "Skräppost",

  /** Verbs, not labels — a button says what pressing it does. */
  "enquiries.action.new": "Markera som oläst",
  "enquiries.action.read": "Markera som läst",
  "enquiries.action.archived": "Arkivera",
  "enquiries.action.spam": "Skräppost",
  "enquiries.saved": "Märkningen är sparad",

  "enquiries.company": "Företag",
  "enquiries.received": "Inkom",
  "enquiries.language": "Språk",
  "enquiries.reply": "Svara med mejl",
  /**
   * `mail_status` matters to exactly one question: is this also in your inbox,
   * or is this page the only copy? Only the answer "no" is worth saying.
   */
  "enquiries.mailFailed":
    "Notismejlet gick inte fram — den här sidan är enda stället meddelandet finns.",
  "enquiries.mailPending": "Notismejlet har inte skickats än.",

  // ── preview (F-006) ──────────────────────────────────────────────────────
  "preview.banner": "FÖRHANDSVISNING",
  "preview.lede":
    "Så här ser det ut på sajten. Utkast syns bara via den här sidan tills du publicerar.",
  "preview.back": "Tillbaka till redigering",

  // ── error taxonomy (§11.1) — every code has a message ────────────────────
  "error.unauthorized": "Du är inte behörig. Ladda om sidan och logga in igen.",
  "error.forbidden": "Åtgärden nekades. Ladda om sidan och försök igen.",
  "error.invalid_input": "Något i formuläret är fel ifyllt.",
  "error.file_required": "Välj en fil att ladda upp.",
  "error.not_found": "Hittades inte — den kan ha tagits bort.",
  "error.too_large": "Filen är för stor. Max 10 MB.",
  "error.unsupported_type": "Filtypen stöds inte. Använd JPEG, PNG, WebP eller AVIF.",
  "error.content_mismatch": "Filens innehåll matchar inte filtypen.",
  "error.db_unavailable": "Databasen är inte tillgänglig just nu.",
  "error.media_unbound": "Bildlagringen är inte tillgänglig just nu.",
  "error.misconfigured": "Servern är felkonfigurerad. Kontakta David.",
  "error.internal": "Något gick fel. Försök igen.",
  "error.network": "Ingen kontakt med servern. Kontrollera din uppkoppling.",

  /**
   * The two codes the "kopiera standardlistan" write can answer with. Only
   * `not_empty` is reachable by pressing the button twice; `invalid_default`
   * means a JSON default no longer passes its own schema, which is a repo bug —
   * so the message points at the developer rather than asking her to fix it.
   */
  "error.not_empty": "Listan är inte tom längre — ladda om sidan.",
  "error.invalid_default": "Standardlistan kunde inte kopieras. Kontakta David.",

  /*
   * The blog admin's own codes (§10.5). They predate the core's twelve-code
   * taxonomy and are emitted by `src/pages/api/admin/posts*.ts` and
   * `media.ts`, which keep their hand-rolled envelope. They are mapped here for
   * the same reason as the rest: `tests/admin-strings.test.ts` harvests every
   * `error: "…"` under src/, so a code without a message fails CI rather than
   * reaching a screen as a raw machine string.
   */
  "error.id_required": "Inlägget saknar id. Ladda om sidan och försök igen.",
  "error.invalid_id": "Ogiltigt id. Ladda om sidan och försök igen.",
  "error.invalid_locale": "Ogiltigt språk. Välj SV eller EN.",
  "error.invalid_status": "Ogiltig status. Välj utkast eller publicerat.",
  "error.key_required": "Bilden saknar nyckel. Ladda om sidan och försök igen.",
  "error.title_required": "Inlägget måste ha en titel.",
};

/**
 * Look up an admin string. A missing key ECHOES the key rather than returning
 * blank — chrome with a visible `nav.portfolio` in it is a bug you can see and
 * fix; chrome with an empty button is a bug you ship.
 */
export function adminString(key: string): string {
  return STRINGS[key] ?? key;
}
