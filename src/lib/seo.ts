import { getSite } from "./content";

/**
 * Build schema.org JSON-LD for the salon (HairSalon). Pure: takes the site
 * record + canonical URL, returns a plain object ready for JSON.stringify.
 */
export function hairSalonJsonLd(siteUrl: string) {
  const site = getSite();
  const jsonld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    name: site.name,
    url: siteUrl,
    telephone: site.phone,
    email: site.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      postalCode: site.address.postal,
      addressLocality: site.address.city,
      addressCountry: site.address.country,
    },
    sameAs: [site.instagram],
    areaServed: "Stockholm",
    foundingDate: String(site.founded),
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
