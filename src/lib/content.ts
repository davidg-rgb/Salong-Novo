import staffData from "../../content/staff.json";
import servicesData from "../../content/services.json";
import awardsData from "../../content/awards.json";
import brandsData from "../../content/brands.json";
import coursesData from "../../content/courses.json";
import productsData from "../../content/products.json";
import type { Locale } from "../i18n/routes";
import { getSite } from "./site";
import { servedUrl } from "./media";
import { keuneLink } from "./keune";
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
  /**
   * The stylist's own Keune favourites: product `slug`s from
   * `content/products.json`. Ships EMPTY for every stylist — nobody has chosen
   * yet, and an invented pick would put words in a named person's mouth. A slug
   * the product list does not carry is dropped at render (`resolvePicks`).
   */
  picks: string[];
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

/**
 * The Keune product lines the shop page groups by, in render order. A row whose
 * `line` is none of these is not rendered — the admin label lists the four
 * values, and `groupProducts` is where the rule lives.
 */
export const PRODUCT_LINES = ["care", "style", "1922", "so-pure"] as const;
export type ProductLine = (typeof PRODUCT_LINES)[number];

/**
 * One curated Keune product on `/butik` (`/en/shop`).
 *
 * `slug` is Keune's own `/se/p/<slug>/` segment and the only link input — the
 * CTA is always built by `keuneLink()` in `src/lib/keune.ts`, never stored, so
 * every click carries the salon attribution. `price` is Keune's SEK price as
 * text (`"299.00"`) at the document's `_synced` date; `productPrice` formats it.
 * A blank `image` renders a typeset card, which is also the removal path if
 * Keune declines permission for its product renders.
 */
export interface Product {
  slug: string;
  line: string;
  title: string;
  price: string;
  image?: string;
  blurb_sv: string;
  blurb_en: string;
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

export function getProducts(): Product[] {
  return productsData.products as Product[];
}

/**
 * The date the product prices were last read from Keune's feed (`_synced` in
 * `content/products.json`, rewritten by `npm run keune:update`). The shop page
 * prints it beside "Pris hos keune.com", because the price that binds is
 * Keune's at checkout, not ours.
 */
export function getProductsSyncedAt(): string {
  const synced = (productsData as { _synced?: unknown })._synced;
  return typeof synced === "string" ? synced : "";
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
    picks: Array.isArray(row.picks)
      ? (row.picks as unknown[])
          .filter((pick): pick is string => typeof pick === "string")
          .map((pick) => pick.trim())
          .filter((pick) => pick !== "")
      : [],
  };
}

/** How many of a stylist's picks the team modal lists. */
export const MAX_PICKS = 3;

/**
 * A stylist's picks as the team modal's links: the product's title and its
 * salon-attributed deep link, tagged `personal-<stylist slug>` so the kickback
 * report can be read per stylist.
 *
 * Only slugs the product list actually carries survive — an unknown one (a
 * typo, or a product retired from the wall) is dropped silently rather than
 * rendered as a link to a page that may not exist. Duplicates collapse, order is
 * the stylist's, and the list stops at `MAX_PICKS`.
 */
export function stylistPicks(
  stylist: Pick<Stylist, "slug" | "picks">,
  products: readonly Product[],
): { title: string; href: string }[] {
  const bySlug = new Map(products.filter((p) => p.slug !== "").map((p) => [p.slug, p]));
  const seen = new Set<string>();
  const out: { title: string; href: string }[] = [];
  for (const slug of stylist.picks ?? []) {
    const product = bySlug.get(slug);
    if (!product || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ title: product.title, href: keuneLink(product.slug, `personal-${stylist.slug}`) });
    if (out.length === MAX_PICKS) break;
  }
  return out;
}

/**
 * A stylist's first name in the genitive, for "{name} favoriter" / "{name}
 * picks". Swedish adds no -s to a name that already ends in s, x or z
 * ("Chriss favoriter", "Iris favoriter"); English always takes 's.
 */
export function possessiveFirstName(name: string, locale: Locale): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (first === "") return "";
  if (locale === "en") return `${first}'s`;
  return /[sxz]$/i.test(first) ? first : `${first}s`;
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

/**
 * A stored collection row read back as a `Product` — the `asBrand` contract:
 * every property coerced, a missing one blank rather than a crash. `line` is
 * trimmed and lowercased so "Care " from the admin still files under care; a
 * `price` that arrives as a number (a hand-edited payload) is kept as the same
 * two-decimal text the JSON carries.
 */
export function asProduct(row: Record<string, unknown>): Product {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  const price = row.price;
  return {
    slug: text("slug").trim(),
    line: text("line").trim().toLowerCase(),
    title: text("title"),
    price: typeof price === "number" && Number.isFinite(price) ? price.toFixed(2) : text("price"),
    image: text("image") || undefined,
    blurb_sv: text("blurb_sv"),
    blurb_en: text("blurb_en"),
  };
}

/**
 * Products grouped by line, in `PRODUCT_LINES` order, with empty lines left
 * out entirely (no heading over nothing). A row whose `line` is not one of the
 * four is not rendered: there is no fifth heading to put it under, and the
 * admin label names the valid values.
 */
export function groupProducts(
  products: readonly Product[],
): { line: ProductLine; items: Product[] }[] {
  return PRODUCT_LINES.map((line) => ({
    line,
    items: products.filter((p) => p.line === line),
  })).filter((group) => group.items.length > 0);
}

const NBSP = " ";

/**
 * Keune's price text (`"299.00"`) as a Swedish price label: `299 kr`, with the
 * öre shown only when there are some (`299,50 kr`) and thousands grouped
 * (`1 299 kr`). The spaces are non-breaking so a narrow card never strands
 * "kr" on its own line. Anything that is not a plain amount renders as `""` —
 * the card then shows no price at all, never `NaN kr`.
 */
export function productPrice(price: string | null | undefined): string {
  const text = String(price ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return "";
  const [whole = "", fraction = ""] = text.split(".");
  const ore = fraction.padEnd(2, "0");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${grouped}${ore === "00" ? "" : `,${ore}`}${NBSP}kr`;
}

/** Localized product blurb. */
export function productBlurb(product: Product, locale: Locale): string {
  return locale === "en" ? product.blurb_en : product.blurb_sv;
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
