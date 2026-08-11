import staffData from "../../content/staff.json";
import servicesData from "../../content/services.json";
import awardsData from "../../content/awards.json";
import siteData from "../../content/site.json";
import type { Locale } from "../i18n/routes";

export interface Stylist {
  name: string;
  slug: string;
  role: string;
  specialty: string;
  instagram: string | null;
  awards: string[];
  bio_sv: string;
  bio_en: string;
}

export interface Service {
  slug: string;
  name_sv: string;
  name_en: string;
  desc_sv: string;
  desc_en: string;
}

export function getStaff(): Stylist[] {
  return staffData.stylists as Stylist[];
}

export function getStylist(slug: string): Stylist | undefined {
  return getStaff().find((s) => s.slug === slug);
}

export function getServices(): Service[] {
  return servicesData.services as Service[];
}

export function showServicePrices(): boolean {
  return servicesData.showPrices === true;
}

export function getAwards() {
  return awardsData.awards;
}

export function getStats() {
  return awardsData.headline_stats;
}

export function getSite() {
  return siteData;
}

export function bookingUrl(): string {
  return siteData.booking.url;
}

/** Localized stylist bio with graceful fallback. */
export function stylistBio(s: Stylist, locale: Locale): string {
  const bio = locale === "en" ? s.bio_en : s.bio_sv;
  return bio && bio !== "TODO" ? bio : "";
}

/** Localized service name/description. */
export function serviceName(svc: Service, locale: Locale): string {
  return locale === "en" ? svc.name_en : svc.name_sv;
}
export function serviceDesc(svc: Service, locale: Locale): string {
  return locale === "en" ? svc.desc_en : svc.desc_sv;
}
