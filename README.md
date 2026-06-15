# Network Canvas

Network Canvas is a suite of applications for conducting network research interviews and data collection. This monorepo contains the core packages and applications that power the Network Canvas ecosystem.

## Overview

Network Canvas helps researchers collect data about social, personal, and professional networks through intuitive interfaces and powerful data management tools.

## Repository Structure

This monorepo is organized into four main categories:

### Apps

| App                                     | Description                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`architect-web`](./apps/architect-web) | Protocol designer application (Vite + React + Redux) for creating Network Canvas interview protocols |
| [`architect`](./apps/architect)         | Legacy Electron build of Architect, the Network Canvas protocol designer (maintenance mode)          |
| [`interviewer`](./apps/interviewer)     | Network Canvas Interviewer — the desktop/mobile app (Electron + Cordova) used to conduct interviews  |
| [`documentation`](./apps/documentation) | Next.js documentation website with MDX support and search functionality                              |

### Packages

| Package                                                           | Description                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`@codaco/protocol-validation`](./packages/protocol-validation)   | Zod schemas for validating and migrating Network Canvas protocol files                               |
| [`@codaco/shared-consts`](./packages/shared-consts)               | Shared constants and TypeScript definitions for the Network Canvas project                           |
| [`@codaco/interview`](./packages/interview)                       | Network Canvas interview engine — Shell component, synthetic network generator, and session contract |
| [`@codaco/network-exporters`](./packages/network-exporters)       | Effect-TS pipeline for exporting Network Canvas interview data as CSV and GraphML                    |
| [`@codaco/network-query`](./packages/network-query)               | Network filtering and querying utilities for Network Canvas                                          |
| [`@codaco/fresco-ui`](./packages/fresco-ui)                       | Fresco UI components, styles, and utilities built on Base UI and Tailwind CSS                        |
| [`@codaco/art`](./packages/art)                                   | Visual design components using blobs and d3-interpolate-path for animated graphics                   |
| [`@codaco/interface-images`](./packages/interface-images)         | Generated responsive screenshots of every interview interface, with a React `<picture>` component    |
| [`@codaco/development-protocol`](./packages/development-protocol) | Development protocol assets for testing Network Canvas applications                                  |

### Workers

| Worker                                                          | Description                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`development-protocol-worker`](./workers/development-protocol) | Cloudflare Worker for serving development protocol files from GitHub |
| [`posthog-proxy-worker`](./workers/posthog-proxy)               | Cloudflare Worker for proxying PostHog analytics requests            |

### Tooling

| Config                                          | Description                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`@codaco/tailwind-config`](./tooling/tailwind) | Shared Tailwind v4 theme, color palette, and plugins for Fresco and other Codaco apps |
| [`@codaco/tsconfig`](./tooling/typescript)      | Shared TypeScript configurations                                                      |
| [`oxlint`](./tooling/oxlint)                    | Shared oxlint configurations (React and Tailwind rule sets) extended by workspaces    |

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 10.0.0

### Installation

```bash
git clone https://github.com/complexdatacollective/network-canvas-monorepo.git
cd network-canvas-monorepo
pnpm install
```

### Development

```bash
# Start all applications in development mode
pnpm dev

# Build all packages and applications
pnpm build

# Run tests across all packages
pnpm test
```

### Working with Individual Packages

```bash
# Work with a specific package
pnpm --filter @codaco/protocol-validation build
pnpm --filter @codaco/architect-web dev
pnpm --filter @codaco/documentation dev

# Run commands across multiple packages
pnpm --filter "./packages/*" build
pnpm --filter "./apps/*" dev
```

### Working with Cloudflare Workers

```bash
# Develop workers locally
pnpm --filter development-protocol-worker dev
pnpm --filter posthog-proxy-worker dev

# Deploy workers to Cloudflare
pnpm --filter development-protocol-worker deploy
pnpm --filter posthog-proxy-worker deploy
```

