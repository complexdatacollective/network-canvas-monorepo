# Network Canvas

Network Canvas is a suite of tools for designing and conducting network
research interviews. This monorepo contains the current browser applications,
maintenance-mode desktop and mobile applications, shared libraries, websites,
and supporting services used across the Network Canvas ecosystem.

Architect creates `.netcanvas` interview protocols. Interviewer installs and
runs those protocols locally, stores interview data offline, and exports the
resulting networks for analysis. The shared packages provide the protocol
schema, interview runtime, design system, data utilities, and canonical protocol
content used by those applications.

## Repository Structure

The pnpm workspace is organized into four main categories.

### Apps

| App                                                 | Description                                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`architect`](./apps/architect)                     | Offline-capable Vite/React PWA for designing, validating, and previewing Network Canvas interview protocols                                        |
| [`architect-classic`](./apps/architect-classic)     | Maintenance-mode Electron version of the original Architect protocol designer                                                                      |
| [`documentation`](./apps/documentation)             | Localized Next.js documentation site built from Markdown/MDX, with DocSearch and generated protocol downloads                                      |
| [`interviewer`](./apps/interviewer)                 | Offline-first Vite/React PWA for managing protocols, conducting interviews, storing local sessions with optional encryption, and exporting data    |
| [`interviewer-classic`](./apps/interviewer-classic) | Maintenance-mode Interviewer application for desktop (Electron) and native mobile (Capacitor)                                                      |
| [`networkcanvas.com`](./apps/networkcanvas.com)     | Localized Next.js project website, including product information, research resources, publications, team information, and getting-started guidance |

### Packages

| Package                                                                 | Description                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`@codaco/art`](./packages/art)                                         | Shared animated backgrounds, blobs, patterns, and network-weave visuals                                                                 |
| [`@codaco/development-protocol`](./packages/development-protocol)       | Published compatibility package for the canonical development protocol in `@codaco/protocols`                                           |
| [`@codaco/fresco-ui`](./packages/fresco-ui)                             | Reusable React components, forms, dialogs, styles, and utilities built with Base UI and Tailwind CSS                                    |
| [`@codaco/interface-images`](./packages/interface-images)               | Generated responsive screenshots of the interview interfaces, plus the React component used to display them                             |
| [`@codaco/interview`](./packages/interview)                             | Embeddable React interview engine containing the participant-facing interfaces, navigation, state management, and host session contract |
| [`@codaco/network-exporters`](./packages/network-exporters)             | Effect pipeline for exporting Network Canvas interview data as CSV and GraphML                                                          |
| [`@codaco/network-query`](./packages/network-query)                     | Network filtering and querying utilities                                                                                                |
| [`@codaco/protocol-utilities`](./packages/protocol-utilities)           | Deterministic synthetic-network generation and a fluent interview-payload builder                                                       |
| [`@codaco/protocol-validation`](./packages/protocol-validation)         | Zod schemas and utilities for validating, hashing, and migrating Network Canvas protocol files                                          |
| [`@codaco/protocols`](./packages/protocols)                             | Private canonical source for development and sample protocols, Architect templates, documentation downloads, and E2E fixtures           |
| [`@codaco/sample-protocol`](./packages/sample-protocol)                 | Published compatibility package for the canonical sample protocol in `@codaco/protocols`                                                |
| [`@codaco/shared-consts`](./packages/shared-consts)                     | Shared constants and TypeScript definitions                                                                                             |
| [`@codaco/site-navigation-element`](./packages/site-navigation-element) | Self-contained `<nc-site-navigation>` web component for non-React websites                                                              |

### Workers

| Worker                                                          | Description                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`development-protocol-worker`](./workers/development-protocol) | Cloudflare Worker that resolves and serves the latest released `Development.netcanvas` artifact |
| [`posthog-proxy-worker`](./workers/posthog-proxy)               | Cloudflare Worker that proxies PostHog API and static-asset requests with CORS support          |

### Tooling

| Tooling                                         | Description                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`@codaco/tailwind-config`](./tooling/tailwind) | Shared Tailwind theme, design tokens, fonts, and plugins, with v3 compatibility and the preferred v4 surface |
| [`@codaco/tsconfig`](./tooling/typescript)      | Shared TypeScript configurations                                                                             |
| [`oxlint`](./tooling/oxlint)                    | Shared oxlint rule sets for React and accessibility                                                          |

