# Legacy interviewer & architect — monorepo workflow integration

**Date:** 2026-06-08
**Status:** Implemented (branch `legacy-apps-ci-integration`)

> **Implementation note:** during execution the knip "full purge" surfaced the
> vendored CommonJS `apps/interviewer/src/utils/network-exporters/` copy (knip's
> `--fix` corrupts CJS). Rather than exclude it, we **migrated the interviewer
> export feature off the vendored copy onto the workspace `@codaco/network-exporters`
> package** — moving export execution into the renderer (cross-platform: Electron +
> Cordova/Capacitor) modelled on `apps/interviewer-v7`, deleting the vendored tree.
> That export feature has no automated coverage and was **not runtime-verified** in
> this environment — it needs a real export tested on desktop and mobile. Two
> pre-existing path-traversal guards surfaced by the commit security review were
> also hardened (architect `isPathAllowed`).

## Problem

The two legacy desktop apps — `network-canvas-interviewer` (`apps/interviewer`) and
`network-canvas-architect` (`apps/architect`) — are partially excluded from the
monorepo's shared workflows. They are skipped by the `build`/`test`/`typecheck`
turbo runs (both in the root `package.json` scripts and in the CI quality gate),
ignored by `knip`, and have no release automation wired into CI. The goal is to
make them first-class participants in every monorepo workflow: the quality gate,
`knip`, changeset versioning, and the CI logic that triggers releases.

## Current state (audit)

Package → directory mapping (distinct from the **new** apps `@codaco/architect-web`
and `@codaco/interviewer-v7`, which are already fully integrated):

- `network-canvas-interviewer` → `apps/interviewer`
- `network-canvas-architect` → `apps/architect`

Both apps are **plain JavaScript** (`.js`/`.jsx`, no `tsconfig`, no `typecheck`
script) and **build + test green today**:

- interviewer `vitest run`: 79 test files / 411 passing (5 todo)
- both apps build via `electron-vite build` (exit 0)

