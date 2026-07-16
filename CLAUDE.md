# CLAUDE.md

This file provides guidance to Claude Code and Codex when working with code in this repository. `AGENTS.md` is a symlink to this file for Codex compatibility.

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

# Start all applications in development mode
pnpm dev

# Start specific applications
pnpm --filter @codaco/architect dev
pnpm --filter analytics-web dev  # Next.js with turbopack
```

### Building & Testing

```bash
# Build all packages and applications
pnpm build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check all packages (always run before committing)
pnpm typecheck

# Check for dead code and unused dependencies
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

- **Library packages** (`packages/*`) release to npm via `changesets/action` (the
  "Version Packages" PR).
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

This is a **pnpm workspace** monorepo with catalog dependencies for version consistency:

- **Apps**: End-user applications
  - `architect` - Protocol designer (Vite + Redux)
  - `documentation` - Documentation site
- **Packages**: Shared libraries and utilities
  - `protocol-validation` - Zod schemas for protocol validation and migration
  - `protocol-utilities` - Synthetic network generation and interview-payload builder
  - `shared-consts` - Shared constants and TypeScript definitions
  - `analytics` - PostHog analytics wrapper with installation ID tracking
  - `ui` - React components (built on shadcn/ui and Tailwind CSS)
  - `art` - Visual design components using blobs and d3-interpolate-path
  - `development-protocol` - Development protocol assets for testing
- **Tooling**: Build configuration
  - `tailwind` - Shared Tailwind CSS configurations
  - `typescript` - Shared TypeScript configurations
- **Workers**: Cloudflare Workers for specific backend tasks
  - `development-protocol` - Development protocol worker
  - `posthog-proxy` - PostHog proxy worker

### Key Technologies

- **Build**: Vite for apps, custom build scripts for packages
- **Validation**: Zod with complex cross-reference validation patterns
- **Frontend**: React with various stacks (Vite + Redux for desktop apps and architect, Next.js for documentation and others)
- **Styling**: Tailwind CSS with shared configurations
- **Testing**: Vitest across all packages

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

#### @codaco/shared-consts

Shared constants and type definitions used across the ecosystem. Place shared code, types, and constants here to avoid circular dependencies between packages.

#### @codaco/analytics

PostHog analytics wrapper for Network Canvas applications with installation ID tracking and error reporting. Provides both client-side and server-side exports.

#### @codaco/art

Visual design components using blobs and d3-interpolate-path for animated blob graphics used throughout the Network Canvas UI.

#### @codaco/development-protocol

Development protocol (protocol.json and assets/) for testing Network Canvas applications during development; it can be zipped into a .netcanvas file.

### Protocol System

Network Canvas uses a protocol-based system where:

- **Protocols** define the structure and flow of network data collection interviews
- **Stages** are individual interview steps (name generators, sociograms, forms, etc.)
- **Codebook** defines the data structure (nodes, edges, ego variables)
- **Variables** define data fields with validation rules and input controls

### Data Flow

1. Protocols are designed in Architect (protocol builder)
2. Validated using @codaco/protocol-validation
3. Executed in Interviewer applications

## Development Guidelines

**Before writing code for any feature, fix, or change, invoke the `developing-in-network-canvas` skill.** It covers reusing existing packages/components before building new, and the project's accessibility, internationalisation, participant-tone, and visual/motion priorities (with depth for UI work).

### Code Standards

- **NO `any` types** - explicitly forbidden, always use proper TypeScript typing
- **No barrel files** - avoid index.js/ts except in exceptional circumstances
- **Workspace dependencies**: Use `workspace:*` for dependencies used by multiple packages, or tooling dependencies. Use regular versioning for app-specific dependencies.

### TypeScript

- NEVER use the `any` type
- Shared TypeScript configurations in `tooling/typescript/`
- Strict type checking enabled across all packages

### Testing

- Test files use `.test.ts` or `.test.tsx` extensions
- Tests are co-located with source files in `__tests__/` directories
- Uses Vitest for testing framework
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

CI runs the complete Architect, Interview, and Interviewer E2E suites only for
the generated library branch `changeset-release/main`, the generated product
branches `changeset-release/architect`, `changeset-release/interviewer`,
`changeset-release/documentation`, and `changeset-release/website`, or merge
groups whose package or product version changes will trigger a release. The
required `quality` check
conditionally requires all three E2E jobs in those cases. Ordinary PRs skip E2E,
and E2E results are never carried forward from an earlier commit.

The release jobs explicitly dispatch `ci-and-release.yml` after creating or
updating a generated branch. Normal release PRs therefore do not need a
manual E2E trigger, even though GitHub does not start PR workflows for branch
updates made with the repository token.

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