## Getting Started

### Prerequisites

- Node.js 24, using the exact version in [`.nvmrc`](./.nvmrc)
- pnpm 11, using the exact version pinned by `packageManager` in
  [`package.json`](./package.json)

### Installation

```bash
git clone https://github.com/complexdatacollective/network-canvas-monorepo.git
cd network-canvas-monorepo
corepack enable
pnpm install
```

### Development

```bash
# Start every workspace that has a development task
pnpm dev

# Build the workspace through Turborepo's dependency graph
pnpm build

# Run tests across the workspace
pnpm test
```

The root scripts invoke `turbo run`/`turbo watch`, so workspace dependencies are
built or watched in the correct order. Prefer them over calling a package script
directly when that task consumes another workspace package.

### Working with Individual Workspaces

```bash
# Work with a specific app or package
pnpm --filter @codaco/protocol-validation build
pnpm --filter @codaco/architect dev
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

- **Workspace orchestration:** pnpm workspaces and Turborepo
- **Application builds:** Vite for the current web apps and shared libraries,
  Next.js for the websites, Electron Vite for the classic desktop apps, and
  Wrangler for Cloudflare Workers
- **UI:** React, Tailwind CSS, Base UI, and the shared Fresco design system
- **Code quality:** TypeScript, oxlint, oxfmt, and knip
- **Testing:** Vitest, Storybook/Chromatic, and Playwright
- **CI/CD and releases:** GitHub Actions, Changesets, Netlify, npm, and
  Cloudflare Workers

## Code Style

This project uses [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting
and [oxfmt](https://github.com/oxc-project/oxfmt) for formatting. Style settings:
2-space indentation, 80-character line width, and single quotes.

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

# Type check the workspace
pnpm typecheck

# Check for unused files, exports, and dependencies
pnpm knip
```

## Version Management

This project uses [Changesets](https://github.com/changesets/changesets) for
version management and automated releases.

```bash
# Add a changeset for your changes
pnpm changeset
```

Publishable library packages under `packages/*` share the npm release lane.
Architect, Interviewer, Documentation, and networkcanvas.com each have an
independent gated product release PR. Keep each changeset to one release lane:
do not mix a gated product with libraries, or two gated products, in the same
changeset. Classic apps are maintained and released separately.

## Interface Screenshots

[`@codaco/interface-images`](./packages/interface-images) ships generated screenshots of every interview interface (Sociogram, Name Generator, …), rendered from dedicated Storybook "capture" stories in `@codaco/interview` with Playwright + sharp. They are consumed by **architect** (stage thumbnails) and the **documentation** site (the hero image on each interface-documentation page).

The generated WebP variants in
`packages/interface-images/src/generated/assets/` and their
`packages/interface-images/src/generated/manifest.ts` are committed. Architect,
the documentation site, CI, and Netlify consume those committed files; CI and
Netlify do not regenerate them.

Chromatic snapshots the Interview capture stories. Treat a relevant Chromatic
diff as the review signal that the committed interface images may need to be
refreshed, then regenerate them locally:

```bash
pnpm generate:interface-images
```

This builds the Interview Storybook and captures the images. It requires a
Chromium browser (`pnpm exec playwright install chromium`) and, for the
Geospatial map, `STORYBOOK_MAPBOX_TOKEN`. Review the results and commit
`packages/interface-images/src/generated/assets/` and
`packages/interface-images/src/generated/manifest.ts` together. See
[`packages/interface-images`](./packages/interface-images) for details.

These interface screenshots are separate from the committed Playwright PNG
baselines. For intentional Architect or Interview E2E pixel changes, use
the `regenerating-e2e-visual-snapshots` skill and the manual
`Regenerate E2E Visual Snapshots` GitHub Actions workflow.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Add a changeset when the change affects a releasable package or product
6. Run `pnpm lint:fix`, `pnpm knip`, `pnpm typecheck`, and the relevant tests
7. Submit a pull request

## Links

- [Network Canvas](https://networkcanvas.com)
- [Documentation](https://documentation.networkcanvas.com)
- [GitHub Issues](https://github.com/complexdatacollective/network-canvas-monorepo/issues)

---

Built by the Complex Data Collective team
