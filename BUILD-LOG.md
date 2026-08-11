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
