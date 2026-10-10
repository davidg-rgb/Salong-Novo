# Keune salon kickback — how the link works, and how NOVO should use it

Researched 2026-09-29 in a live Chrome session against www.keune.com (Next.js storefront in front of
Shopify, one Shopify store per country; Sweden = `checkout-se.keune.com`). Everything below was
either observed in the browser or read from Keune's shipped JS bundles. Nothing is guessed.

## The mechanism

NOVO's link `https://www.keune.com/salon/6451330/` is the Next.js route `/salon/[kickbackFeeCode]`.
On load it:

1. Calls `GET /api/firebase/get-salon-by-kickback-fee-code?kickbackFeeCode=6451330` and matches the
   code case-insensitively against the salon's `kickbackFeeCode` **or** its `salonNo`. NOVO's record:
   `salonNo 6451330`, `kickbackFeeCode "6451330"` (no vanity code), `qualifiesForKickbackfee true`,
   `salonKickbackfeeMargin 30`, country Sweden, zip 113 40. No `kickbackFeeLocales` → locale is
   derived from country+zip → `se`.
2. Pushes a GTM event `affiliation_salon` with the salonNo.
3. Writes **three localStorage keys** (not cookies) with **no expiry**:
   `selected-se::salonNo = 6451330`, `customer-se::salonNo = 6451330`, `customer-se::salonName = NOVO`.
4. Redirects to `/se` + `pageSlug` (default `/`) + `?fromKickbackFeeCode=NOVO`.

From then on every page shows the black bar "Din salong: NOVO". The `fromKickbackFeeCode` query
parameter does only one thing: it opens the modal "Du har valt salongen: NOVO — På så sätt går en del
av intäkterna från ditt köp till den salong du valt", then is stripped with a shallow `router.replace`.
**Adding `?fromKickbackFeeCode=NOVO` to a URL by hand does not set the salon.** Only the `/salon/`
route writes storage.

The attribution reaches Shopify at the moment the visitor clicks **Kassa** in the cart drawer: the
storefront reads the two salonNo keys from localStorage and POSTs
`/api/shopify/checkout/add-attributes { cartId, attributes: [{salonNo}, {affiliatedSalonNo}], locale }`,
then hands off to Shopify checkout. Verified by querying the cart through the Storefront API after
clicking Kassa: `attributes = [{salonNo: 6451330}, {affiliatedSalonNo: 6451330}]`.

Consequences:

