import { getSite } from "./content";
import type { KvMap } from "./cms/content";

/**
 * Build schema.org JSON-LD for the salon (HairSalon). Pure: takes the site
 * record + canonical URL, returns a plain object ready for JSON.stringify.
 *
 * The kv map is what keeps the structured data honest — an address the client
 * corrects in the admin has to reach Google's copy of it too, not just the
 * visible page.
 */
export function hairSalonJsonLd(siteUrl: string, kv?: KvMap | null) {
  const site = getSite(kv);
  const jsonld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    name: site.brand.name,
    url: siteUrl,
    telephone: site.contact.phone,
    email: site.contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      postalCode: site.address.postal,
      addressLocality: site.address.city,
      addressCountry: site.address.country,
    },
    sameAs: [site.contact.instagram],
    areaServed: "Stockholm",
    foundingDate: String(site.brand.founded),
  };

  if (site.geo && site.geo.lat != null && site.geo.lng != null) {
    jsonld.geo = {
      "@type": "GeoCoordinates",
      latitude: site.geo.lat,
      longitude: site.geo.lng,
    };
  }
  return jsonld;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  locale: "sv" | "en";
  image?: string;
}

/** Open Graph / Twitter meta as a flat map for a layout to emit. */
export function ogMeta(meta: PageMeta): Record<string, string> {
  const og: Record<string, string> = {
    "og:title": meta.title,
    "og:description": meta.description,
    "og:url": meta.canonical,
    "og:type": "website",
    "og:locale": meta.locale === "en" ? "en_GB" : "sv_SE",
    // Only promise a large-image card when we actually have an image (blog covers).
    // Marketing pages have no image yet (brand OG asset is content-pending), so they
    // get a text 'summary' card instead of a blank large card (review 2026-06-01).
    "twitter:card": meta.image ? "summary_large_image" : "summary",
    "twitter:title": meta.title,
    "twitter:description": meta.description,
  };
  if (meta.image) {
    og["og:image"] = meta.image;
    og["twitter:image"] = meta.image;
  }
  return og;
}

/** The values that mean "yes" for `PUBLIC_SITE_NOINDEX`, matched case-insensitively. */
const NOINDEX_TRUE = new Set(["1", "true", "yes", "noindex"]);

/**
 * Is this build a staging copy that must stay out of the index?
 *
 * Pure, so the truth table is a unit test rather than a deploy-time surprise.
 * Unset and `""` are FALSE — production is the default and never has to
 * remember to opt out. Anything unrecognised is also false: a typo in the var
 * must fail towards the production behaviour, never towards silently
 * de-indexing the real site.
 */
export function isNoindex(value: string | undefined | null): boolean {
  return NOINDEX_TRUE.has((value ?? "").trim().toLowerCase());
}

/**
 * The one place `PUBLIC_SITE_NOINDEX` is read. A `PUBLIC_` var is INLINED at
 * build time (RUNBOOK §4.12) — on the Cloudflare target `wrangler.toml [vars]`
 * is the build environment — so this is a property of the artefact, not a
 * runtime toggle. Flipping the var on a deployed site changes nothing until
 * something rebuilds.
 */
export function siteNoindex(): boolean {
  return isNoindex(import.meta.env.PUBLIC_SITE_NOINDEX);
}