| Workflow                   | Status today                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `//#lint` (oxlint + oxfmt) | **Already included** — runs globally over all `src/**`; `.oxlintrc.json` only ignores `node_modules/dist/build/out/.next/coverage/.turbo/public`. No per-app exclusion.                                                                 |
| `//#knip`                  | **Excluded** — `knip.json` `ignoreWorkspaces: ["apps/interviewer","apps/architect"]`.                                                                                                                                                   |
| `build`                    | **Excluded** — `--filter='!network-canvas-interviewer' --filter='!network-canvas-architect'` in the root `build` script and the CI quality gate.                                                                                        |
| `test` / `test:watch`      | **Excluded** — same two filters.                                                                                                                                                                                                        |
| `typecheck`                | Excluded, but **moot** — plain JS, no `typecheck` script; turbo skips packages without the task regardless.                                                                                                                             |
| Changeset versioning       | **Already eligible** — both are workspace members, `private:true`, and not in `.changeset/config.json` `ignore`. `changeset add` lists them, `changeset version` bumps them, `changeset publish` skips them (private).                  |
| CI release/build jobs      | **No wiring** — unlike `interviewer-v7`, which has a version-bump detector in the `release` job plus a per-platform Electron build+publish matrix.                                                                                      |
| Turbo build graph          | **Partly present** — `turbo.json` already declares `network-canvas-architect#build` `dependsOn ["^build", "network-canvas-interviewer#build"]` (architect embeds interviewer's renderer dist via its `copy-interviewer` prebuild step). |

## Decisions

1. **Scope:** full release automation, not just CI hygiene.
2. **Release target:** keep each app's existing electron-builder publish target
   (separate repos — interviewer publishes to `complexdatacollective/interviewer`
   via its `build.publish` config; architect via its own electron-builder config).
   Do **not** move them to monorepo GitHub Releases the way `interviewer-v7` does.
3. **Versioning:** independent — a changeset bumps only the app it targets. The
   apps have no workspace package-dependency on each other (architect copies
   interviewer's _dist_ at build time via a filesystem script, not a `workspace:*`
   dep), so changesets will not auto-bump architect when interviewer bumps. If a
   coordinated release is wanted, the author adds a changeset for both apps.
4. **Cadence:** release-on-main only. No PR snapshot Electron builds.

## Design

### Part A — Quality-gate inclusion

1. **`package.json` (root):** remove
   `--filter='!network-canvas-interviewer' --filter='!network-canvas-architect'`
   from the `build`, `test`, `test:watch`, and `typecheck` scripts.
2. **`.github/workflows/ci-and-release.yml` → `quality` job, "Run all gates":**
   remove the same two filters so `//#lint //#knip typecheck build test` covers
   both apps.
3. **`typecheck` stays a no-op** for these apps (no `typecheck` task to run);
   removing the filter is for list-consistency, not behavior.
4. **`knip.json`:** remove both entries from `ignoreWorkspaces`; add workspace
   configs modeled on `interviewer-v7`/`architect-web`:
   - `apps/interviewer`:
     - entry: `src/index.html!`, `src/main/index.js`, `src/preload/index.js`,
       `electron.vite.config.js`, `vitest.config.js`
     - project: `src/**/*.{js,jsx}`
     - paths: `{ "@/*": ["./src/*"] }`
   - `apps/architect`:
     - entry: `index.html!`, `public/electron-starter.js`,
       `public/preload/appPreload.js`, `public/preload/summaryPreload.js`,
       `electron.vite.config.js`, `electron-builder.config.js`, `vitest.config.js`
     - project: `src/**/*.{js,jsx}`
     - paths: alias map for `@app/@components/@selectors/@hooks/@modules/@utils`
       → `src` and its subdirs (mirrors the electron.vite.config aliases)
   - **Risk / iteration:** knip on post-migration legacy code will surface real
     unused dependencies and exports. Approach: first tune the entry/project globs
     to eliminate false positives, then triage genuine findings — fix the trivial
     ones, and `ignoreDependencies`/`ignore` the rest with a justifying comment so
     the `//#knip` gate passes. This is the part of the work most likely to need
     several iterations against real knip output.

### Part B — Turbo cache correctness

5. **`network-canvas-architect#build` inputs:** currently list
   `src/**, scripts/**, tsconfig*.json, electron.vite.config.*,
electron-builder.config.*, package.json` but omit architect's real renderer
   entry and config files. Add `public/**`, `index.html`, `babel.config.*`,
   `postcss.config.*` so a change to the electron main/preload sources or build
   config correctly invalidates the cache. (Interviewer rides the generic `build`
   task, whose `src/**` + `electron.vite.config.*` inputs already cover it; add
   `babel.config.*`/`postcss.config.*` to the generic task only if a stale-cache
   case appears.)

### Part C — Release automation (release-on-main, separate target repos)

6. **`release` job (`ci-and-release.yml`):** after the `changesets/action` step,
   add two version-bump detectors mirroring the existing
   `detect_interviewer_v7` step — each diffs the app's `package.json` `version`
   against `HEAD^` (the `release` checkout already uses `fetch-depth: 2`) and
   emits job outputs:
   - `interviewer_released` / `interviewer_version`
   - `architect_released` / `architect_version`
7. **Two new matrix build jobs** `interviewer-release-build` and
   `architect-release-build` (`os: macos-latest | windows-latest | ubuntu-latest`,
   `fail-fast: false`), each gated `if: needs.release.outputs.<app>_released == 'true'`:
   - Install (no `--ignore-scripts`; electron-builder needs native rebuilds),
     restore the electron + turbo caches as the `interviewer-v7-build` job does.
   - Build via turbo. The architect job must build interviewer first so its
     `copy-interviewer` prebuild has a source — turbo handles this automatically:
     `network-canvas-architect#build` already `dependsOn
network-canvas-interviewer#build` (an explicit task dependency, so it fires
     regardless of the package filter — note `--filter=…^...`, which walks the
     _package.json_ dependency graph, would **not** pull interviewer in, since
     architect has no `workspace:*` dep on it). Running
     `turbo run build --filter=network-canvas-architect` builds interviewer first,
     then architect.
   - **Signing:** reuse `interviewer-v7`'s Apple/CSC secrets for the mac leg
     (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `CSC_LINK`,
     `CSC_KEY_PASSWORD`); win/linux ship unsigned. The same Apple Developer
     certificate signs the apps' distinct bundle IDs.
   - **Conditional publish (handles the missing cross-repo token):** publishing to
     `complexdatacollective/interviewer` (a _different_ repo) requires a PAT with
     write access there — the default `GITHUB_TOKEN` cannot. The job branches on a
     new `LEGACY_RELEASE_GH_TOKEN` secret:
     - present → `electron-builder --publish always` (`GH_TOKEN` = the PAT),
       publishing to the app's configured external repo.
     - absent → `electron-builder --publish never` + `actions/upload-artifact` of
       `release-builds/*` to the workflow run.

     This makes the wiring complete and non-failing before the secret is
     provisioned, mirroring how `interviewer-v7` degrades when mac secrets are
     empty.

### Part D — Lint-script cleanup (adjacent)

8. Architect's `lint` / `lint:fix` scripts call `biome check .`, but
   `@biomejs/biome` is not a dependency and there is no root `biome.json` — they
   are dead leftovers from before the oxlint migration. Interviewer's `preflight`
   calls a non-existent `lint` script. Remove the biome `lint`/`lint:fix` scripts
   from architect and repoint both apps' `preflight` to the canonical root lint +
   `vitest`, so the only linting path is the monorepo-standard oxlint/oxfmt.

### Changeset usage (no config change)

Changeset versioning already includes both apps. To cut a release, a contributor
runs `pnpm changeset`, selects `network-canvas-interviewer` and/or
`network-canvas-architect`, and picks a bump. On merge to `main`, the `release`
job's `changeset version` updates the app's `package.json`; the new version-bump
detector (Part C.6) sees the change and fires the matching Electron build job.

## Prerequisite (not a blocker)

- **`LEGACY_RELEASE_GH_TOKEN`** repository secret — a PAT with `contents:write` on
  the external release repos. Without it the design still builds and uploads
  artifacts to the run; with it, the apps publish to their configured external
  repos. Provisioning it is required only to actually publish.

## Out of scope

- Migrating the legacy apps to TypeScript or adding a real `typecheck`.
- Moving legacy releases to monorepo GitHub Releases (explicitly rejected — keep
  separate target repos).
- PR snapshot Electron builds for the legacy apps.
- Any refactor of the apps' runtime source beyond what knip triage requires.

## Risks

- **Knip noise (primary):** legacy code may produce many findings; triage is
  iterative (Part A.4).
- **CI time:** the quality gate gains the interviewer suite (~40s, heavy jsdom
  setup) plus two Electron `electron-vite build`s. Acceptable; runs are cached.
- **Cross-repo publish token:** absent until provisioned; mitigated by the
  conditional-publish branch (Part C.7).
