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
 * No UTMs, no `source` (removed 2026-10-12 on David's call: UTMs were never in
 * the brief). Keune's redirect appends its own `?fromKickbackFeeCode=NOVO` with
 * a second `?` whenever the link carries other parameters, which corrupts the
 * last one — so the link carries nothing beyond the optional `pageSlug`. The
 * bare form also shows Keune's "Du har valt salongen" confirmation modal, which
 * the UTM form suppressed.
 *
 * `pageSlug` is percent-encoded (`%2Fp%2F<slug>%2F`) by `URLSearchParams`, while
 * the tested matrix in the planning doc used literal slashes. Keune's salon
 * route reads it from Next's `useRouter().query`, which decodes percent-escapes;
 * the encoded form WAS click-tested in a browser on 2026-10-12 and lands on the
 * product page with the salon set.
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
 * The salon-attributed link to one Keune product, or the bare salon route
 * (Keune's Swedish home page) when `slug` is absent or reduces to nothing.
 * `pageSlug` is the only query parameter it ever carries.
 */
export function keuneLink(slug?: string): string {
  const url = new URL(SALON_ROUTE);
  const bare = keuneSlug(slug);
  if (bare) url.searchParams.set("pageSlug", `/p/${bare}/`);
  return url.toString();
}

/** The salon-attributed link to Keune's Swedish home page (no product, no query string). */
export function keuneGenericLink(): string {
  return keuneLink();
}
