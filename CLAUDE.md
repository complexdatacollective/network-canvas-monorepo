# CLAUDE.md

This file provides guidance to Claude Code and Codex when working with code in this repository. `AGENTS.md` is a symlink to this file for Codex compatibility.

Repository agent skills live canonically in `.agents/skills/<name>/` (each with
a `SKILL.md` plus Codex's `agents/openai.yaml`); every `.claude/skills/<name>`
entry is a directory symlink to its `.agents` counterpart so both harnesses
read one copy. Edit the canonical `.agents` file only — never break a symlink
by writing a separate `.claude` copy — and keep harness-specific instructions
inline as parentheticals (e.g. "Claude Code: invoke X").

## Committing and opening PRs

When a change is complete and verified — types, lint, `knip`, and the relevant
tests pass — you may commit it and open a pull request **without asking first**.
Always work on a feature branch; never commit directly to `main`. Still confirm
before other outward-facing or hard-to-reverse actions (merging, force-pushing,
deleting branches, publishing releases).

## Workspace mechanics

### Source-first workspace packages

Internal consumption of workspace packages is **source-first**: every
`packages/*` package's `exports` map points at raw TypeScript under `src/`, and
consumers (Vite apps, Next.js apps, vitest, tsc, Storybook) compile that source
through their own pipelines. There are no dependency dist builds, no dev
watchers, and no wrapper scripts — run any package or app script directly
(`pnpm --filter <pkg> dev`, `pnpm --filter <pkg> test`); edits to a dependency's
source are picked up live (HMR across packages).

`dist/` output still exists for exactly four purposes: app product builds, the
npm publish lane, the site-navigation-element CDN bundle, and
protocol-validation's CLI (`scripts/cli.js` imports its own `dist`; run
`pnpm --filter @codaco/protocol-validation build` before using it).

Rules that keep this working:

- **Publishing** — each published package keeps its live `exports` on `src/` and
  carries a dist-pointing override in `publishConfig`; `changeset publish`
  delegates to `pnpm publish`, which applies the swap at pack time.
  `scripts/verify-publish-exports.mjs` (run in the release job, or manually
  after `pnpm build`) asserts every packed tarball resolves into `dist/`.
  fresco-ui's 140-entry map pair is generated: after adding/removing a subpath
  in `exports`, run `pnpm --filter @codaco/fresco-ui sync-exports`; a vitest
  guard fails if the maps drift.
- **No `~/` path aliases in package source.** Consumers typecheck package
  source inside their own TS program, where the consumer's `paths` win — an
  alias inside a consumed package resolves against the wrong root. Apps may
  keep their own `~/` aliases (their source is never consumed).
- **Ambient declarations must be imported to be seen.** A `.d.ts` module
  augmentation that a package pulls in via its own tsconfig `include` is
  invisible to consumers; put augmentations in (or type-import them from) a
  module that using code imports.
