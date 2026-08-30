import staffData from "../../content/staff.json";
import servicesData from "../../content/services.json";
import awardsData from "../../content/awards.json";
import brandsData from "../../content/brands.json";
import coursesData from "../../content/courses.json";
import type { Locale } from "../i18n/routes";
import { getSite } from "./site";
import { servedUrl } from "./media";
import type { KvMap } from "./cms/content";

/**
 * The JSON default layer, and the adapters that let the CMS edit it.
 *
 * Two shapes live here. The `get*` accessors return the developer defaults
 * verbatim — they are what `cms.config.ts` hands to each collection as its
 * `jsonFallback`, and what the site renders while nobody has edited a list. The
 * `as*` normalizers go the other way: they take a stored `collection_items`
 * payload (or a default) and hand a component the record it already knew how to
 * render, so a page never branches on where its data came from.
 *
 * Site FACTS are not duplicated here: `getSite` is re-exported from `site.ts`,
 * the kv-aware seam, so there is one merge implementation and one JSON file.
 */
export { getSite, type Site } from "./site";

export interface Stylist {
  name: string;
  slug: string;
  role: string;
  specialty: string;
  instagram: string | null;
  awards: string[];
  bio_sv: string;
  bio_en: string;
  /** A bundled asset path or an R2 media key — see `stylistPhotoUrl`. */
  photo?: string;
}

export interface Service {
  slug: string;
  name_sv: string;
  name_en: string;
  desc_sv: string;
  desc_en: string;
}

/**
 * One product line the salon carries (`/varumarken`, `/en/brands`).
 *
 * `logo` and `product` are the same client-editable image field every other
 * picture on this site uses — a rooted path is a bundled asset, anything else is
 * an R2 media key (`assetUrl`). Both start EMPTY: the brand grid types the name
 * as a wordmark when there is no logo, so the page is complete before a single
 * asset has been sourced and upgrades one upload at a time.
 */
export interface Brand {
  slug: string;
  name: string;
  desc_sv: string;
  desc_en: string;
  /** The brand's own site. Blank renders an unlinked card, not a dead anchor. */
  url: string;
  logo?: string;
  product?: string;
}

/**
 * One course in the education programme (`/utbildning-och-kurser`).
 *
 * The ONLY collection that ships with no defaults, deliberately — the salon has
 * not published a programme yet, and inventing one would put a fake course on a
 * live client site. `content/courses.json` and the carve-out in
 * `tests/cms-config.test.ts` both carry the reasoning.
 */
export interface Course {
  title_sv: string;
  title_en: string;
  /** Free text: "14 oktober", "Hösten 2026", "Två tillfällen i november". */
  when: string;
  desc_sv: string;
  desc_en: string;
  price: string;
  /** Sign-up link. Blank renders the card without a button. */
  link: string;
  image?: string;
}

