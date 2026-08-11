import type { Locale } from "../i18n/routes";

/**
 * Localized long-form page copy, reworked from the live site (verified
 * 2026-05-31). EN is a DRAFT pending client sign-off. Design-independent —
 * pages consume this regardless of visual direction. Mirrors content/copy.md.
 */
type Bi = Record<Locale, string>;
type Para = Record<Locale, string[]>;

export const home = {
  kicker: { sv: "Schwarzkopf Flaggskepp · Vasastan", en: "Schwarzkopf Flagship · Vasastan" } as Bi,
  heading: { sv: "Stockholms mest prisbelönta frisörsalong.", en: "Stockholm's most awarded hair salon." } as Bi,
  sub: {
    sv: "18 stylister i hjärtat av Vasastan. Klippning, färg och styling på tävlingsnivå — tre gånger vinnare av Årets Kollektion.",
    en: "18 stylists in the heart of Vasastan. Cut, colour and styling at competition level — three-time winners of Collection of the Year.",
  } as Bi,
  galleryLabel: { sv: "Utvalda hårbilder", en: "Selected hair looks" } as Bi,
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
};

export const contact = {
  heading: { sv: "Hitta hit.", en: "Find us." } as Bi,
  directions: {
    sv: "Från T-bana S:t Eriksplan är det en kort promenad (ca 3–5 min). Ta uppgången mot Sankt Eriksgatan/Torsgatan och följ Rörstrandsgatan till nr 39C. Salongen ligger i gatuplan.",
    en: "From S:t Eriksplan metro it's a short walk (approx. 3–5 min). Take the exit toward Sankt Eriksgatan/Torsgatan and follow Rörstrandsgatan to no. 39C. The salon is at street level.",
  } as Bi,
  cancellation: {
    sv: "Ändring eller avbokning gör du enklast själv via Voady, eller mejla info@salongnovo.se. Av-/ombokning senare än 48 h innan debiteras 50 %; utebliven tid (no show) debiteras 100 %.",
    en: "Change or cancel easily via Voady, or email info@salongnovo.se. Changes later than 48 h before are charged 50 %; no-shows are charged 100 %.",
  } as Bi,
};

// "Tävlingar" (client IA 2026-06-01) — carries the awards/competition record.
export const competitions = {
  heading: { sv: "Tävlingar & utmärkelser.", en: "Competitions & awards." } as Bi,
  intro: {
    sv: "Tre gånger vinnare av Årets Kollektion, finalister i Nordic Hairshot och fleråriga nomineringar i Årets Frisör.",
    en: "Three-time winners of Collection of the Year, Nordic Hairshot finalists, and repeated nominees in Hairdresser of the Year.",
  } as Bi,
};

// "Bokning & priser" (client IA 2026-06-01) — prices reversed back in; menu pending client content.
export const pricingPage = {
  heading: { sv: "Bokning & priser.", en: "Booking & prices." } as Bi,
  note: {
    sv: "Vår fullständiga pris- och bokningsöversikt publiceras inom kort. Under tiden bokar du din tid direkt via Voady så hjälper vi dig till rätt behandling och pris.",
    en: "Our full price and booking overview is coming soon. In the meantime, book your appointment directly via Voady and we'll guide you to the right treatment and price.",
  } as Bi,
};

// "Utbildning & kurser" (client IA 2026-06-01) — content mailed per tab; ships a coming-soon state.
export const education = {
  heading: { sv: "Utbildning & kurser.", en: "Education & courses." } as Bi,
  note: {
    sv: "Vi delar med oss av vårt hantverk genom utbildningar och kurser för frisörer. Programmet uppdateras inom kort — hör av dig till info@salongnovo.se för intresseanmälan.",
    en: "We share our craft through education and courses for hairdressers. The programme is being finalised — email info@salongnovo.se to register your interest.",
  } as Bi,
};

// "Våra brands" (client IA 2026-06-01) — Schwarzkopf flagship + carried lines; content pending.
export const brands = {
  heading: { sv: "Våra brands.", en: "Our brands." } as Bi,
  note: {
    sv: "Som Schwarzkopf-flaggskepp arbetar vi med marknadens främsta produkter och färgsystem. En komplett översikt över våra varumärken publiceras inom kort.",
    en: "As a Schwarzkopf flagship we work with the industry's leading products and colour systems. A full overview of the brands we carry is coming soon.",
  } as Bi,
};
