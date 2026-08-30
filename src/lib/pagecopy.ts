import type { Locale } from "../i18n/routes";

/**
 * Localized long-form page copy, reworked from the live site (verified
 * 2026-05-31). EN is a DRAFT pending client sign-off. Design-independent —
 * pages consume this regardless of visual direction. Mirrors content/copy.md.
 *
 * THIS FILE IS THE DEVELOPER DEFAULT LAYER, and stays that even now that the
 * copy is client-editable: `pageCopyDict()` at the foot of the module folds
 * every export into the i18n dictionary, so `t()` — and therefore the kv-aware
 * `useT()` — reads these strings, and `content_kv` overrides them per key.
 * Nothing else changed: no row means the string below is what renders, which is
 * the whole provenance model (§6.6). Pages never import these objects directly
 * any more; they translate `home.heading`, `about.body1`, and so on.
 */
type Bi = Record<Locale, string>;
type Para = Record<Locale, string[]>;

export const home = {
  metaTitle: {
    sv: "Salong NOVO — Frisör i Vasastan, Stockholm",
    en: "Salong NOVO — Hair salon in Vasastan, Stockholm",
  } as Bi,
  // Client feedback round 3 (2026-08-27) rewrote all three hero lines. The kicker
  // no longer names Schwarzkopf — the client's own brand list now leads with Keune,
  // so the flagship line was pulled rather than left standing unverified.
  kicker: { sv: "Stockholms vassaste frisörteam", en: "Stockholm's sharpest hair team" } as Bi,
  // "En av Sveriges mest prisbelönta" replaced "Stockholms mest prisbelönta": a
  // relative claim the competition record on /tavlingar actually supports, where the
  // old absolute one rested on nothing a visitor could check.
  heading: {
    sv: "En av Sveriges mest prisbelönta frisörsalonger",
    en: "One of Sweden's most awarded hair salons",
  } as Bi,
  sub: {
    sv: "Vi har skapat vår drömsalong där inget lämnas åt slumpen.",
    en: "We built our dream salon, where nothing is left to chance.",
  } as Bi,
  galleryLabel: { sv: "Utvalda hårbilder", en: "Selected hair looks" } as Bi,
  // {category} is the competition class, a Swedish proper noun in both locales —
  // the same way the stat row prints "Årets Kollektion" untranslated.
  galleryAlt: {
    sv: "{category}, Årets Frisör 2026",
    en: "{category}, Swedish Hairdressing Awards 2026",
  } as Bi,
  teamHeading: { sv: "Vårt fantastiska team.", en: "Our wonderful team." } as Bi,
};

// Closing champagne band above the footer (recognition layer — see DESIGN-SYSTEM §128).
export const closing = {
  eyebrow: { sv: "Boka tid · Vasastan, Stockholm", en: "Book now · Vasastan, Stockholm" } as Bi,
  heading: { sv: "Redo för din NOVO-stund?", en: "Ready for your NOVO moment?" } as Bi,
};

export const about = {
  heading: { sv: "Förnyelse, sedan 2013.", en: "Renewal, since 2013." } as Bi,
  body: {
    sv: [
      "NOVO betyder förnyelse. Sedan starten 2013 har vi alltid riktat fokus framåt — i hantverket, i hur vi driver företaget och i hur vi utvecklar vår salongskultur. Vi strävar hela tiden efter att betraktas som Stockholms bästa frisörer och att ge varje kund en upplevelse utöver det vanliga.",
      "Efter åtta framgångsrika år på Riddargatan var det dags för expansion. Hösten 2021 lämnade vi Östermalm och flyttade till större lokaler på Rörstrandsgatan i Vasastan. På 300 m² har vi skapat vår drömsalong — mjuka färger, specialtillverkad inredning och hållbara materialval.",
      "Att besöka oss är som att kliva in i en lyxig svit: stora fönster, vackert ljusinsläpp och en stund där stadens brus stannar utanför.",
    ],
    en: [
      "NOVO means renewal. Since 2013 we've always looked forward — in our craft, in how we run the business, and in how we develop our salon culture. We constantly strive to be regarded as Stockholm's best hairdressers and to give every client an experience beyond the ordinary.",
      "After eight successful years on Riddargatan it was time to expand. In autumn 2021 we left Östermalm for larger premises on Rörstrandsgatan in Vasastan. Across 300 m² we built our dream salon — soft colours, custom-made interiors and sustainable materials.",
      "Visiting us is like stepping into a luxurious suite: large windows, beautiful light, and a moment where the city's noise stays outside.",
    ],
  } as Para,
};