/** One competition result, flattened out of the nested awards document. */
export interface AwardRow {
  year: number;
  competition: string;
  category: string;
  result: string;
  people: string[];
  photographer: string;
  note: string;
  location: string;
  /** Rooted asset paths and/or R2 media keys — see `assetUrl`. */
  images: string[];
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

export function getBrands(): Brand[] {
  return brandsData.brands as Brand[];
}

export function getCourses(): Course[] {
  return coursesData.courses as Course[];
}

/**
 * The nested award document, one row per result.
 *
 * The JSON groups by year → competition → items because that is how the
 * salon talks about it, but a `collection_items` row is flat by construction:
 * one editable record with every column on it. Flattening here rather than
 * reshaping the JSON keeps the readable document as the source of truth.
 *
 * `images` is carried like any other column. It used to be dropped, because the
 * old build left asset GLOBS (`awards/…/kollektion1_*`) in the JSON and an
 * unresolvable path in an admin form is worse than an absent one — the document
 * now holds explicit rooted paths instead, one per photo, which is exactly the
 * shape the `list` field kind stores and `assetUrl` resolves.
 */
export function flatAwards(): AwardRow[] {
  const rows: AwardRow[] = [];
  for (const group of getAwards()) {
    for (const item of group.items as Record<string, unknown>[]) {
      rows.push({
        year: group.year,
        competition: group.competition,
        category: String(item.category ?? ""),
        result: String(item.result ?? ""),
        people: Array.isArray(item.people) ? (item.people as string[]) : [],
        photographer: String(item.photographer ?? ""),
        note: String(item.note ?? ""),
        location: String(item.location ?? ""),
        images: Array.isArray(item.images) ? (item.images as unknown[]).map(String) : [],
      });
    }
  }
  return rows;
}

export function bookingUrl(kv?: KvMap | null): string {
  return getSite(kv).booking.url;
}

/**
 * A stored collection row read back as a `Stylist`.
 *
 * Defensive on every property: the row is a JSON document the admin wrote, so a
 * missing field is a blank rather than a crashed page. `awards` keeps its array
 * shape (the `list` field kind), and an empty Instagram handle becomes `null` so
 * the grid's existing `?? ""` / truthiness checks behave exactly as they do for
 * a JSON default that has none.
 */
export function asStylist(row: Record<string, unknown>): Stylist {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  const handle = text("instagram");
  return {
    name: text("name"),
    slug: text("slug"),
    role: text("role"),
    specialty: text("specialty"),
    instagram: handle === "" ? null : handle,
    awards: Array.isArray(row.awards) ? (row.awards as unknown[]).map(String) : [],
    bio_sv: text("bio_sv"),
    bio_en: text("bio_en"),
    photo: text("photo") || undefined,
  };
}

/**
 * A stored collection row read back as an `AwardRow`.
 *
 * The awards counterpart of `asStylist`, and defensive for the same reason: the
 * row is a JSON document the admin wrote, so every field is coerced and a
 * missing one is a blank. `year` goes through `Number` because the admin's
 * number input round-trips as text — an unreadable year becomes `NaN`, which
 * `groupAwards` sorts last rather than filing under year zero.
 */
export function asAward(row: Record<string, unknown>): AwardRow {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  const list = (key: string) =>
    Array.isArray(row[key]) ? (row[key] as unknown[]).map(String) : [];
  const year = row.year;
  return {
    year: typeof year === "number" ? year : Number(String(year ?? "").trim() || Number.NaN),
    competition: text("competition"),
    category: text("category"),
    result: text("result"),
    people: list("people"),
    photographer: text("photographer"),
    note: text("note"),
    location: text("location"),
    images: list("images"),
  };
}

/**
 * The URL of a client-editable image, or `null` when there is none.
 *
 * Two shapes reach the same field and both are legitimate. The JSON defaults
 * layer ships imagery as bundled asset paths (`/images/staff/<slug>.jpg`,
 * `/images/awards-2026/<class>-1.jpg`), while the admin's image picker stores a
 * bare R2 media key. A LEADING SLASH is the discriminator — a media key never
 * has one — so an uploaded picture takes over from the shipped default through
 * the same field, with no second code path and no migration.
 *
 * One rule, every image on the site: portraits, award photography, and whatever
 * the next collection ships.
 */
export function assetUrl(value: string | null | undefined, base = ""): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  return trimmed.startsWith("/") ? trimmed : servedUrl(base, trimmed);
}

/**
 * A stored collection row read back as a `Brand` — same defensive contract as
 * `asStylist`: every property coerced, a missing one blank rather than a crash.
 */
export function asBrand(row: Record<string, unknown>): Brand {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  return {
    slug: text("slug"),
    name: text("name"),
    desc_sv: text("desc_sv"),
    desc_en: text("desc_en"),
    url: text("url"),
    logo: text("logo") || undefined,
    product: text("product") || undefined,
  };
}

/** A stored collection row read back as a `Course`. */
export function asCourse(row: Record<string, unknown>): Course {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  return {
    title_sv: text("title_sv"),
    title_en: text("title_en"),
    when: text("when"),
    desc_sv: text("desc_sv"),
    desc_en: text("desc_en"),
    price: text("price"),
    link: text("link"),
    image: text("image") || undefined,
  };
}

/** `assetUrl` under the name the staff grid and the homepage already call it by. */
export const stylistPhotoUrl = assetUrl;

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

/** Localized brand description. */
export function brandDesc(brand: Brand, locale: Locale): string {
  return locale === "en" ? brand.desc_en : brand.desc_sv;
}

/** Localized course title/description. */
export function courseTitle(course: Course, locale: Locale): string {
  return locale === "en" ? course.title_en : course.title_sv;
}
export function courseDesc(course: Course, locale: Locale): string {
  return locale === "en" ? course.desc_en : course.desc_sv;
}
