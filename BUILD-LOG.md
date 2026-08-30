# Forge CMS Retrofit — Build Log

Salong NOVO v2 · started 2026-08-11 · orchestrated autonomous run (no check-ins per David's GO)

**Plan of record:** evaluation in session transcript 2026-08-11; adoption per `docs/cms/RUNBOOK.md` §3
with §8 dry-run clash list; reference implementation `projects/nicole-olmedo/`.

**Gate protocol (between every phase):** full `npm run test` + `npm run typecheck` + `npx astro build`
run by the orchestrator (not trusted from the builder's report), results logged here, then a
checkpoint commit at the workspace repo (branch `main`, baseline `3e99cc5`, no remote).

| Phase | Content | Status |
|---|---|---|
| A | Platform migration: Astro 5.16→^7.1.6, adapter ^12 Pages → ^14 Workers+Static Assets, Vitest 3→4 + vite ^8, `bindings.ts` doorway, `IMAGES`→`MEDIA` | IN PROGRESS |
| A-gate | Test/typecheck/build gate + landmine spot-check (prerender flags, wrangler shape, no platformProxy) + commit | pending |
| B1 | Forge core adoption per RUNBOOK §3: copy core, five seams, 32-token CSS contract, migrations incl. hand-written `media` ALTER merge, fail-closed middleware swap (closes GAP 1 + GAP 2), port template tests incl. `build-gates.test.ts` | pending |
| B1-gate | Test/typecheck/build gate + commit | pending |
| B2 | `cms.config.ts` authored for NOVO (page-copy groups, staff/services/awards collections, site facts), pages rewired to SSR-from-D1, blog untouched, merged adminNav | pending |
| B2-gate | Test/typecheck/build gate + local acceptance trace + commit | pending |
| Review | Fable reviewer over full retrofit → builder fixes → final gate + commit + /remember | pending |

Known landmines being tracked (from RUNBOOK §8 + review-proven list):
1. `CREATE TABLE IF NOT EXISTS media` silently no-ops on the existing differently-shaped table → hand-written ALTER required.
2. Every admin/api/SSR-content file needs `prerender = false` line 1 (missed page = auth bypass via Static Assets; prerendering bakes local D1 into shipped HTML).
3. Single Vite major only (else `Missing field moduleType`).
4. `wrangler.toml` must not declare `pages_build_output_dir` / v13-era `platformProxy`.
5. Services-style `list` field kind required for bilingual bullet arrays or first admin save destroys them.
6. When Phase 6 ops later write real ACCESS_* into `[vars]`, `.dev.vars` must shadow them back to `""`.

---

## Log entries

### 2026-08-11 ~13:30 — Phase A launched
Builder `builder-phase-a` (Opus) dispatched with the platform-migration Directive.
Baseline before any change: 246 tests / 14 files green (verified during survey), `tsc` clean,
project never deployed (D1 `database_id` placeholder), workspace committed at `3e99cc5`.

### 2026-08-11 16:00 — Phase A COMPLETE · A-gate PASSED (orchestrator-verified)
Builder delivered: astro 7.2.0 · @astrojs/cloudflare 14.2.0 (Workers+Static Assets) ·
vitest 4.1.10 · single vite 8.2.1 · `src/lib/cms/bindings.ts` byte-identical to template ·
IMAGES→MEDIA rename · 18 files routed through `await bindings()` · zero Astro 5→7 page-code breakage.

**Gate results (run by orchestrator, not taken from builder report):**
- `npm run test` → **246 passed / 14 files**, 1.41s
- `npm run typecheck` → clean
- `npx astro build` → Complete (server 4.32s, immutable _headers injected)
- Landmine greps: uncommented `pages_build_output_dir` = none · `platformProxy` = comment only ·
  `prerender = false` files = 14 (all intact) · `locals.runtime` in src = 0 · `env.IMAGES` = 0 ·
  `dist/client/admin` absent (no prerendered admin ⇒ no Static-Assets auth bypass)
- Builder smoke (accepted): `/` `/blogg` `/admin` 200 on local D1; `/api/media/<missing>` 404
  (MEDIA binding resolves); `/api/admin/posts` 401 (DB resolves, auth precedes)

**Accepted deviations:** (1) `@types/node` added — required for `fileURLToPath` typecheck, matches
nicole; (2) `session: false` deferred to B1 (else deploy auto-provisions unused SESSION KV) — folded
into B1 Directive; (3) binding guards inline at call sites instead of via locals — correct call since
B1 replaces middleware wholesale.

**Carried into B1:** stale-doc fix list (BUILD-GUIDELINES.md:36,54; .dev.vars.example; ARCHITECTURE.md
×12 lines; CLAUDE.md stack line — all still teach the illegal v12 binding pattern), `session: false`,
32-token CSS contract, hand-written `media` ALTER merge.

### 2026-08-11 16:30 — Phase B1 COMPLETE · B1-gate PASSED (orchestrator-verified)
Builder `builder-b1` delivered: 44 core files vendored (33 byte-identical, 11 recorded divergences),
`FORGE-MANIFEST.json` written, five seams wired (`routes.ts` needed nothing), fail-closed middleware
live (`access-header` trust tier REMOVED, `assertNoDevBypassInProd` now actually called — both
pre-existing security gaps closed), media table merged via hand-written `0002` ALTER (proven live:
one upload row satisfies both blog and Forge consumers), 239 template tests ported, ~30 doc lines
fixed across 5 files (zero v12 patterns left).

Load-bearing merge decisions (builder, ratified): Forge dashboard takes `/admin`, blog list → `/admin/posts`
via adminNav; core `admin.css` adopted, blog sheet → `admin-blog.css`; core `AdminNav` replaces
hand-written nav (config-driven).

**Gate results (orchestrator-run):**
- `npm run test` → **485 passed / 24 files** (246 baseline + 239 ported), 2.10s
- `npm run typecheck` → clean · `npx astro build` → Complete, no SESSION KV notice
- Greps: `prerender = false` files = 22 · `assertNoDevBypassInProd` call sites = 2 ·
  header-trust remnant = doc comment only · all 11 core lib files present
- Builder smoke (accepted): Forge dashboard + `/admin/posts` + `/admin/media` 200 on local D1;
  blog POST 201 + upload round-trip; **fail-closed 403 proof** with dev identity unset (HTML noindex
  for UI, JSON for API, public routes stay 200); tripwire probe → 403 `misconfigured`, no 500

**Carried into B2:** add `@astrojs/check` + `check` script (last RUNBOOK stack-floor item);
arm the vacuous `cms-config` loops by authoring the real config; `mediaPrefix` stays `"blog/"`
(media library lists by prefix — changing it would orphan every existing key); `posts/[id]` API is
GET-only by design (writes go to `/api/admin/posts?id=`), not a regression.

### 2026-08-11 17:08 — Phase B2 COMPLETE · B2-gate PASSED (orchestrator-verified)
Builder `builder-b2` delivered the real content model: 4 site-fact groups / 19 fields (hours marked
placeholderUntilEdited), 14 editableCopy pages / 59 keys (unrendered dictionary keys deliberately
excluded), collections staff (8 fields / 18 JSON defaults) + services (bilingual `list` bullets —
landmine 5 covered by a round-trip test) + awards (flattened from the nested JSON), 4 usageQueries.
All 22 public pages flipped to SSR-from-D1 (Base.astro reads CMS for JSON-LD ⇒ every page is a
content reader); only robots/sitemap stay static; build-gates extended to assert exactly that.
`@astrojs/check` added — found 2 real .astro errors `tsc` cannot see; both fixed.

**Recorded divergence:** `src/lib/collections.ts` wraps core `loadCollection` — zero rows falls back
to JSON defaults (nicole seeds D1; the no-seed provenance model here needs the fallback or a fresh
DB renders an empty team grid). One row ⇒ D1 wins entirely. Proven both directions.

**Gate results (orchestrator-run):** `npm run test` → **529 passed / 25 files** · typecheck clean ·
`npm run check` → 0 errors / 0 warnings / 6 pre-existing hints · `npx astro build` → Complete ·
`prerender = false` files = 42 · `dist/client/admin` absent.
Builder smoke (accepted): 22/22 routes 200 on defaults; provenance PUT→visible→DELETE→default for
copy AND facts; staff 18→1→delete→18; bullets survive PUT; dashboard placeholder count ("Öppettider —
3 fält kvar"); fail-closed 403 sweep; blog intact; UTF-8 byte-exact.

**FINDING promoted to review phase — template trap:** core `mergeSiteOverrides` silently drops
site-fact keys with <2 segments (`content.ts:284`) — a flat `site.json` (top-level scalars like
`phone`) saves `{"ok":true}` yet changes nothing. NOVO worked around it by nesting facts under
`brand`/`contact` + tests forbidding root scalars. `_templates/forge-cms` still carries the trap for
the next consumer.

### 2026-08-11 17:21 — REVIEW COMPLETE · fixes applied · FINAL GATE PASSED — RETROFIT DONE
Fable adversarial review verdict: **ship** — 0 blockers, 0 warnings, 3 NOTEs. The reviewer
re-verified the gates itself and traced the hard claims to source: the encoded-path/double-slash
admin bypass is impossible (Astro normalizes+decodes the pathname BEFORE middleware; multi-level
encoding 400s), the media merge is complete on both writer/reader paths incl. pre-existing rows,
build-gates walks the tree so future pages can't slip past the prerender rule, usageQueries can
only over-match (safe direction), and `getCms()` is memoized per request via the middleware thunk.

Two NOTEs fixed immediately (orchestrator, prime directive — five-minute permanent fixes):
1. **Blog `authorized()` aligned with the CMS guard** — was `return true` when `ADMIN_API_TOKEN`
   unset; now `return !import.meta.env.PROD` in all 4 route files (posts, posts/[id], media,
   preview). Prod fails closed even in the defense-in-depth layer; local dev unchanged.
2. **Template `mergeSiteOverrides` trap fixed at the source** — `_templates/forge-cms` guard
   `< 2` → `< 1` (root-level site keys now merge; `containerAt([])` returns the root), two
   root-leaf tests added to the template's `cms-content.test.ts`, RUNBOOK §3 shape-trap note for
   pre-fix vendored cores, ARCHITECTURE §16 **Amendment 15** recorded. NOVO's vendored copy
   deliberately unchanged (safe by shape + tests forbid root scalars; next re-sync picks it up).
Third NOTE (last-row delete resurrects JSON defaults on the public grid) stays a documented
deferral with the "Kopiera standardlistan" affordance follow-up.

**FINAL GATE (orchestrator-run, post-fix):** `npm run test` → **529/529** · typecheck clean ·
`npm run check` → 0 errors (6 pre-existing hints) · `npx astro build` → Complete.

**RETROFIT COMPLETE.** salong-novo-v2 now runs the Forge CMS on the Forge stack floor.
Remaining before launch is ops + content, not code: Cloudflare account provisioning (D1/R2/Access
per RUNBOOK §5), client content per the 2026-06-01 IA (CLAUDE.md §12 page migration is a separate
design/build task), imagery, DNS.

### 2026-08-11 19:45 — FIRST CLOUD DEPLOY (David's test account) — LIVE
Deployed to David's personal Cloudflare account (test/staging; migrates to Salong NOVO's account
at handover — nothing account-specific in code). URL: **https://salong-novo.david-geborek.workers.dev**

Provisioned per RUNBOOK §5 pattern: D1 `novo_db` created (EEUR, id `61a664e1…` now in
wrangler.toml), migrations 0001–0003 applied remote (6 tables verified), R2 `novo-images` created
(account R2 = FREE TIER: 10 GB / 1M Class A / 10M Class B per month — shared budget across ALL
projects on this account), `ADMIN_API_TOKEN` secret set (random, never recorded anywhere — the
admin page injects it server-side; local dev uses its own via .dev.vars).

**Deploy command of record:** `npm run build` then
`npx wrangler deploy --config dist/server/wrangler.json` (the adapter-generated config; auth via
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` env vars sourced from the workspace `.env.local`).

**Live verification:** ALL 22 public routes 200 · robots/sitemap 200 · `/admin` + `/api/admin/*`
403 fail-closed (correct: Access can only gate a ZONE, not *.workers.dev — cloud admin testing
needs a real domain added; RUNBOOK §5.5) · `/api/media/<missing>` 404 · today's staff bios
confirmed live (Emma's maternity note renders on /personal).

**Gotcha for the file:** ~2 min after first-ever deploy, three routes (/blogg, /en/staff, /admin)
returned correct BODIES with status 404 — first-deploy edge propagation on a brand-new Worker,
NOT a build defect (same artifact locally via `wrangler dev --config dist/server/wrangler.json`
was correct; remote self-healed minutes later). Don't debug status anomalies in the first minutes
after a first deploy.

**Cosmetic on test deploy:** canonical URLs/JSON-LD reference `https://salongnovo.se` (from
wrangler.toml [vars]) — correct at DNS cutover, harmless meanwhile.

### 2026-08-12 00:45 — REAL IMAGERY LANDED: 18 portraits + 16 award shots fetched, textures generated, all wired
**Photos (real, fetched — NOT generated):** all 18 stylist portraits harvested from the live site
(`salongnovo.se/img/personal/<slug>.jpg`, professional studio set, 800x1000) plus all 16 Årets
Frisör 2026 competition images (`/img/arets_frisor_2026/`), optimized into
`public/images/staff/` + `public/images/awards-2026/` (typo "anvantagrde"→"avantgarde" fixed in
our filenames). Faces of real people are never AI-generated — fetch-first was the rule.

**Wiring (builder-photos, 537/537 tests):** `Stylist.photo` mapped end-to-end (was orphaned);
`stylistPhotoUrl()` helper — leading `/` = static asset, else R2 media key via `/api/media/`;
portraits render in StaffGrid + modal + Home team cards under the existing bronze duotone
(`mix-blend-mode: color`, fades on hover → true colour); monogram stays the no-photo fallback
(proven); hair strip rebuilt as a named region with 5 award images + localized alts
(`home.galleryAlt`); new repo gate test: every referenced `/images/…` path must exist in `public/`.

**Ratified core divergence (#15 in FORGE-MANIFEST):** `collections.ts` `kind:"image"` accepts a
rooted STATIC_ASSET path alongside MEDIA_KEY — without it, saving an unedited stylist failed
`bad_shape` on the untouched photo field. Protocol-relative and absolute URLs still refused
(test-pinned). Template deliberately unchanged (nicole seeds real media keys); candidate for
template adoption at a third JSON-default-images consumer.

**Generated textures (Gemini `gemini-2.5-flash-image`, scope approved by David: abstract only):**
6 candidates (hair macro / ink silk / bronze brushwork × 2), 2 curated in:
`public/images/textures/hair-band.jpg` (Home full-bleed divider band before the champagne
closing band) + `silk-band.jpg` (site-wide black footer backdrop under a 0.9 ink overlay —
reads as sheen, text contrast unchanged). 4 rejected (vortex gimmick, gold too dominant ×2,
X-shape reads as error). GEMINI_API_KEY lives in workspace `.env.local`.

**Gate:** 537/537 · typecheck clean · `astro check` 0 errors · build green · 18 portraits in dist.
**Ops note:** killed an orphaned `wrangler dev` (TaskStop kills the shell but not the child on
Windows — use `taskkill //PID <pid> //T`); RUNBOOK's `--persist-to` warning is exactly this.

**Deliberate deferrals (logged, not bugs):** `showPrices` stays a developer flag (no toggle renderer
in FormField; string round-trip would corrupt the boolean); services/awards admin-editable but
publicly unrendered (rendering would publish unconfirmed prices — design task); two homepage stat
labels still hardcoded Swedish on EN (moving them changes EN output pre-signoff); unseeded
collections show an empty admin list while public renders JSON defaults — a "Kopiera standardlistan"
affordance is a worthy follow-up.

### 2026-08-23 10:30 — STAGING DOMAIN + ACCESS LIVE · Tävlingar page real · admin "Kopiera standardlistan" · staging noindex · site-wide mobile gutter fix
**Ops (David's account, zone `bottomsup.fun` transferred in 2026-08-23):** `novo.bottomsup.fun` attached
as a Workers custom domain on `salong-novo` (cert issued); Access app **"salong-novo admin (staging)"**
on the existing Zero Trust org (`weathered-shadow-4287.cloudflareaccess.com`) covering
`novo.bottomsup.fun/admin` + `/api/admin`, policy `david-only` (same allow-list as the scalpbot app).
`wrangler.toml [vars]`: `PUBLIC_SITE_URL = https://novo.bottomsup.fun` (CSRF origin + canonicals
follow it), real `ACCESS_AUD` (`a5e23b0c…`) + `ACCESS_TEAM_DOMAIN`, and `PUBLIC_SITE_NOINDEX = "1"`.
`.dev.vars` got the RUNBOOK §4.3 shadow lines (`ACCESS_AUD=""`, `ACCESS_TEAM_DOMAIN=""`) — they were
MISSING, so local dev would have died at this exact step. **Flip `PUBLIC_SITE_URL` back to
`https://salongnovo.se` and `PUBLIC_SITE_NOINDEX` to `""` when the project moves to the client's account.**
Live verification after deploy: ACCESS vars survived (`scripts/salong-novo/settings` bindings), every
route 200 + `X-Robots-Tag: noindex, nofollow`, robots body `Disallow: /`, `/admin` + `/api/admin/*`
302 → Access login with the right `kid`, `*.workers.dev/api/admin/*` still 403 `no_token` (bypass
refused). Zone note: Cloudflare's managed "Content Signals" robots.txt is ON for the zone and prepends
its own `User-agent: * … Allow: /` block above ours — harmless (meta + header noindex carry the
weight), but it is a zone setting, not code.

**Tävlingar page (builder-tavlingar, Opus):** `/tavlingar` + `/en/competitions` now render the full
record year → competition → result with **46 photographs**: 16 × 2026 (already in repo) + 26 × Årets
Frisör 2025 + 4 × Nordic Hairshot 2025 migrated from the old build donor (`salong-novo/public/awards/`,
donor untouched; resized to h≤1400, q82 mozjpeg, 4.7 MB → 3.0 MB) into `public/images/awards-2025/`
+ `public/images/nordic-hairshot-2025/`. `content/awards.json` carries explicit rooted `images[]`
(old `awards/…/*` globs removed) and the three 2025 entries that had `people: []` are filled from the
donor's AWARDS_MAPPING (Brud/Dam = Chriss Berner, Avantgarde = Ola Oterkjaer, foto Andreas Lundberg).
New pure module `src/lib/awards.ts` (`groupAwards`, `resultTone`, `resultLabel`, `awardImages`,
`peopleLine`; 26 tests) + `CompetitionsPage.astro`; `AwardRow.images` + `asAward()` in content.ts;
`stylistPhotoUrl` generalized to `assetUrl` (alias kept); AWARDS collection gained an `images` list
field (rooted static path or media key — same validators as divergence #15, restated because the
core's are module-private). **Namespace finding:** `DICTS` is a shallow spread of `ui.*.json` over
`pageCopyDict()`, so a top-level `competitions`/`home` object in `ui.*.json` would be silently replaced
wholesale — UI strings went under `awards.*`; `home.statCollection` lives in pagecopy (not allowlisted
⇒ not client-editable). SV prints the client's own result wording verbatim ("Finalist (Sverige)");
EN translates the tone word. Gate extended: every `awards.json` photo must exist in `public/`
(proven non-vacuous). Home EN stat label "Årets Kollektion" → "Collection of the Year" (the only
untranslated literal reaching EN; "Est." and the gallery class names are deliberate).

**Admin "Kopiera standardlistan" (builder-seed, Opus):** the handover landmine is closed — an empty
collection whose JSON defaults exist now shows a notice + one button that POSTs `{seed:true}` to the
collection's own endpoint (third discriminator next to `{ids}` / `{data}`); server
`seedCollectionFromDefaults()` in `src/lib/collections.ts` validates ALL defaults first, inserts in
JSON order (sort_order 0…17 = file order, pinned), 409 `not_empty` on any existing row, 500
`invalid_default` (+index/field, logged) if a default ever fails the validator. Strings in
`src/lib/cms/strings.sv.ts` (the per-project chrome file — already diverged for NOVO; accepted).
14 tests. Template-adoption candidate for `_templates/forge-cms`.

**Staging noindex switch (builder-noindex, Opus):** `PUBLIC_SITE_NOINDEX` (build-time `PUBLIC_` var,
read once in `src/lib/seo.ts`) ⇒ robots.txt `Disallow: /` (no sitemap line), `<meta name="robots"
content="noindex, nofollow">` in Base, `X-Robots-Tag` stamped on the two non-admin middleware exits
(admin paths keep their own deliberate values). Production output with the var unset is
byte-for-byte unchanged (cmp-proven). `/images/*` and prerendered `sitemap.xml` are served by Static
Assets ahead of the middleware ⇒ no header there; robots covers them. 17 tests.

**Site-wide mobile bug found in the visual review (Fable, fixed directly):** six components put
`padding: var(--section) 0` on the SAME element that carries `.wrap`; the scoped rule outranks
`.wrap`'s `padding: 0 var(--mx)`, so every page section had **zero side gutters on phones** (Team,
articles, contact, blog, post, competitions) — live on the test deploy since 08-11, masked on desktop
by `margin: auto`. Changed to `padding-block: var(--section)` in ArticlePage / BlogList /
ContactPage / PostView / StaffPage / CompetitionsPage. Probed all 16 public routes at 390 px: text
left edge 24 px everywhere, zero horizontal overflow.

**Gate (orchestrator-run):** `npm test` → **597/597 (28 files)** · `tsc` clean · `astro check` 0 errors
(6 pre-existing hints) · `astro build` Complete · `dist/client/admin` absent · 30 new photos in dist.
**Deployed:** `npx wrangler deploy --config dist/server/wrangler.json` → https://novo.bottomsup.fun
(also still on salong-novo.david-geborek.workers.dev).
**Ops gotcha:** a local `wrangler dev --config dist/server/wrangler.json` holds `dist/client` open —
`astro build` then dies with `EPERM … dist\client`. Kill the whole tree (npx → wrangler.js → cli.js →
workerd ×2) by PID before rebuilding; `taskkill //IM workerd.exe` alone leaves the node parents and
the lock.

**NEXT:** David logs in at https://novo.bottomsup.fun/admin (one-time PIN to his email) and runs the
RUNBOOK §5.13 acceptance on the real CMS: edit a fact + a copy key in both languages, "Kopiera
standardlistan" on staff then edit one bio, upload an image, publish a blog post, reorder. Then the
walk-through with the client, then handover to the client's account (flip the two staging vars).
Not committed — project rule is commit-on-ask.

### 2026-08-23 13:50 — INCIDENT: admin 403 `jwks_unavailable` behind real Access → Forge core bug, fixed in template + both consumers (Amendment 18)
David's first login at `novo.bottomsup.fun/admin`: Access ALLOWED him (Access log: `login | cloudflare`
IdP), the `Cf-Access-Jwt-Assertion` header reached the Worker (tail), and the Worker 403'd. API
reason: **`jwks_unavailable`**. Root cause: `makeJwksFetcher`'s default deps `{ fetch, now }` +
`deps.fetch(url)` ⇒ the global `fetch` ran with the deps object as `this` ⇒ workerd throws
`TypeError: Illegal invocation` (Node's fetch tolerates it ⇒ every test green, every `wrangler dev`
smoke green — none ever ran behind Access, RUNBOOK §5.5). Proven at the edge with a well-formed fake
JWT on the workers.dev host: `jwks_unavailable` before, **`unknown_kid` after** (keys now fetched).
Fix (template `_templates/forge-cms/src/middleware.ts`, nicole-olmedo, salong-novo-v2 — same diff):
default `fetch: (input, init) => fetch(input, init)`; `[admin] JWKS fetch threw/failed` logged before
rethrow; `[admin] rejected <reason> <path>` logged on every refusal (visible in `wrangler tail`).
Regression test in all three `cms-middleware.test.ts` (stubbed global `fetch` records its receiver;
red on old code, green on fix). Gates: NOVO **598/598**, tsc clean, `astro check` 0 errors, build,
deployed (version `b122784b…`); nicole-olmedo 531/531 + tsc clean (not redeployed — inert there
until its Access app exists). Docs: ARCHITECTURE §16 **Amendment 18** + RUNBOOK §5 post-deploy
fake-JWT probe. Lesson for the file: Web API functions (`fetch`, `crypto.subtle.*`, `caches.*`) must
be wrapped in an arrow, never passed by reference, in anything that runs on workerd.

### 2026-08-23 14:10 — Bildbank seeded: all 66 site photographs in the media library (R2 + D1)
David is in the admin (Access + Worker both green after Amendment 18). Asked for "all the photos
currently on the website" in the Bildbank. New reusable script **`scripts/bildbank-seed.mjs`**
(`npm run bildbank:seed:remote|local`, `--dry-run` prints the plan): mirrors the upload route's
contract exactly — one R2 object per image with `contentType`, one `media` row
(`r2_key, alt, mime, bytes, created_at`), `INSERT OR IGNORE` so re-runs never duplicate. Keys are
human, not UUIDs (the media page shows the key as caption): `bildbank/personal/<slug>.jpg` (18),
`bildbank/arets-frisor-2026/` (16), `bildbank/arets-frisor-2025/` (26),
`bildbank/nordic-hairshot-awards-2025/` (4), `bildbank/texturer/` (2). Alt text derived from
`staff.json` / `awards.json` in Swedish ("Chriss Berner – frisör på Salong NOVO",
"Årets Nykomling 2026 — Ellen Rudd, bild 1 av 4"); `created_at` staggered so the library lists
portraits first. Verified remote: 66 rows under `bildbank/%`, objects stream via
`/api/media/<key>` (200, image/jpeg, byte-exact). 6.1 MB against the shared R2 free tier.
Windows gotchas baked into the script: `spawnSync(..., shell:true)` splits paths with spaces ⇒
cwd-relative forward-slash paths only; `wrangler d1 execute --file` returns a summary, not rows.
**Re-run on the client's account at handover** (after `db:migrate:remote`).

### 2026-08-27 — Client feedback ROUND 3: hero + price + education + APL copy, brands & courses as collections, team hover reversed, fixed öppettider retired
Client sent a full pass over the staging site. Everything below is shipped; **three items are
asset-blocked on the client** and one is a question back to her.

**Copy, both locales** (`src/lib/pagecopy.ts`, `src/i18n/ui.*.json`):
- **Hero, all three lines replaced.** Kicker "Schwarzkopf Flaggskepp · Vasastan" → "Stockholms
  vassaste frisörteam"; tagline "Stockholms mest prisbelönta frisörsalong." → "En av Sveriges mest
  prisbelönta frisörsalonger"; sub "17 stylister i hjärtat av Vasastan…" → "Vi har skapat vår
  drömsalong där inget lämnas åt slumpen." Net MFL effect is a REDUCTION in exposure: the absolute
  "Stockholms mest prisbelönta" became a relative claim the /tavlingar record actually supports.
- **Behandlingar & priser** (client's own rename of "Bokning & priser"; route slug `/priser`
  unchanged so no link breaks). `pricing.note` → `pricing.body`, three paragraphs: frånpriser +
  Voady consultation, 930 kr/h cutting rate and the 2 500–3 700 kr cut+colour band, and the 10 %
  out-of-hours surcharge. Prisinformationslagen (2004:347) satisfied — frånpriser declared as such,
  surcharge stated before booking. Nav label is **"Behandlingar"** alone: "Behandlingar & priser"
  is ~29 px wider than the old label and the desktop nav had no slack at 1181 px (measured).
- **Utbildning & kurser**: `education.note` → three paragraphs. Two typos corrected on the way in —
  "inspirerade" → "inspirerande", and **`info@salognovo.se` → `info@salongnovo.se`** (a live mailto:
  that bounces is worse than a rewrite).
- **Jobba hos oss**: the APL/traineeplats block added as `work.aplHeading` + `work.apl`. It is a
  `sections` entry under its own h2, not a fourth body paragraph — it addresses students, and run
  as a paragraph it read as a postscript to "— Chriss & Jannie".
- **Blogg**: `blog.title` "Journalen" → **"NOVO Blogg"**, new intro. This settles the open
  Journalen-vs-BLOGG naming conflict from round 2 — the client picked, in her own copy.
- The client's register is PRESERVED where it is hers ("vårat", "samt hårlängd"); only errors were
  corrected. `staff.intro` already said "Vårat fantastiska stjärnteam", so this is her voice.

**Two new collections** (`content/brands.json`, `content/courses.json`, `BRANDS`/`COURSES` in
`cms.config.ts`, `BrandGrid.astro`, `CourseList.astro`):
- **Våra brands** is now a real list — Keune, ghd, DC Hair Extensions, RichyHair Extensions,
  Signaturdoftljus — with `logo` + `product` image slots the client fills in the admin. Every
  default ships with BOTH images empty on purpose: the card types the brand name as a serif
  wordmark until a logo exists, so the page is complete before a single asset has been sourced.
  Descriptions stay category-level; NOVO does not speak for a third-party manufacturer, and an
  invented product claim is the salon's exposure under MFL §10, not the brand's. The grid breaks
  out of `.article`'s 820 px measure to the full 1152 px content box above 1248 px (a logo wall is
  not prose).
- **Kurser & utbildningar** — **THE ONE COLLECTION THAT SHIPS EMPTY**, with a named carve-out in
  `tests/cms-config.test.ts` (plus a second test asserting the carve-out is still true, so it gets
  deleted rather than left standing). The client's copy promises a programme "här nedan" and the
  salon has not published one; a fabricated course on a live client site is worse than an honest
  `education.coursesEmpty` line with the enquiry address in it.

**Behaviour + chrome:**
- **Team hover REVERSED, both grids** (home + `/personal`): portraits are full colour at rest and
  desaturate under pointer/focus. Verbatim client request. `.duo`'s charcoal wash stays killed on
  photo cards — it would now be a permanent half-desaturation.
- **Specialty keywords removed** from the homepage cards, the card `aria-label`, and the modal
  ("Behåll bara namn + instagram"). The FIELD is kept — "i nuläget" is a pause, not a deletion —
  but relabelled "Specialitet (visas inte just nu)" so nobody types into a dead input.
- **Header wordmark** 32 px → `clamp(32px, 3.2vw, 46px)`: mobile is untouched (which is the variant
  the client liked), desktop grows inside the 74 px bar. It only ever looked small because the same
  fixed size sat against a 1152 px bar and a 375 px one.
- **Homepage stat trio removed** (×3 Årets Kollektion / 17 / 2013). `getStats()` and the two
  `site.stats.*` admin fields went with it — a fact nothing renders must not be editable
  (`contentGroups`' own stated rule). The numbers stay recorded in `site.json`.
- **Fixed öppettider retired.** The salon keeps none — they vary per stylist — so the invented
  DRAFT times, the whole `site.hours` container and the three admin fields are gone. The footer
  column is now one paragraph (`footer.openingNote`), editable under a new **"Öppettider"** page in
  the copy list rather than buried in "Bloggens texter".
- **Utmärkelser chronological order: ALREADY CORRECT.** `groupAwards()` sorts years descending
  (2026 above 2025, verified in the browser); within a year, order is the client's to drag.

**Gate:** 606/606 tests (28 files, +8 new), `tsc --noEmit` clean, `astro check` 0 errors, build
green. Verified in the browser at 1440 / 1181 / 375 px: no horizontal overflow anywhere, desktop nav
still fits at 1181 px with the longer label and bigger mark, hover reversal confirmed by computed
`filter` (grayscale 0 at rest → 1 revealed), EN parity confirmed on `/en`.

**ASSET-BLOCKED on the client (not buildable here):**
1. A new portrait of Chriss — "Står så jävla konstigt på den." Only one shot per stylist exists in
   the repo, so there is nothing to swap to. Slot is ready.
2. The founders photo (C + J in the salon, from the last shoot) to replace the "N" monogram plate in
   the homepage story section. Geometry unchanged when it lands — drop the file in.
3. Brand logos + product images for all five lines. `BrandGrid` renders complete without them.

**QUESTION BACK TO THE CLIENT: is the Schwarzkopf relationship over?** She removed "Schwarzkopf
flaggskepp" from the hero herself and her brand list leads with **Keune**, a competing colour house.
The flagship sentence was pulled from `brands` copy rather than left standing unverified. Three
references remain, all currently unrendered: `site.json` `brand.positioning`, the
"Schwarzkopf-behandlingar" row in `services.json`, and `content/copy.md`. Do not re-publish any
version of the claim before she confirms.

**Also open:** "RichyHair Extensions" / "DC Hair Extensions" spellings are hers, unverified;
"Signaturdoftljus" arrived with a question mark (include it at all?).

**Deploy caveat:** `content_kv` rows OVERRIDE these file defaults. Before deploying, check staging
D1 for rows on the keys this round changed — a row from the §5.13 acceptance run would mask the new
copy. `SELECT key FROM content_kv;` then delete any of: `copy.home.kicker`, `copy.home.heading`,
`copy.home.sub`, `copy.blog.*`, `copy.footer.openingNote`, `copy.nav.pricing`,
`copy.pricing.heading`. Renamed keys (`copy.pricing.note`, `copy.education.note`,
`copy.brands.note`) and the removed `site.hours.*` / `site.stats.*` rows are inert orphans — safe to
leave, tidier to delete.

Not committed — project rule is commit-on-ask.

### 2026-08-27 (addendum) — Brand-logo sourcing: files found for all four, NONE shipped. ghd + Keune need written permission
Research lane (Opus) checked all four third-party lines. **Headline: not one of them publishes a
press kit, media page or brand-guidelines PDF.** Every file below came out of live site markup on
the brand's own domain/CDN — no scraper re-hosts (Brandfetch, worldvectorlogo, seeklogo,
brandsoftheworld, logotyp.us et al. all carry these marks and all dominated the search results;
none was used).

**Files staged, NOT in the repo** — scratchpad `…/e7412c80-…/scratchpad/brand-logos/`:

| Brand | File(s) | Licence verdict |
|---|---|---|
| Keune | `keune-black.png` 476×197, alpha | **RED** — T&C Art. 4: no part of the site may be reproduced "without written permission from Keune Haircosmetics" |
| ghd | `ghd-black.svg` (165×100, use this), `ghd-black-cdn.svg` | **RED** — Terms §3.3 explicitly prohibits reproducing/displaying/distributing site IP; §3.1 grants no IP rights. Parent is Coty (Jemella Ltd) |
| DC Hair | `dc-hair-transparent.png` 300×300 alpha (use this), `dc-hair-main.png` | **SILENT** — no terms-of-use page exists; only the footer "All rights reserved to DC Hair Solutions ©". Stockist use NOT VERIFIED |
| Richy Hair | `richy-footer-black.svg` (585.94×213.32, **use this one**), `richy-secondary-black.svg` (monogram, good for a tight grid), `richy-wordmark.png`; `richy-primary-black.svg` — see provenance note | **SILENT** — no terms page, only a privacy policy. Their authorised-salon programme suggests stockist display is intended, but that is an INFERENCE, not a permission |

**NOTHING WAS WIRED IN.** Silent is not the same as permitted — two of the four carry an explicit
written prohibition and the other two say nothing at all, so none of the nine files is licensed for
this use. Being the brands' own hosted assets establishes AUTHENTICITY, never permission. The salon,
not us, holds the reseller relationship, so the ask is theirs to make — and `BrandGrid` renders
complete without any of it (wordmark fallback), so there is no pressure to publish first and ask
later. When a logo is cleared: upload it in `/admin` under
Våra brands → Logotyp, or drop the file in `public/images/brands/` and set the row's `logo` to
`/images/brands/<slug>.svg`. Same field either way (`assetUrl`'s leading-slash discriminator).

**Names corrected to each brand's own mark** (client's list had three of four wrong): "Ghd" →
**ghd** (lowercase always — it stands for "good hair day"); "RichyHair extensions" → **Richy Hair**
(two words, verified against their own wordmark); "DC Hair extensions" → **DC Hair** (the mark; the
company is DC Hair Solutions). The category moved into `desc_*` where it belongs. Slugs followed
(`richy-hair`, `dc-hair`) — free to change, nothing is in D1 yet.

**Exact source of every file** (all brand-owned; no press kit exists for any of the four, so these
are live-markup pulls, which is also what a distributor will want to see when granting permission):
- `keune-black.png` ← `images.ctfassets.net/9kjqrnn60hxu/…/2022-Keune-Logo-Black-Online.png`
  (Keune's own Contentful CMS CDN, referenced from the keune.com homepage)
- `ghd-black.svg` ← `ghdhair.com/assets/images/ghdlogo_black.svg` — **prefer this one**
- `ghd-black-cdn.svg` ← `ghd.a.bigcontent.io/v1/static/ghdlogo` (ghd's own Amplience CDN; the
  homepage header `<img alt="Ghd logo">`)
- `dc-hair-main.png` / `dc-hair-transparent.png` ← `dc-hair.com/wp-content/uploads/2020/12/…`
- `richy-footer-black.svg`, `richy-secondary-black.svg`, `richy-wordmark.png` ← `richyhair.se`
  Shopify CDN, all three page-referenced
- `richy-primary-black.svg` — **WEAKEST PROVENANCE OF THE NINE.** Found by probing filename
  variants, not by any page reference. It returns 200, so it is genuinely on Richy's CDN, but the
  brand links to it nowhere. Use `richy-footer-black.svg` instead — same wordmark, same viewBox,
  and it IS page-referenced.

**Swedish routes for the permission ask** (the distributor is who supplies salon marketing assets):
- **Keune Haircosmetics Sweden AB**, Stockholm, org.nr 559489-4015 — a direct subsidiary, not an
  independent importer, so it can grant permission fast. Salon contact:
  `keune.com/se/page-contact-for-salons/`.
- **ghd** — no Swedish site at all (`ghdhair.com/se` and `pro.ghdhair.com` both fail); Sweden is
  served via wholesalers (Hairstuff, Salontotal, Frisorshop). Verified on-page:
  `customerservice@ghdhair.com`, `ghd-online@ghdhair.com`. (`prohelp@ghdhair.com` surfaced in a
  search summary but could NOT be confirmed on any page — treat as UNVERIFIED.)
- **DC Hair** — the contact page names a direct Sweden contact, Christopher Rosen.
- **Richy Hair** — `richyhair.se/pages/kontakta-oss`.

**TRAP for any client-facing deck:** searches for "ghd media contacts" surface **ghd.com**, which is
GHD Group, an Australian engineering consultancy with no connection to the hair brand. Do not let
that URL reach the client.

Caveats carried forward: `keune-black.png`, `dc-hair-transparent.png` and `richy-wordmark.png` were
visually rendered and confirmed to be the right marks; the SVGs were NOT rendered (provenance is
strong — the ghd one came from an `<img alt="Ghd logo">` in ghdhair.com's own header) so eyeball
them before shipping. No brand publishes a white/reversed variant (probed and 404 for both ghd and
Richy — DC was NOT probed for a white variant), but the SVGs are single-colour black paths, so a
reversed version is a one-line `fill` change rather than a missing asset.

Terms quoted above were read on the page, not from memory: Keune at
`keune.com/terms-and-conditions/` Art. 4, ghd at `ghdhair.com/terms-and-conditions/terms-of-use`
§3.3 and §3.1 (that page 403s to a normal fetch; it was read with curl).

### 2026-08-28 (overnight) — MOBILE PASS: award photos were rendering as 198×1400 slivers at every breakpoint; 69 measured defects → 0
David asked for a mobile sweep so "nothing looks off, letters get cut from images or formatting
being wrong". Built a measuring harness rather than eyeballing screenshots, because the worst defect
on the site turned out to be invisible in a thumbnail and obvious in a number.

**The harness** (scratchpad, not in the repo — `scratchpad/audit/`): headless Chromium over **all 22
public routes × 6 widths** (320/360/375/390/430/768), reporting measured defects — document
overflow with the culprit element, text clipped by its own box, a word wider than its container,
`object-fit: cover` crops over 25 %, tap targets under 44 px, type under 12 px. Plus a slice
capturer (viewport-sized, overlapping) for the eyeball pass.

**First run: 69 unique defects. Final run: 0.**

**THE BIG ONE — every award photo on /tavlingar was a 198×1400 sliver, at EVERY breakpoint.**
`.shots img` set `width: 100%` and `aspect-ratio: 2/3` but no `height`. The markup carried
`width="934" height="1400"` attributes, which map to presentational hints for the `height`
PROPERTY — so with no CSS height the box took 1400 px, both axes were definite, `aspect-ratio` was
ignored entirely, and `object-fit: cover` threw away **80–86 % of every image's width**. This was
never a mobile-only bug; the desktop 4-up grid had it too and nobody had caught it.
- Fix: `height: auto` (what lets the ratio govern), and the wrong width/height attributes deleted —
  not one of the 46 files is 934×1400, and the CSS now pins the box so no attribute is needed.
- **`contain`, not `cover`**, because four of the 46 are not photographs: the Nordic Hairshot
  entries are composite award CARDS with type printed on them — "FINALIST 2025", the stylist's
  name, "SWEDEN", L'Oréal/Goldwell/Aveda sponsor logos — and they are near-square (~1:1) against
  portrait tiles. Any cover crop cuts those words in half. **This is exactly the failure David
  named.** Contained, nothing is ever cut, and it holds for whatever the client uploads next.
- Tile ratio 2/3 → **3/4**, the median of the 46, so the set wastes the least plate.
- On phones the strip is now a **justified contact sheet**: one uniform height, each image at its own
  natural width. A horizontal scroller has no column grid to honour, so nothing is forced into a
  shared tile — no crop AND no mats.

**Other defects found and fixed:**
- **Homepage team bio overlay was clipped on small phones** — measured `scrollWidth` 164 in a 129 px
  box at 320–375 px. A three-sentence Swedish bio is unreadable in a 2-up phone grid regardless, so
  `.bio` is hidden below 620 px and the card goes straight to the team page, where the modal shows
  the same text at a readable width. The touch handler had to change with it: it tested whether
  `.bio` EXISTS, so with the element still in the DOM the first tap was swallowed and nothing
  appeared. It now tests computed `display`. Verified race-free by dispatching a cancelable click
  and reading `defaultPrevented`: ≤620 px not swallowed (navigates), >620 px swallowed (reveals).
- **h1 overflowed at 320 px** — "Integritetspolicy" set 283 px into a 272 px column, "NOVO-familjen."
  277 px. `body { overflow-x: hidden }` was HIDING the spill rather than fixing it, which is why no
  overflow check ever caught it. Added `overflow-wrap: break-word` on h1/h2/h3 and dropped the h1
  floor to 32 px below 360 px only, so 375 px and up are untouched.
- **Tap targets**: the header wordmark (34×32), every footer contact and nav link (18 px tall), the
  contact page's phone/email/Instagram (21 px), `.story-more`, `.team-all`, and the brand cards'
  "Läs mer" — all under the 44 px minimum, several under even WCAG 2.5.8's 24 px. Fixed with
  `inline-block` + `min-height` scoped to ≤820 px; desktop rhythm untouched.
- **Footer legal line** 11 px → 12 px.
- **Closing band orphan**: "Redo för din NOVO-stund?" broke after the hyphen and left "stund?" alone
  on its own line — on every page. `text-wrap: balance` on `.fc-head`.
- **Footer column heading said "Adress" above the phone number, email and Instagram** — the actual
  street address is in the column BEFORE it. Easy to miss in three desktop columns, glaring stacked
  on a phone ("ADRESS: 08-663 30 14"). Now "Kontakt" / "Contact". The dictionary KEY stays
  `labels.address` deliberately: renaming it would orphan any `content_kv` row already saved.

**Mobile performance, measured:** a phone that scrolls the whole page pulls **~1.65 MB of images on
the homepage and ~4.9 MB on /tavlingar** (46 files). An earlier reading of 10.4 MB was wrong — those
were 304 revalidations double-counted off `response` events; at the request level there are zero
duplicate fetches. `/images/*` had **no cache rule at all**, so Workers Static Assets falls back to
revalidate-on-every-visit and a returning visitor pays 46 round trips before seeing a photo. Added
`public, max-age=86400, stale-while-revalidate=2592000` to `public/_headers` — deliberately NOT the
`immutable` year that `/_astro/*` gets, because those filenames are content-hashed and these are
not: `/images/staff/chriss-berner.jpg` is a stable path whose contents are expected to change (the
client owes us exactly that file), and a year of immutable caching would hide the new portrait from
everyone who had seen the old one.

**NOT done, deliberately: the WebP/responsive-variant pipeline.** 4.9 MB on /tavlingar is still
heavy, and the honest fix is generating variants + `srcset` — which the BUILD-LOG already records as
a DEFERRED decision (the WebP variant Worker). Re-opening a logged deferral overnight, and adding an
image dependency to a client project, is David's call and not a 1 a.m. one. The numbers above are so
he can make it.

**Gate:** 606/606 tests, `tsc --noEmit` clean, `astro check` 0 errors, build green. Final measured
sweep: **0 defects across 22 routes × 6 widths**. Visual pass done on the slices by hand
(home, team, awards, brands, education, contact, careers, blog, footer, plus 320 px spot checks).

**Process note for next time:** three review subagents were spawned to read the 52 slices in
parallel and **none of them ever delivered a report**, despite two direct requests each — the same
pattern as the brand-logo lane earlier in the session, which only delivered after two nudges. The
visual review in this entry was done first-hand, not by those agents. Do not assume a spawned
reviewer's findings will arrive; budget for doing it yourself.

Also fixed in the harness itself, both of which would have produced false findings: the capture
script wiped its whole output directory on a partial re-run (deleting slices out from under a
reader), and flipping `img.loading = "eager"` after parse does NOT retroactively start a fetch in
Chromium — stepping the viewport down the page is what actually satisfies a lazy loader. Without
that, tall pages screenshot with most images unpainted and every reviewer reports "missing images"
that are perfectly fine.

Not committed — project rule is commit-on-ask.

### 2026-08-28 (overnight, cont.) — Accessibility sweep: skip link, AA contrast on the closing band, heading order
Same harness, second lens (`scratchpad/audit/a11y.js`): 22 routes, only checks decidable from the
rendered DOM with certainty — computed contrast with alpha blended onto the real painted background,
missing `alt`, heading-level jumps, links/buttons with no accessible name, `lang`, `main`, skip link.
No heuristics that need judgement; a false finding costs more attention than it saves.

**7 findings → 0.** Clean already: every image had an `alt`, `lang` set per locale, one `<h1>` per
page, `<main>` present, no nameless link or button anywhere.

- **No skip link on any page** (WCAG 2.4.1). A keyboard user tabbed through eight nav items, a
  language switch and the BOKA CTA before reaching the content — on every page. Added one in
  `Base.astro`, localised, off-screen until focused; `<main id="main">` already existed. Verified:
  first Tab lands on it, it becomes visible at top-left, Enter moves to `#main`.
- **Closing-band eyebrow failed AA** — "BOKA TID · VASASTAN, STOCKHOLM" was `rgba(26,26,26,0.66)` on
  champagne = **3.75:1**, under the 4.5 floor for 11px text, on all 11 pages in both locales. Now
  0.8 alpha = **5.13:1**, still visibly subordinate. Exactly the class of bug the 2026-06-01 review
  caught on `--bronze-muted`.
- **Heading-level jumps** (WCAG 1.3.1): the footer's column headings were `<h4>` straight after an
  `<h2>` on every page, and the brand-card names were `<h3>` straight after the page `<h1>`. Footer
  headings are now `<h2 class="fh">` (sections of the footer landmark; the class carries the
  styling), brand names `<h2>`.

**A stale dev server nearly cost me this.** The contrast fix measured as unchanged at 3.75:1 after
the edit — the source said 0.8, the browser said 0.66. Astro's dev server had been up for hours
across dozens of edits and was serving stale scoped CSS. Restarted it and re-ran BOTH sweeps from
scratch against fresh code: **0 layout findings (22 routes × 6 widths) and 0 accessibility findings
(22 routes)**. Lesson: after a long editing session, verify against a restarted server or you are
grading yesterday's build.

Second measurement trap, hit twice: `getComputedStyle` during a CSS transition returns the
INTERPOLATED value, not the target. The greyscale reversal and the skip link both read as "not
applied" until measured after the transition settled. Assert on state after it lands, or disable the
transition for the probe.

**Gate:** 606/606 tests, tsc clean, `astro check` 0 errors, build green.

### 2026-08-28 (overnight, cont.) — CORRECTION: the three review subagents DID deliver, and found four real defects I had missed
The previous entry says the review subagents never reported. **That is wrong and is retracted.** All
three delivered after a third request — roughly 20 minutes after going idle, which is why two rounds
of asking looked like silence. Anything in the earlier entry claiming otherwise should be read as an
error of mine, not a fact about the agents.

Their lists were worth the wait. **Four real defects I had not found, all now fixed:**

- **The sticky header was translucent enough to read through, worst at the bottom of every page.**
  `rgba(255,255,255,0.82)` + `backdrop-filter: blur(14px)`: over the black footer the bar went grey
  and the footer's large white NOVO wordmark ghosted straight through it, directly under the
  header's own NOVO — a doubled, half-clipped logo. I nearly dismissed this as a headless-capture
  artefact (backdrop-filter often does not composite in headless Chromium), so I re-shot it in a
  HEADED browser with real GPU compositing: **the reviewer was right, it reproduces**. 14px of blur
  softens a photograph but cannot hide a 46px wordmark. Now 0.94 — still frosted over imagery,
  nothing legible behind it.
- **The hair-strip captions were white type on near-white photographs.** The scrim was a two-stop
  `rgba(10,14,17,0.85) -> transparent` ramp that only reached full strength at the very bottom EDGE,
  below the line of type. On the white-seamless studio shots — "AVANTGARDE" worst — the caption sat
  on mid-grey and was barely legible, while "ÅRETS NYKOMLING" on the dark tile beside it was fine.
  Now a three-stop ramp holding 0.78 across the type and deepening to 0.92 under it, with taller top
  padding so the fade has somewhere to happen.
- **The blog page's eyebrow printed its own H1 verbatim** — "NOVO BLOGG" above "NOVO Blogg" — and was
  the only eyebrow on the site with no "N° xx —" number. Now `N° 09 — BLOGG`. Its intro was also the
  only page opener set in the sans body face instead of the Playfair lead every sibling uses; now
  matched.
- **The privacy page had no eyebrow at all** — it passed neither `no` nor `kicker`, so the H1 sat
  alone over an empty band. Now `N° 10 — Integritetspolicy`.

Plus two typographic breaks all three of us had seen and I had let pass: "Utbildning &" / "kurser."
dangling the ampersand, and "Förnyelse, sedan" / "2013." orphaning five characters. `text-wrap:
balance` on every page H1 (`ArticlePage`, `BlogList`, `StaffPage`, `CompetitionsPage`).

**Two findings I rejected, on measurement rather than opinion:**
- *"Team-page right column captions misaligned ~14px, Jasmina Rosengren runs past the photo edge."*
  Reported with a caveat, then UPGRADED to high confidence after a second read. **False.** Measured
  every cell: `li.left == frame.left == img.left == name.left` and the same on the right, both
  columns 157px wide at 24–181 and 195–351. Pixel-perfect. Serif letterforms with different left
  side bearings ("T" vs "J") read as an offset that is not there. A confident second look is not
  evidence; the DOM is.
- *"The hair strip breaks out of the page gutter, left tile starts ~9px from the edge."* **False on
  the premise** — it starts at 0. `.strip` is deliberately full-bleed with a scroll-snap track
  (scrollWidth 1104 vs clientWidth 375) and the sliced second tile is the peek affordance. Design,
  not overflow.

**One content question for the client, found by a reviewer:** the 2025 Nordic Hairshot Awards row
has `category: "Final"`, which renders as a lone heading "Final" beside a `FINALIST (SVERIGE)` tag.
The award card in that row's own photography reads **"COMMERCIAL COLLECTION"**, so "Final" looks like
truncated source data. NOT changed — recorded award data is not ours to rewrite. Ask her.

Also correct, and worth recording: the dark icon pill at the bottom of the capture slices is the
**Astro dev toolbar**, not browser chrome from the capture tool as I had told the reviewers. Verified
absent from `dist/` — dev-only, never ships.

**Gate after all of it:** 606/606 tests, tsc clean, `astro check` 0 errors, build green, and both
sweeps re-run from scratch: **0 layout findings (22 routes × 6 widths), 0 accessibility findings**.

**Process lesson, the real one:** a subagent going idle is NOT the same as a subagent having nothing
to say. Both this lane and the brand-logo lane delivered only on the third ask, and in both cases the
content was materially better than what I had without it. Ask again before concluding silence — and
never write "they never reported" into a memory entry a future session will trust.
