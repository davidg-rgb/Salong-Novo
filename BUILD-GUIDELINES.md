# Salong NOVO v2 — Build Guidelines

How to extend this codebase without breaking its grain. Read once before contributing.

---

## Golden rules

1. **Logic is pure and tested; `.astro` is thin presentation.** If you write branching/parsing/
   formatting logic, put it in `src/lib` (or `src/i18n`) with a test in `tests/`. Components
   call into it. This is *why* a design change never touches logic.
2. **Never hardcode user-facing strings in components.** Add them to `src/i18n/ui.{sv,en}.json`
   and read with `t(locale, "key")`. Long-form copy goes in `src/lib/pagecopy.ts` (+ `content/copy.md`).
3. **Never hardcode the booking URL, address, phone, hours.** They live in `content/site.json`
   (`getSite()`, `bookingUrl()`). Single source of truth.
4. **Blog body is Markdown, rendered with `renderMarkdown()`** (html disabled). Never inject
   raw HTML from the DB into the page any other way.
5. **Every nav-reachable route exists in both locales.** Add the SV page and the `/en` mirror
   together, and ensure the `pageKey` is in `ROUTES` (`src/i18n/routes.ts`).

---

## Adding a page

1. Add the route to `PageKey` + `ROUTES` in `src/i18n/routes.ts` (SV + EN slug).
2. Add nav labels to `ui.sv.json` / `ui.en.json` under `nav.*` (and to `navKeys` in
   `SiteHeader.astro` if it should appear in the menu).
3. Create `src/pages/<sv-slug>.astro` and `src/pages/en/<en-slug>.astro`. Keep them thin:
   import `Base` + a content component, pass `locale`, `pageKey`, `title`, `description`.
4. Long-form copy → `src/lib/pagecopy.ts` (SV canonical, EN draft). Structured data → `content/*.json`.
5. `hreflang` alternates and JSON-LD come automatically from `Base.astro`.

## Adding a server (D1-backed) route

- Add `export const prerender = false;` at the top.
- Read the binding via `bindings()` from `src/lib/cms/bindings.ts` (defensively — it's undefined
  during static build). Wrap queries in `.catch(() => fallback)`.
- Use the `src/lib/db.ts` helpers; don't write inline SQL in pages.

## Adding an admin route (`/admin/*` or `/api/admin/*`)

The admin panel (ARCHITECTURE §10) is **built**. Extend it in the same grain:

1. **Auth is automatic.** `src/middleware.ts` already gates `^/(admin|api/admin)(/|$)` — it
   verifies the Cloudflare Access JWT (`src/lib/access.ts`, pure + tested) and populates
   `Astro.locals.user`. A new admin route inherits the gate for free; never re-implement auth.
   Locally, identity is synthesized from `DEV_ADMIN_EMAIL` in `.dev.vars` (Access can't gate
   `localhost`); in prod the JWT branch runs and `DEV_ADMIN_EMAIL` must be absent
   (`assertNoDevBypassInProd` enforces this).
2. **Pages render in `AdminBase.astro`** (Swedish-only, `noindex`, no public chrome) — never the
   public `Base.astro`. Pass `userEmail={Astro.locals.user?.email}`. AdminBase injects the
   defense-in-depth `<meta name="admin-token">` that the client controllers echo as
   `x-admin-token` on writes.
3. **API routes:** `export const prerender = false`, guard the `DB` off `bindings()`/`Astro.locals.db` (503
   `db_unavailable`), keep the `authorized()` token check, and on **every write** call
   `isSameOriginWrite(request, env.PUBLIC_SITE_URL)` (CSRF → 403). All request/response shapes
   come from `src/lib/admin-api.ts` — never declare a local `Body`. Untrusted JSON is normalized
   by `parsePostWrite` (`src/lib/admin-validate.ts`); 2xx bodies carry `ok:true`, non-2xx are the
   `ApiError` envelope. Use the §10.5 status matrix.