export const work = {
  heading: { sv: "Bli en del av NOVO-familjen.", en: "Become part of the NOVO family." } as Bi,
  body: {
    sv: [
      "Är du en genuint glad person? Gillar du att ge dina kunder förstklassig service med glimten i ögat? Är du hungrig på att lära dig nytt och utvecklas inom frisöryrket? Och viktigast av allt — är du en teamplayer?",
      "Då skulle du kunna trivas hos oss. Vi erbjuder hyrstolar i en topprenoverad lokal med plats för upp till 16 frisörer. Med ett SPA-rum med massagestolar, en riktig espressomaskin och en egen fotostudio vill vi attrahera dig som söker det lilla extra av din arbetsplats.",
      "Skicka ett mail till info@salongnovo.se så bokar vi in ett möte! — Chriss & Jannie",
    ],
    en: [
      "Are you a genuinely happy person? Do you love giving clients first-class service with a twinkle in your eye? Are you hungry to learn and grow as a hairdresser? And most importantly — are you a team player?",
      "Then you might thrive with us. We offer chair rental in a fully renovated space with room for up to 16 hairdressers. With a spa room with massage chairs, a real espresso machine and our own photo studio, we want to attract those who look for something extra from their workplace.",
      "Email info@salongnovo.se and we'll set up a meeting! — Chriss & Jannie",
    ],
  } as Para,
  // Added client round 3. Its own <h2> below the body: a second audience
  // (students looking for APL/trainee placements), reached after the founders
  // have signed off to the first one.
  aplHeading: {
    sv: "Är du elev under färdigutbildning och söker APL eller traineeplats?",
    en: "Are you a student in training looking for a placement or traineeship?",
  } as Bi,
  apl: {
    sv: [
      "Vi har väldigt många som söker praktik hos oss på NOVO, vilket vi är jätteglada för. För oss är kvalitén i utbildningen jätteviktig, och vi har under åren hjälpt många blivande frisörer att ta sitt gesällbrev och bli utbildade frisörer.",
      "Sök till oss om du gillar fart och fläkt, trivs med att vara delaktig, självständig och noggrann. Vi väljer bara ut elever som är 100 % motiverade till att det är frisör du vill bli.",
    ],
    en: [
      "A great many people apply to train with us at NOVO, which we are delighted about. The quality of that training matters enormously to us, and over the years we have helped many aspiring hairdressers earn their journeyman's certificate and qualify.",
      "Apply if you like a fast pace, and if you enjoy being involved, independent and meticulous. We only take on students who are 100 % certain that hairdressing is what they want to do.",
    ],
  } as Para,
};

// Team page (grid → modal). The heading is the nav label; only the intro is prose.
export const staff = {
  intro: {
    sv: "Vårat fantastiska stjärnteam består idag av dessa 17 utbildade frisörer.",
    en: "Our fantastic star team consists of these 17 trained hairdressers.",
  } as Bi,
  metaDescription: {
    sv: "Möt NOVO:s 17 prisbelönta stylister i Vasastan, Stockholm.",
    en: "Meet NOVO's 17 award-winning stylists in Vasastan, Stockholm.",
  } as Bi,
};

export const contact = {
  metaDescription: {
    sv: "Rörstrandsgatan 39C, Stockholm. T-bana S:t Eriksplan. 08-663 30 14.",
    en: "Rörstrandsgatan 39C, Stockholm. Metro S:t Eriksplan. +46 8 663 30 14.",
  } as Bi,
  heading: { sv: "Hitta hit.", en: "Find us." } as Bi,
  directions: {
    sv: "Från T-bana S:t Eriksplan är det en kort promenad (ca 3–5 min). Ta uppgången mot Sankt Eriksgatan/Torsgatan och följ Rörstrandsgatan till nr 39C. Entrén till Novos egna trapphus finner du i gatuplan, med salongen en trappa upp, ingen hiss.",
    en: "From S:t Eriksplan metro it's a short walk (approx. 3–5 min). Take the exit toward Sankt Eriksgatan/Torsgatan and follow Rörstrandsgatan to no. 39C. The entrance to NOVO's own stairwell is at street level, with the salon one flight up — no elevator.",
  } as Bi,
  cancellation: {
    sv: "Ändring eller avbokning gör du enklast själv via Voady, eller mejla info@salongnovo.se. Av-/ombokning senare än 48 h innan debiteras 50 %; utebliven tid (no show) debiteras 100 %.",
    en: "Change or cancel easily via Voady, or email info@salongnovo.se. Changes later than 48 h before are charged 50 %; no-shows are charged 100 %.",
  } as Bi,
};

