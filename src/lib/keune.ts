/**
 * The Keune salon link — the ONE builder every "Handla hos Keune" CTA on the
 * site goes through. Mechanism, tested link matrix and the reasoning behind
 * each rule below: `Planning/KEUNE-KICKBACK.md`.
 *
 * What the link does, in one paragraph: `keune.com/salon/<salonNo>/` is a
 * client-side route that writes NOVO's salon number into the visitor's
 * localStorage (no expiry) and redirects to `/se` + `pageSlug`. From then on the
 * checkout carries `salonNo` as a cart attribute, which is what attributes the
 * order to the salon. The visitor pays Keune's normal price. Only the `/salon/`
 * route sets the salon — hand-appending `?fromKickbackFeeCode=` to a product URL
 * opens Keune's modal and attributes nothing. No function here sets that
 * parameter, and `keuneSlug` cuts any query string or fragment off a pasted slug,
 * so a copied address-bar URL cannot carry it in through `pageSlug` either.
 *
 * `source=novo` is set LAST on purpose. Keune's redirect appends its own
 * `?fromKickbackFeeCode=NOVO` with a second `?`, which corrupts whatever
 * parameter happens to be last. `source` is on Keune's pass-through allow-list
 * and nothing reads it, so it absorbs the damage and the three UTMs arrive
 * clean. `URLSearchParams.set` appends a new key at the end, so the order of the
 * calls below IS the order of the query string.
 *
 * `pageSlug` is percent-encoded (`%2Fp%2F<slug>%2F`) by `URLSearchParams`, while
 * the tested matrix in the planning doc used literal slashes. Keune's salon
 * route reads it from Next's `useRouter().query`, which decodes percent-escapes
 * — read in the shipped salon chunk on 2026-09-29, NOT click-tested in a browser
 * in the encoded form. Click one live link before relying on it at go-live.
 */

/** NOVO's `salonNo` at Keune. No vanity `kickbackFeeCode` yet — see the planning doc's "Ask Keune". */
export const KEUNE_SALON_NO = "6451330";

const SALON_ROUTE = `https://www.keune.com/salon/${KEUNE_SALON_NO}/`;

/** Every salon-attributed Keune link starts here, whichever salon code it carries. */
const SALON_ROUTE_PREFIX = "https://www.keune.com/salon/";

/**
 * Is this href a salon-attributed (kickback) Keune link? Those are the links
 * that must carry `rel="sponsored"` — the salon earns on the click. A plain
 * `https://www.keune.com/…` link is not one.
 */
export function isKickbackLink(href: string | null | undefined): boolean {
  return String(href ?? "").trim().startsWith(SALON_ROUTE_PREFIX);
}

/**
 * A Keune product slug reduced to its bare form (`style-air-flow`), or `""`
 * when there is no product to point at.
 *
 * Accepts what a person would paste: the whole address-bar URL
 * (`https://www.keune.com/se/p/style-air-flow/?fromKickbackFeeCode=NOVO`), the
 * path (`/se/p/style-air-flow/`), the route-relative one (`/p/style-air-flow`),
 * or the slug with stray slashes and whitespace. The origin goes first, then
 * everything from the first `?` or `#` — a query string or fragment is never
 * part of a product slug — and then the `/se` prefix, which the salon route adds
 * itself (`/se/se/p/…` is a 404).
 */
export function keuneSlug(slug?: string | null): string {
  return (slug ?? "")
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/[?#][\s\S]*$/, "")
    .replace(/^\/?(se\/)?p\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/**
 * A `utm_campaign` value in the `[a-z0-9-]` alphabet: lowercased, diacritics
 * folded (`personal-linnea-hellström` → `personal-linnea-hellstrom`), anything
 * else collapsed to a single hyphen. An input with nothing usable left becomes
 * `site`, the default placement, rather than an empty campaign.
 */
export function keuneCampaign(campaign: string | null | undefined): string {
  const clean = String(campaign ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "site";
}

/**
 * The salon-attributed link to one Keune product, or to Keune's Swedish home
 * page when `slug` is absent or blank.
 *
 * `campaign` names the PLACEMENT (`butik-care`, `personal-chriss-berner`,
 * `varumarken`) so clicks can be reconciled against the kickback report per
 * surface.
 */
export function keuneLink(slug?: string, campaign = "site"): string {
  const url = new URL(SALON_ROUTE);
  const bare = keuneSlug(slug);
  if (bare) url.searchParams.set("pageSlug", `/p/${bare}/`);
  url.searchParams.set("utm_source", "salongnovo.se");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", keuneCampaign(campaign));
  // Must stay LAST — see the module comment.
  url.searchParams.set("source", "novo");
  return url.toString();
}

/** The salon-attributed link to Keune's Swedish home page (no product). */
export function keuneGenericLink(campaign = "site"): string {
  return keuneLink(undefined, campaign);
}