4. **Client JS** is vanilla TS in `src/admin/*.client.ts` — no framework, no `client:*`. Keep all
   logic in the pure tested core (`src/lib/editor.ts`); the controller only does DOM glue. Live
   Markdown preview goes through `POST /api/admin/preview` (the *same* `renderMarkdown` the public
   page uses) so preview == production. Target < 8 KB client JS.
5. **Admin strings** live in `src/lib/admin-strings.ts` (`ADMIN` const, Swedish), never in the
   public `ui.*.json`. Admin CSS is `src/styles/admin.css` on the dark token theme (WCAG AA body
   text via `--snow`/`#d8d8d8`, not `--muted`).
6. **Slug policy is the server's:** `resolveSlug` (`src/lib/slug.ts`) freezes a published post's
   slug; `nextPublishedAt` (`src/lib/posts.ts`) owns the publish-date transition. Don't reimplement
   either in a route.

---

## Styling & design tokens

- `src/styles/tokens.css` holds the **LOCKED "Haute Editorial" tokens** (charcoal/cream/bronze
  /terracotta/champagne + the `--snow`/`--gold`/`--muted`/`--line` aliases kept for back-compat).
  Restyle component CSS against these vars — **do not** rename the token variables used across
  components.
- Component-scoped styles live in each `.astro` `<style>` block. Global tokens/reset/fonts only in
  `tokens.css` + `Base.astro`'s global block.
- The authoritative spec is `Planning/DESIGN-SYSTEM.md` (+ ARCHITECTURE §11); the rendered
  reference is `Design input/Stitch mockups/novo-editorial-enhanced/index.html`. Role rule:
  **terracotta = action (the only filled button), bronze = texture (never a button), champagne =
  surface (footer band).** Real NOVO competition imagery via R2 is a pending content task; the
  mockup placeholders are durable stand-ins.

## Accessibility (non-negotiable)

- Semantic HTML (`<header><nav><main><footer>`, real `<button>`/`<a>`), one `<h1>` per page.
- Visible `:focus-visible`, keyboard-operable modal (Esc closes — see `StaffGrid.astro`).
- Contrast ≥ 4.5:1 for body text; respect `prefers-reduced-motion` (already in `tokens.css`).
- Every meaningful image has `alt`; decorative images `alt=""`.

## Performance

- Static-first; only blog/admin are server. Keep it that way.
- Images: render via `responsiveImageAttrs()` + `parseVariants()` — they gracefully serve the
  original when no WebP variants exist yet (the variant Worker is deferred, §10.7), so no image
  ever 404s. `loading="lazy"` below the fold.
- No heavy client JS — the staff modal is ~30 lines of vanilla JS; the admin editor controller is
  < 8 KB and ships no framework / no markdown-it. Keep islands tiny.
- Target Lighthouse ≥ 90 mobile across Perf/A11y/Best-Practices/SEO.

## Security

- Secrets only in Cloudflare env / `.dev.vars` (gitignored). Never commit `.env*`, keys, tokens.
- Admin is Cloudflare-Access-gated; the token check is defense-in-depth, not the primary gate.
- Validate uploads (type allowlist, size cap). Markdown render stays `html:false`.

---

## Testing

- Anything in `src/lib` / `src/i18n` ships with a `tests/*.test.ts`. Run `npm test`.
- Test the behaviour, not the implementation. Security properties (e.g. "no live `<img onerror>`")
  get explicit adversarial tests.
- CI gate before merge: `npm test` green **and** `npm run typecheck` clean **and** `npm run build` green.

## Git

- Branch off `main`; small, focused commits. Conventional-ish messages
  (`feat(blog): …`, `fix(i18n): …`, `chore: …`).
- Remote: `github.com/davidg-rgb/Salong-Novo`. Don't commit `node_modules/`, `dist/`, `.env*`,
  `.wrangler/` (all gitignored).
- Don't commit until asked; never push secrets.

---

## The standard

This is client work to a high bar: complete, tested, documented. Don't ship a workaround when
the real fix is in reach; don't leave a dangling thread when tying it off is five minutes. If
something is genuinely deferred, say so explicitly (as in `ARCHITECTURE.md §9`) — never hide it.