// "Utmärkelser" (client IA 2026-06-01, renamed from "Tävlingar" 2026-08-25) — carries
// the awards/competition record. The route slugs stay /tavlingar and /en/competitions.
export const competitions = {
  // Not "Utmärkelser & utmärkelser": the nav label now carries the word, so the H1
  // drops the old "Tävlingar &" half rather than repeating it.
  heading: { sv: "Utmärkelser.", en: "Awards." } as Bi,
  intro: {
    sv: "Tre gånger vinnare av Årets Kollektion, finalister i Nordic Hairshot och fleråriga nomineringar i Årets Frisör.",
    en: "Three-time winners of Collection of the Year, Nordic Hairshot finalists, and repeated nominees in Hairdresser of the Year.",
  } as Bi,
};

// "Behandlingar & priser" — renamed from "Bokning & priser" on the client's own
// suggestion (round 3, 2026-08-27); the route slug stays /priser so no link breaks.
// The three paragraphs are the salon's actual price policy, which replaced the
// coming-soon note. Prisinformationslagen (2004:347): frånpriser are declared as
// frånpriser in the first line, and the out-of-hours surcharge is stated before
// booking rather than discovered on the invoice.
export const pricingPage = {
  heading: { sv: "Behandlingar & priser.", en: "Treatments & prices." } as Bi,
  body: {
    sv: [
      "Alla våra priser är frånpriser och baseras på både tidsåtgång och material. Med vårat smarta bokningssystem Voady gör du en enklare konsultation där du guidas till vilken behandling du bör välja utifrån din hårmängd samt hårlängd. Du får en prisuppskattning innan du bokar, samt info om våra bokningsvillkor.",
      "Våra klippriser varierar beroende på utförare och tidsåtgång, men generellt timpris för klippning är 930 kr/h. De flesta av våra klipp- och färgbehandlingar brukar landa mellan 2 500 och 3 700 kr.",
      "Observera att vi har ett tillägg på 10 % på tider som utförs före 08.00 och efter 17.00 på vardagar, samt under hela lördag och söndag.",
    ],
    en: [
      "All our prices are starting prices, based on both the time taken and the materials used. Our booking system Voady walks you through a short consultation that guides you to the right treatment for your hair's length and thickness. You get a price estimate before you book, along with our booking terms.",
      "Cutting prices vary with the stylist and the time required, but the general hourly rate for cutting is SEK 930/h. Most of our cut-and-colour treatments land between SEK 2,500 and 3,700.",
      "Please note that a 10 % surcharge applies to appointments before 08:00 and after 17:00 on weekdays, and all day Saturday and Sunday.",
    ],
  } as Para,
};

// "Utbildning & kurser" — the client's own copy, round 3 (2026-08-27). Two typos in
// the source were corrected on the way in: "inspirerade" → "inspirerande", and the
// address "info@salognovo.se" → "info@salongnovo.se" (a live mailto: that bounces is
// worse than a rewrite). Paragraph 2 promises a programme "här nedan", which is why
// the page now renders the `courses` collection under the prose — and why
// `coursesEmpty` exists for the state the salon is actually in today.
export const education = {
  heading: { sv: "Utbildning & kurser.", en: "Education & courses." } as Bi,
  body: {
    sv: [
      "Vi älskar utbildning och har lång erfarenhet av att utbilda nya och erfarna frisörer, både genom leverantör och i egen regi.",
      "Vårt aktuella kursprogram hittar du här nedan. Är du verksam frisör och vill boka en skräddarsydd utbildning med oss? Maila din förfrågan till info@salongnovo.se.",
      "Vi håller även inspirerande event i våra underbara lokaler för privatpersoner — kundkvällar, stylingkurser eller skräddarsydda event för både mindre och större sällskap. Håll utkik på vår Instagram eller här på vår blogg, där vi uppdaterar löpande om kommande event på NOVO.",
    ],
    en: [
      "We love teaching, and we have long experience of training both new and experienced hairdressers — through our suppliers and under our own roof.",
      "Our current course programme is below. If you work as a hairdresser and would like to book a tailored course with us, email your enquiry to info@salongnovo.se.",
      "We also host events in our premises for private guests — client evenings, styling classes, and tailored events for smaller and larger parties. Keep an eye on our Instagram, or here on the blog, where we post about what is coming up at NOVO.",
    ],
  } as Para,
  coursesHeading: { sv: "Kursprogram", en: "Course programme" } as Bi,
  // The honest state of an empty programme. The list above it is a collection, so
  // this line disappears the moment the salon adds its first course in the admin.
  coursesEmpty: {
    sv: "Kursprogrammet uppdateras löpande. Maila info@salongnovo.se så berättar vi vad som är på gång.",
    en: "The programme is updated as courses are scheduled. Email info@salongnovo.se and we'll tell you what's coming up.",
  } as Bi,
};