- **Persistence is per browser profile, forever.** Survives closing the tab and the browser. Lost only
  on clearing site data, in a private window, on another device, or when the visitor picks another
  salon (or arrives via another salon's link — last write wins).
- **The visitor pays the same price.** Checked a product with and without the salon: 129 kr both ways.
  The "Få exklusiv rabatt" hero is Keune's own newsletter/loyalty copy, not a salon discount.
- **Logged-in Keune customers** also get the salon stored on their Shopify customer record
  (`set-customer-salon`), which then survives across devices.
- The route itself is `noindex,nofollow`; it renders a spinner and redirects client-side, so it must be
  visited in a real browser (a link prefetch or a bot hit does nothing).

## Link formats — tested

| Link | Lands on | Sets salon | Modal | Notes |
|---|---|---|---|---|
| `https://www.keune.com/salon/6451330/` | `/se/` | yes | yes | The generic link Keune gave NOVO. |
| `https://www.keune.com/salon/6451330/?pageSlug=/p/style-air-flow/` | `/se/p/style-air-flow/` | yes | yes | **Product deep link.** Slug without the `/se` prefix (the route adds it; `/se/se/...` 404s). |
| `https://www.keune.com/salon/6451330/?pageSlug=/p/<slug>/&utm_source=salongnovo&utm_medium=referral&utm_campaign=<c>` | product page | yes | **no** | Keune bug: the redirect appends `?fromKickbackFeeCode=` with a second `?`, so the last param's value becomes `<c>?fromKickbackFeeCode=NOVO`. GA4 sees a corrupted campaign. |
| `...&utm_campaign=<c>&source=novo` | product page | yes | no | **UTM-safe form.** `source` is on Keune's pass-through allow-list and absorbs the mangling; the three UTMs arrive clean. |
| `https://www.keune.com/se/p/<slug>/?fromKickbackFeeCode=NOVO` | product page | **no** | yes | Looks right, does nothing. Do not use. |

Pass-through allow-list on the redirect: `utm_source, utm_medium, utm_campaign, utm_term,
utm_content, mid, gclid, source`. Anything else is dropped. `multi=true` keeps the visitor's current
locale instead of deriving it; irrelevant for NOVO (always `se`).

Trade-off to decide: with UTMs the confirmation modal never shows; without UTMs it does. The black
bar shows either way, and attribution is set either way.

## Data sources for a product surface on salongnovo.se

- **Product URLs (canonical):** `https://www.keune.com/se/pages_sitemap.xml` — 197 `/se/p/<slug>/` URLs
  on 2026-09-29. This slug is what `pageSlug` needs.
- **Prices, handles, availability:** Shopify's public feed `https://checkout-se.keune.com/products.json`
  (190 products, 250/page, all `available: true` at research time).
  155 of the 197 sitemap slugs equal the Shopify `handle`; the rest differ by a `-1` suffix or similar,
  so join on `handle` with the numeric suffix stripped, then on title. Tags worth using: `care new`,
  `new`, `travelsize`, `bundel`, `featured`, `out-of-stock`.
- **Images — NOT from the feed** (corrected 2026-09-30). The feed's `images[].src` files on
  `cdn.shopify.com` are unusable: regenerated copies, not Keune's renders — `style-sea-foam`'s is a
  1024×1024 PNG with a fake checkerboard baked into the alpha (987 KB). The first cut of `/butik`
  shipped those (24 PNGs, 4.9 MB, largest 1.5 MB); they are gone.
- **Images — the source:** each product page `https://www.keune.com/se/p/<slug>/` (fetched with a
  browser-like User-Agent). Its `<script id="__NEXT_DATA__">` carries the gallery keune.com renders;
  the hero is **`props.pageProps.page.productMedia[0].image.desktop.baseUrl`** (`.mobile.baseUrl` is
  the same asset), hosted on Contentful (`images.ctfassets.net`). On all 24 curated pages (2026-09-30)
  entry 0 is the square packshot, 3000×3000 (Claytime 4454×4454); later entries are 16:9 banners or
  `type: "Video"` entries (their `thumbnail` is a video frame). Two traps: `page.thumbnailImage` is
  wrong on at least one page (Vital Nutrition Shampoo's is the conditioner), and `og:image` is a
  different packshot JPEG requested as a 1200×600 fill — usable only as the fallback, with its query
  replaced.
- **The WebP transform:** Contentful's Images API re-encodes on request — append
  `?fm=webp&w=1200&q=80` (replacing any existing query). Sea Foam's 3000×3000 PNG comes back as a
  1200×1200 WebP of 21 KB. `npm run keune:images` does exactly this into
  `public/images/keune/<slug>.webp` (all 24: 1200×1200, 12–30 KB each, 491 KB in total).
- **Permission:** hot-linking would work technically but is not ours to rely on, so the files are
  bundled; product-shot usage is asked for in the same mail as the logo approval (the Keune logo is
  still under the go-live gate). Without it by go-live, the rows' `image` is blanked (typeset cards).

## Options for the NOVO site

**A. Link only (what most salons do).** One "Handla Keune" CTA → generic link. Zero maintenance,
zero product context, visitor lands on Keune's home page and has to find the product. Weakest
conversion.

**B. Curated product wall (recommended first ship).** A `/butik` (or section on `/varumarken`) page
with a hand-picked set of 12–30 products the stylists actually recommend: image, name, price, one
line of "why", CTA → per-product deep link (UTM-safe form). Content lives in `content/products.json`
with `{slug, title, price, image, blurb_sv, blurb_en, tags}`; a `scripts/keune-sync.mjs` pulls
price/availability from `products.json` and the slug from the sitemap at build time so nothing goes
stale, and a content test fails the build if a curated slug disappears from the sitemap. Add a
"Din stylists val" angle: staff → 3 products each, links from the personal page. Every link is a
deep link, so the salon is attributed the moment the visitor lands.

**C. Full mirrored catalogue.** All 190 products, filters by line (Care / Style / Color / 1922 /
So Pure), search. More surface, more maintenance, and it competes with Keune's own site for the same
searches while adding nothing Keune's site does not already do. Only worth it if B proves demand.

Ship B. Measure it: `utm_campaign` per placement (hero, brand page, staff picks, blog post), and ask
Keune for the salon's kickback report cadence so clicks can be reconciled against orders.

## Ask Keune (one mail)

1. A vanity `kickbackFeeCode` (e.g. `novo`) so the link reads `keune.com/salon/novo/` — the route
   already supports it, it is a field on the salon record.
2. Fix or confirm the `?` bug on the redirect when UTMs are present (or confirm the `source=` workaround
   is acceptable).
3. Permission to use product renders on salongnovo.se; whether the `products.json` feed may be
   consumed at build time.
4. Kickback reporting: what NOVO receives, how often, and whether `affiliatedSalonNo` orders are
   listed separately from logged-in-customer `salonNo` orders.
5. Heads-up for their dev team: the `/migrate-kbf-orders` page ships a legacy order export inside
   its public JS chunk (2022 line items). Not our data; they should know.

## Ready-to-use link builder

```ts
export const KEUNE_SALON = "6451330";
export function keuneLink(slug?: string, campaign = "site") {
  const u = new URL(`https://www.keune.com/salon/${KEUNE_SALON}/`);
  if (slug) u.searchParams.set("pageSlug", `/p/${slug.replace(/^\/?(se\/)?p\//, "").replace(/\/?$/, "/")}`);
  u.searchParams.set("utm_source", "salongnovo.se");
  u.searchParams.set("utm_medium", "referral");
  u.searchParams.set("utm_campaign", campaign);
  u.searchParams.set("source", "novo"); // must be LAST: absorbs Keune's '?fromKickbackFeeCode=' append
  return u.toString();
}
```

## Shipped 2026-09-29

Option B is live in the codebase (not yet deployed):

- `src/lib/keune.ts` — the builder above as `keuneLink` / `keuneGenericLink` (constant renamed
  `KEUNE_SALON_NO`), plus slug/campaign normalisation. Every Keune link on the site goes through it.
- `content/products.json` — 24 curated products (care 12, style 6, 1922 4, so-pure 2) with NOVO's own
  blurbs; images `public/images/keune/<slug>.webp` (Contentful renders, see Data sources). Client-editable
  as the "Butiken (Keune)" list in the admin.
- `/butik` + `/en/shop` — the product wall; `utm_campaign` per placement: `butik-<line>`, `butik-all`,
  `varumarken` (the Keune card on Våra brands), `personal-<stylist-slug>` (picks).
  **2026-10-10: products hidden** (client request). The page is the copy plus ONE `butik-all` link
  (`src/components/ShopPitch.astro`); the `butik-<line>` placements are dormant until the grid
  returns. ProductGrid, `products.json`, the admin list and keune-sync are unchanged.
- Stylist picks — a `picks` list on every stylist, rendered in the team modal (max 3); all empty.
- `scripts/keune-sync.mjs` — `npm run keune:check` (fails if a slug leaves the sitemap),
  `keune:update` (prices + `_synced`), `keune:images` (product page → Contentful WebP; exit 1 on any
  MISSING image or failed download). JSON defaults only; D1 rows are the client's.

Open client inputs:

1. **Stylist picks** — each stylist chooses up to three products (slugs from the Butiken list).
2. **Keune image permission** — product renders ship on the same go-live gate as the Keune logo; no
   permission by the domain flip ⇒ blank every row's `image` (typeset fallback).
3. **Vanity code** — ask Keune for `kickbackFeeCode: novo` (item 1 of "Ask Keune"); if granted, change
   `KEUNE_SALON_NO`'s route segment and recompute the Keune literal in `content/brands.json`.

Before the domain flip:

- If the brands collection was ever seeded into D1 ('Kopiera standardlistan'), the Keune row's url in the admin must be set to the salon link literal from content/brands.json — D1 overrides the JSON default.