- **Node-loaded contexts need explicit `.ts` extensions.** Anything loaded by
  Node's own ESM loader rather than a bundler (a `vite.config.ts` import chain,
  scripts) can load package source only if relative specifiers carry explicit
  `.ts` extensions (Node 24 type-stripping + `erasableSyntaxOnly`).
  protocol-validation and shared-consts are extension-explicit for this reason
  (architect's `vite.config.ts` → protocol-source-authoring plugin loads them);
  keep them that way, and treat any new "config imports a workspace package"
  chain the same.

#### Turbo graph

Cross-package cache invalidation uses a synthetic, input-less transit task:
`"topo": { "dependsOn": ["^topo"] }`. Tasks that used to depend on `^build`
(`build`, `test`, `typecheck`, `build-storybook`, …) now depend on `^topo`, so
a dependency **source** change still re-hashes and re-selects consumers
(including under `--affected`) without building anything. `dev`/`storybook`
have no dependency edge at all. `test:e2e*` keeps `dependsOn: ["build"]`
(same-package app build). Don't add `inputs` to `topo` — the all-files default
is the conservative fail-safe against under-invalidation across the dependency
edge.

### Version Management

#### Changeset lanes: normal vs separately gated products

- **The normal Changesets lane** contains publishable libraries under
  `packages/*` plus the private Architect, Background Creator, Interviewer, and
  Fresco apps. All use normal semver and are versioned by `changesets/action` in
  the **Version Packages** PR (`changeset-release/main`). Libraries publish to
  npm; changed apps deploy and receive a GitHub release after that PR merges —
  Architect, Background Creator, and Interviewer to Netlify, Fresco via the
  mirror described below. Merge the Version Packages PR only while it is
  current: a head generated before main's newest normal-lane changeset lands a
  tree that still carries a changeset, and `changesets/action` then
  regenerates the PR instead of publishing (on 2026-09-01 that left three
  bumped versions unpublished). The `version-packages-freshness` job refuses
  that merge from the queue; wait for the regenerated head. Pushes to main
  run concurrently, so the `release` job also stops when its commit is no
  longer main's tip (`.github/scripts/superseded-push-guard.sh`) rather than
  regenerating a release PR that has already merged.
- **Separately gated products** are Documentation, networkcanvas.com, and
  Studio. Documentation and Website keep independent stable-semver release PRs,
  production deploys, and Git tags. The Studio lane covers all four Studio
  workspace packages (`@codaco/studio-client`, `@codaco/studio-server`,
  `@codaco/studio-rpc`, `@codaco/studio-sync`); its release PR records versions
  and changelogs only — Studio has no automated production deploy lane yet.
- **One release lane per changeset.** A normal-lane changeset may combine
  libraries, Architect, Background Creator, Interviewer, and Fresco. A Studio
  changeset may combine the Studio packages. Never mix Documentation, Website,
  or Studio with the normal lane or with another gated lane; the
  `pnpm check:changesets` guard rejects it.
- See the `creating-a-changeset` skill and
  `docs/superpowers/specs/2026-08-03-stable-app-release-design.md`.

#### Hotfix releases for Architect and Interviewer

Both apps' production jobs build `main`, so the normal lane cannot ship a patch
without everything else merged since the last release. When `main` holds work
that must not go out yet, cut `hotfix/<app>-<version>` from the released tag,
cherry-pick the fix, bump `package.json` + `CHANGELOG.md`, and run the
**Hotfix Release** workflow (`.github/workflows/hotfix-release.yml`) from
`main`, naming that branch in `source_ref`. The lane only ships the newest
line — one production site per app means a `--prod` deploy always replaces what
is live. Afterwards, merge the hotfix branch into `main` (dropping only that
app's entry from the changeset it consumed). Both release lanes refuse to
deploy a tree that does not contain the newest released commit, and the
tag-driven guard skips a version whose tag already exists — so until that merge
lands, `main` cannot release the app at all. Cherry-picking does not count: the
guard checks commit ancestry. Full procedure in each app's `RELEASING.md`.

#### Apps that release by mirroring

Fresco and the two classic apps are developed here but ship from their own
GitHub repositories. `scripts/mirror-app.mjs` replaces the external repo's
default branch with the app's source as a single linear-append commit, resolving
every `workspace:`/`catalog:` specifier to a registry version
(`scripts/resolve-manifest.mjs`) so the mirrored tree installs standalone. The
external repository is a mirror, never a source of truth — changes made there
are overwritten by the next release.

Fresco additionally gets a generated single-package `pnpm-workspace.yaml` and a
pnpm lockfile, because its `Dockerfile` builds the mirrored tree directly. The
push to the Fresco repo's `main` is what triggers its container image build and
push to GHCR; see `apps-release-fresco` in `.github/workflows/ci-and-release.yml`
and `apps/fresco/CLAUDE.md`. The lane is tag-driven and self-healing like the
Netlify app lanes, and shares their guard: one concurrency group per app and
`.github/scripts/app-release-guard.sh`, which refuses an older version or a
tree missing the newest released commit, so a run for a superseded main commit
skips instead of pushing older code over the newest release.

## Architecture Overview

### Package pointers

- **`@codaco/fresco-ui`** — its `package.json` exports and co-located Storybook
  stories are the authoritative component API.
- **`@codaco/shared-consts`** — place shared code, types, and constants here to
  avoid circular dependencies between packages.

### Protocol System

Network Canvas uses a protocol-based system where:

- **Protocols** define the structure and flow of network data collection interviews
- **Stages** are individual interview steps (name generators, sociograms, forms, etc.)
- **Codebook** defines the data structure (nodes, edges, ego variables)
- **Variables** define data fields with validation rules and input controls

### Data Flow

1. Protocols are designed in Architect.
2. They are validated and migrated by `@codaco/protocol-validation`.
3. The `@codaco/interview` runtime executes them in Interviewer or another host.
4. Completed interview data can be transformed by `@codaco/network-exporters`.

## Development Guidelines

Before adding code for any feature, fix, or refactor, search for the existing package, module, helper, component, or pattern. Prefer reuse, composition, or a focused extension over a parallel implementation. If nothing fits, state what you checked and why the new code belongs in its chosen package.

**Immediately before the first code edit that changes a user-facing interface, interaction, or user-visible output, invoke the `developing-network-canvas-ui` skill once for that implementation task.** Do not invoke it for backend, schema, worker, CI, tooling, dependency, test-only, or documentation changes unless they alter a user-facing surface, and do not re-invoke it for follow-up messages within the same implementation task.

### Code Standards

- **NO `any` types** - explicitly forbidden, always use proper TypeScript typing
- **No barrel files** - avoid index.js/ts except in exceptional circumstances
- **Workspace dependencies**: Use `workspace:^` for internal `@codaco/*`
  dependencies used by multiple packages, or tooling dependencies. Use regular
  versioning for app-specific dependencies. Prefer `workspace:^` over
  `workspace:*`: `workspace:*` publishes as an exact pin and changesets treats it
  as the exact current version, so a minor/major bump of a package listed as a
  `peerDependency` escalates every dependent to a spurious major release (and
  external consumers cannot deduplicate shared packages). `workspace:^` publishes
  as a caret range, which avoids both.
- **Classic app dependencies**: Keep `architect-classic` on its GitHub
  `protocol-validation` dependency and `interviewer-classic` on its external npm
  `@codaco/protocol-validation` dependency. Do not migrate either to the
  workspace package unless the task explicitly modernizes the classic apps.

### Testing

- If a storybook exists for a component, consider creating interactive tests within storybook

### CI and E2E policy

Which E2E suites CI selects and why, the two-job pixel/native split, release-branch
verdict reuse, Storybook interaction-test determinism, Chromatic/TurboSnap wiring, and
the visual snapshot baseline workflow all live in the `ci-and-e2e-policy` skill.