// "Våra brands" — the coming-soon note is gone: the page now renders the `brands`
// collection (client round 3, 2026-08-27, which named the five lines it carries).
// The Schwarzkopf-flaggskepp sentence went with it. That claim is not the client's
// to make on this page any more — the list they sent leads with Keune, a competing
// colour house — and an unverified flagship claim is exactly the kind MFL 2008:486
// §10 catches. Confirm the relationship before any version of it goes back up.
export const brands = {
  heading: { sv: "Våra brands.", en: "Our brands." } as Bi,
  intro: {
    sv: "Vi arbetar med produkter och verktyg vi själva står bakom — i salongen, och att ta med hem. Här är märkena du hittar hos oss.",
    en: "We work with products and tools we stand behind ourselves — in the salon, and to take home. These are the brands you'll find with us.",
  } as Bi,
};

// Footer-only page. The heading is the dictionary's `footer.privacy`, so it is
// editable once rather than twice.
export const privacy = {
  metaDescription: {
    sv: "Så hanterar Salong NOVO personuppgifter.",
    en: "How Salong NOVO handles personal data.",
  } as Bi,
  body: {
    sv: [
      "Denna sida beskriver hur Salong NOVO behandlar personuppgifter. Fullständig integritetspolicy publiceras inför lansering.",
      "Vi samlar endast in de uppgifter som behövs för att besvara förfrågningar och förbättra webbplatsen. Bokning hanteras av Voady enligt deras villkor.",
    ],
    en: [
      "This page describes how Salong NOVO processes personal data. The full privacy policy will be published before launch.",
      "We only collect the data needed to respond to enquiries and improve the website. Booking is handled by Voady under their terms.",
    ],
  } as Para,
};

/**
 * Every page-copy group, keyed by the namespace it occupies in the dictionary.
 *
 * The keys are `PageKey`s wherever a page owns the copy (`pricing`, not
 * `pricingPage`), so an admin form, a route and a dictionary namespace all read
 * the same word. `closing` is the one exception: the champagne band belongs to
 * the footer, which is on every page.
 */
export const PAGE_COPY = {
  home,
  closing,
  about,
  staff,
  contact,
  competitions,
  pricing: pricingPage,
  education,
  brands,
  work,
  privacy,
} as const;

export type PageCopyGroup = keyof typeof PAGE_COPY;

/**
 * The bridge into `src/i18n/index.ts`: one locale's slice of the copy above, in
 * the nested shape `t()` walks.
 *
 * A `Para` (an array of paragraphs) expands to NUMBERED keys — `about.body`
 * becomes `about.body1`, `about.body2`, `about.body3` — because `content_kv`
 * stores one string per key and the client edits one paragraph at a time. Use
 * `paraKeys()` to render them back in order rather than hardcoding the count.
 */
export function pageCopyDict(locale: Locale): Record<string, Record<string, string>> {
  const dict: Record<string, Record<string, string>> = {};
  for (const [group, fields] of Object.entries(PAGE_COPY)) {
    const bucket: Record<string, string> = {};
    for (const [name, value] of Object.entries(fields as Record<string, Bi | Para>)) {
      const localized = value[locale];
      if (Array.isArray(localized)) {
        localized.forEach((paragraph, index) => (bucket[`${name}${index + 1}`] = paragraph));
      } else {
        bucket[name] = localized;
      }
    }
    dict[group] = bucket;
  }
  return dict;
}

/**
 * The dictionary keys a multi-paragraph field expands to, in order — the count
 * comes from the default itself, so adding a paragraph to `about.body` above is
 * the only edit needed to render (and allowlist) it.
 */
export function paraKeys(group: PageCopyGroup, field: string): string[] {
  const value = (PAGE_COPY[group] as Record<string, Bi | Para>)[field];
  const paragraphs = value?.sv;
  if (!Array.isArray(paragraphs)) return [`${group}.${field}`];
  return paragraphs.map((_, index) => `${group}.${field}${index + 1}`);
}
