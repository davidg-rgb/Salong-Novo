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
