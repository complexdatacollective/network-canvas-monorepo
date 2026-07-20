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

## Essential Commands

### Development

```bash
# Install all dependencies
pnpm install

# Start every workspace that has a development task
pnpm dev

# Start specific applications
pnpm --filter @codaco/architect dev
pnpm --filter @codaco/interviewer dev
pnpm --filter @codaco/documentation dev
pnpm --filter networkcanvas.com dev
```

### Building & Testing

```bash
# Build the workspace through Turbo's dependency graph
pnpm build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check the workspace (always run before committing)
pnpm typecheck

# Check for unused files, exports, and dependencies
pnpm knip
```

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

### Code Quality (Always Run Before Committing)

```bash
# Auto-fix formatting and linting issues
pnpm lint:fix

# Check for dependency issues
pnpm knip

# Run type checking across all packages
pnpm typecheck
```

### Version Management

```bash
# Add a changeset for your changes
pnpm changeset

# Version packages (after changesets are added)
pnpm version-packages

# Publish packages
pnpm publish-packages
```

#### Changeset lanes: libraries vs gated products

- **Publishable library packages** under `packages/*` release to npm via
  `changesets/action` (the "Version Packages" PR). Private packages stay in the
  same dependency graph but are not published.
- **Each gated product** has its own release PR: Architect and Interviewer release
  on a `-beta.N` line and create a GitHub release, while Documentation and
  networkcanvas.com use normal semver and receive a Git tag. Merging a product's
  release PR deploys only that product to Netlify production.
- **One release lane per changeset.** Never put a gated product and a library—or
  two gated products—in the same changeset. `pnpm check:changesets` rejects both;
  write one changeset per product or library lane.
- See the `creating-a-changeset` skill and
  `docs/superpowers/specs/2026-07-03-pwa-app-beta-releases-design.md`.

## Architecture Overview

### Monorepo Structure

This is a **pnpm workspace** monorepo with catalog dependencies for version
consistency:

- **Apps**: Products and websites
  - `architect` - Offline-capable Vite/React PWA for designing, validating, and previewing protocols
  - `architect-classic` - Maintenance-mode Electron version of the original Architect
  - `documentation` - Localized Next.js documentation site built from Markdown/MDX
  - `interviewer` - Offline-first Vite/React PWA for protocol management, local interviews, and data export
  - `interviewer-classic` - Maintenance-mode Interviewer for Electron desktop and Capacitor mobile
  - `networkcanvas.com` - Localized Next.js project website
- **Packages**: Shared libraries, generated assets, and protocol content
  - `art` - Shared animated backgrounds, blobs, patterns, and network-weave visuals
  - `development-protocol` - Published compatibility package for the canonical development protocol
  - `fresco-ui` - React component system, forms, dialogs, styles, and utilities
  - `interface-images` - Generated responsive interview-interface screenshots and display component
  - `interview` - Embeddable participant-facing interview engine and host session contract
  - `network-exporters` - CSV and GraphML interview-data export pipeline
  - `network-query` - Network filtering and querying utilities
  - `protocol-utilities` - Synthetic network generation and interview-payload builder
  - `protocol-validation` - Protocol schemas, validation, hashing, and migration
  - `protocols` - Private canonical source for bundled protocols, templates, downloads, and fixtures
  - `sample-protocol` - Published compatibility package for the canonical sample protocol
  - `shared-consts` - Shared constants and TypeScript definitions
  - `site-navigation-element` - Self-contained Network Canvas navigation web component
- **Tooling**: Shared build and code-quality configuration
  - `tailwind` - Shared Tailwind theme, design tokens, fonts, and plugins
  - `typescript` - Shared TypeScript configurations
  - `oxlint` - Shared React and accessibility lint rules
- **Workers**: Cloudflare Workers
  - `development-protocol` - Resolves and serves the latest released development protocol
  - `posthog-proxy` - Proxies PostHog API and static-asset requests with CORS support

### Key Technologies