## Development Tools

- **Build System**: Vite for fast builds and development
- **Package Manager**: pnpm with workspace support
- **Code Formatting**: oxfmt for formatting and oxlint for linting
- **Type Checking**: TypeScript with shared configurations
- **Edge Computing**: Cloudflare Workers for serverless functions
- **CI/CD**: GitHub Actions with optimized workflows
- **Change Management**: Changesets for version management

## Code Style

This project uses [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting and [oxfmt](https://github.com/oxc-project/oxfmt) for formatting. Style settings: 2-space indentation, 80-character line width, and single quotes.

```bash
# Check formatting and linting
pnpm lint

# Auto-fix formatting and linting issues
pnpm lint:fix

# Format only
pnpm format

# Check formatting only
pnpm format:check
```

Pre-commit hooks automatically lint and format staged files.

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @codaco/protocol-validation test

# Run tests in watch mode
pnpm test:watch

# Type check all packages
pnpm typecheck
```

## Version Management

This project uses [Changesets](https://github.com/changesets/changesets) for version management and automated releases.

```bash
# Add a changeset for your changes
pnpm changeset
```

After merging a PR with changesets, a release PR will be created that bumps package versions. Merge that PR to publish the updated packages.

## Interface Screenshots

[`@codaco/interface-images`](./packages/interface-images) ships generated screenshots of every interview interface (Sociogram, Name Generator, …), rendered from dedicated Storybook "capture" stories in `@codaco/interview` with Playwright + sharp. They are consumed by **architect-web** (stage thumbnails) and the **documentation** site (the hero image on each interface-documentation page).

**Cached, not committed.** The screenshot assets (`packages/interface-images/src/generated/assets/`) are produced by the turbo `generate` task and **cached, not committed** — they are gitignored. Only the generated `manifest.ts` beside them (a small text file mapping each interface and ratio to its variant URLs and dimensions) is tracked, so typechecking and tooling work without running a capture.

**Regeneration is keyed on the `@codaco/interview` version, by design.** The `generate` cache is keyed on the `@codaco/interview` _release version_ — the version in its `package.json`, or the pending version when a changeset bumps it — passed to turbo as `INTERVIEW_RELEASE_VERSION` (computed by [`scripts/interview-release-version.mjs`](./scripts/interview-release-version.mjs)). It is **not** keyed on interview/fresco-ui source content, so the images regenerate only when you deliberately version the interview package — not on every interview or fresco-ui edit.

The trade-off is that, between versions, the cached images can lag the code. The safety net: `@codaco/interview`'s Chromatic build snapshots the capture stories, so a rendering change shows up there as a visual diff — that is your cue to add an `@codaco/interview` changeset (which moves the version and triggers regeneration). Treat Chromatic on the capture stories as the signal that a regen is due.

**Versioning interview redeploys both consumers.** `architect-web` and `documentation` builds depend on `generate`, and CI's `detect` job treats a moved interview release version as a change to both apps. So the full chain holds:

> version `@codaco/interview` (or add a changeset bumping it) → the `generate` cache key moves → images regenerate during the `quality` build → `architect-web` and `documentation` rebuild and redeploy with the fresh images.

To regenerate locally — needed once for local development of architect-web or the documentation site, since the assets are not committed:

```bash
pnpm generate:interface-images   # builds the interview storybook, then captures
```

Requires a Chromium browser (`pnpm exec playwright install chromium`) and, for the Geospatial map, `STORYBOOK_MAPBOX_TOKEN` set. See [`packages/interface-images`](./packages/interface-images) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `pnpm lint:fix` and `pnpm typecheck`
6. Submit a pull request

## Links

- [Network Canvas](https://networkcanvas.com)
- [Documentation](https://documentation.networkcanvas.com)
- [GitHub Issues](https://github.com/complexdatacollective/network-canvas-monorepo/issues)

---

Built by the Complex Data Collective team