- **Workspace orchestration**: pnpm workspaces and Turborepo
- **Builds**: Vite for current web apps and libraries, Next.js for websites,
  Electron Vite for classic desktop apps, and Wrangler for Cloudflare Workers
- **Validation**: Zod with complex cross-reference validation patterns
- **Frontend**: React, with Redux or Zustand where application state requires it
- **Styling**: Tailwind CSS, Base UI, and the shared Fresco design system
- **Testing**: Vitest, Storybook/Chromatic, and Playwright

#### @codaco/protocol-validation

The core validation system for Network Canvas protocol files (`.netcanvas`). Contains:

- **Schema validation**: Zod schemas for protocol structure validation
- **Logic validation**: Cross-reference validation that can't be expressed in JSON schema
- **Migration system**: Handles protocol upgrades between schema versions
- **Structure**: Schemas are modularized in `src/schemas/8/` with logical groupings:
  - `variables/` - Variable types, validation rules, component types
  - `codebook/` - Node, edge, and ego entity definitions
  - `stages/` - All stage type schemas (forms, name generators, sociograms, etc.)
  - `filters/` - Filter rules and sort order schemas
  - `common/` - Shared schemas (subjects, prompts, forms, skip logic)
  - `assets/` - Asset management schemas

#### @codaco/protocol-utilities

Synthetic network generation and interview-payload builder for Network Canvas protocols. Provides:

- **`generateNetwork`**: a pure function that produces an `NcNetwork` (plus stage metadata and step state) for a given codebook and stages, with optional seeding for deterministic output. Used by `architect`'s PreviewHost and by tests that need a deterministic network shape.
- **`SyntheticInterview`**: a fluent builder for codebooks, stages, prompts, forms, and full interview payloads. Used by `@codaco/interview`'s Storybook stories.

#### @codaco/interview

Embeddable React interview engine containing the participant-facing interfaces,
stage navigation, state management, analytics hooks, and the contract a host
uses to synchronize and finish sessions. It is hosted by the current Interviewer
app, Architect previews, and external consumers such as Fresco.

#### @codaco/fresco-ui

The shared React design system. It provides accessible Base UI-backed
components, forms, dialogs, collection primitives, typography, layout, themes,
and motion utilities. Its `package.json` exports and co-located Storybook stories
are the authoritative component API.

#### @codaco/shared-consts

Shared constants and type definitions used across the ecosystem. Place shared code, types, and constants here to avoid circular dependencies between packages.

#### @codaco/art

Animated backgrounds, blobs, patterns, and network-weave visuals shared across
Network Canvas applications and websites.

#### @codaco/network-exporters and @codaco/network-query

`@codaco/network-exporters` provides the Effect pipeline for exporting interview
data as CSV and GraphML. `@codaco/network-query` provides filtering and querying
utilities shared by interview runtimes and applications.

#### @codaco/protocols and compatibility packages

`@codaco/protocols` is the private canonical source for development and sample
protocols, Architect templates, documentation downloads, and E2E fixtures.
`@codaco/development-protocol` and `@codaco/sample-protocol` are published
compatibility packages synchronized from that canonical content.

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

**Before writing code for any feature, fix, or change, invoke the `developing-in-network-canvas` skill.** It covers reusing existing packages/components before building new, and the project's accessibility, internationalisation, participant-tone, and visual/motion priorities (with depth for UI work).

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

### TypeScript

- NEVER use the `any` type
- Shared TypeScript configurations in `tooling/typescript/`
- Strict type checking enabled across all packages

### Testing

- Test files use `.test.ts` or `.test.tsx` extensions
- Tests are co-located with the source they cover, either adjacent to it or in a
  nearby `__tests__/` directory
- Vitest is the default unit and component test framework; Playwright covers E2E
- If a storybook exists for a component, consider creating interactive tests within storybook

#### Chromatic and TurboSnap

Chromatic runs from `.github/workflows/chromatic.yml` as three independent
projects: `@codaco/fresco-ui`, `@codaco/interview`, and
`@codaco/interviewer`. The workflow uses Turbo's package graph and the Git diff
to run only affected projects, including downstream consumers (a Fresco UI
change affects all three; an Interview change also affects Interviewer). Each
job uses its matching `CHROMATIC_PROJECT_TOKEN_FRESCO_UI`,
`CHROMATIC_PROJECT_TOKEN_INTERVIEW`, or
`CHROMATIC_PROJECT_TOKEN_INTERVIEWER` repository secret.

Each project's `build-storybook` script must emit `preview-stats.json` with
Storybook's `--stats-json` option. Its `chromatic` script uploads the prebuilt
`storybook-static` directory with `--only-changed` and the correct
`--storybook-base-dir`; these inputs and the workflow's full Git history are
required for TurboSnap. Keep Interview's `.storybook/static/**` directory in
its Chromatic externals so static-asset changes invalidate the relevant
stories.

#### Release-only E2E checks

CI runs the Architect, Interview, and Interviewer E2E suites only for
generated release branches (`changeset-release/*`) and merge groups whose
package or product version changes will trigger a release — and only the
suites whose subject ships in that release lane: the library lane
(`changeset-release/main`) runs all three; the Architect and Interviewer lanes
run their own suite plus Interview (both apps bundle the interview runtime);
the Documentation and Website lanes run none. The mapping lives in
`scripts/release-e2e-policy.mjs`, and its test derives the expected lanes from
the real package.json dependency graph so the table cannot silently drift.
The required `quality` check requires exactly the suites the policy selects.
Ordinary PRs skip E2E and never inherit an E2E verdict from an earlier
commit.

Generated release branches and their merge groups use equivalence reuse: a
suite is skipped when a prior successful native pull-request run of it exists
on the same branch and the diff since that commit touches only paths that
provably cannot affect the suite — files in workspace packages outside the
suite subject's declared workspace dependency closure (dependencies,
devDependencies, peerDependencies, optionalDependencies), or the inert
`docs/`, `.changeset/`, `*.md` set. Every guard fails closed: an unfetchable
commit, Actions-API doubt, a fork head, a conclusive failure as the newest
verdict, or any unrecognised path (root configs, `.github/`, `scripts/`, the
lockfile) re-runs the suite. Force-pushed refreshes of a release PR after
unrelated merges to `main` therefore keep their E2E verdicts without
re-running, while any change that ships in the lane re-runs as before (see
`scripts/release-e2e-policy.mjs` and
`docs/superpowers/specs/2026-07-17-release-e2e-equivalence-reuse-design.md`).

The release jobs create and update generated branches with the fine-grained PAT
stored as `RELEASE_PR_TOKEN`. That causes the normal `pull_request` workflow to
start without manual approval. Do not add a separate workflow dispatch: it would
duplicate the native CI run and its release-only E2E suites.

#### E2E visual snapshot baselines

When an intentional rendering change requires new committed Playwright PNGs,
invoke the `regenerating-e2e-visual-snapshots` skill. The manual
`Regenerate E2E Visual Snapshots` GitHub Actions workflow runs only the
selected Architect, Interview, or Interviewer capture code and uploads its
images; it does not run normal tests or quality jobs. Inspect every artifact
before committing selected baselines.

On a generated release PR, a visual-snapshot E2E failure automatically runs the
same focused generation-only workflow. If it produces changed baseline PNGs, a
trusted follow-up opens or updates one serialized PNG-only PR against `main`.
Failures from multiple release gates accumulate in that shared PR instead of
creating per-product copies. Review every image; merging the snapshot PR accepts
the baselines, refreshes every generated release branch from `main`, and reruns
their E2E gates. Functional failures do not start regeneration, and no PNG
changes means no snapshot PR.

Keep Interview ARIA snapshot updates in the targeted local matrix workflow.
Do not confuse E2E PNG baselines with `@codaco/interface-images`, whose
committed WebP files are generated locally for stage thumbnails and
documentation. CI and Netlify consume those files without regenerating them.
