# Network Canvas

Network Canvas is a suite of applications for conducting network research interviews and data collection. This monorepo contains the core packages and applications that power the Network Canvas ecosystem.

## Overview

Network Canvas helps researchers collect data about social, personal, and professional networks through intuitive interfaces and powerful data management tools.

## Repository Structure

This monorepo is organized into four main categories:

### Apps

| App | Description |
|-----|-------------|
| [`architect-vite`](./apps/architect-vite) | Web-based protocol designer application (Vite + React + Redux) |
| [`architect-desktop`](./apps/architect-desktop) | Electron desktop application for designing Network Canvas interview protocols |
| [`interviewer`](./apps/interviewer) | Electron application for conducting Network Canvas interviews |
| [`analytics-web`](./apps/analytics-web) | Next.js analytics dashboard with Clerk authentication and Postgres database |
| [`documentation`](./apps/documentation) | Next.js documentation website with MDX support and search functionality |

### Packages

| Package | Description |
|---------|-------------|
| [`@codaco/protocol-validation`](./packages/protocol-validation) | Zod schemas for validating and migrating Network Canvas protocol files |
| [`@codaco/shared-consts`](./packages/shared-consts) | Shared constants and TypeScript definitions |
| [`@codaco/analytics`](./packages/analytics) | PostHog analytics wrapper with installation ID tracking and error reporting |
| [`@codaco/ui`](./packages/ui) | Reusable React UI components built on shadcn/ui and Tailwind CSS |
| [`@codaco/art`](./packages/art) | Visual design components using blobs and d3-interpolate-path for animated graphics |
| [`@codaco/development-protocol`](./packages/development-protocol) | Development protocol assets for testing Network Canvas applications |
| [`@codaco/network-exporters`](./packages/network-exporters) | Network export formatters (CSV, GraphML) for exporting interview data |
| [`@codaco/network-query`](./packages/network-query) | Network filtering and querying utilities |

### Workers

| Worker | Description |
|--------|-------------|
| [`development-protocol-worker`](./workers/development-protocol) | Cloudflare Worker for serving development protocol files from GitHub |
| [`posthog-proxy-worker`](./workers/posthog-proxy) | Cloudflare Worker for proxying PostHog analytics requests |

### Tooling

| Config | Description |
|--------|-------------|
| [`tailwind`](./tooling/tailwind) | Shared Tailwind CSS configuration |
| [`typescript`](./tooling/typescript) | Shared TypeScript configurations |

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
pnpm --filter architect-vite dev
pnpm --filter analytics-web dev

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
- **Code Formatting**: Biome for consistent code style
- **Type Checking**: TypeScript with shared configurations
- **Edge Computing**: Cloudflare Workers for serverless functions
- **CI/CD**: GitHub Actions with optimized workflows
- **Change Management**: Changesets for version management

## Code Style

This project uses Biome for formatting and linting:

```bash
# Check formatting and linting
pnpm lint

# Auto-fix formatting and linting issues
pnpm lint:fix
```

Pre-commit hooks automatically format code on commit.

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
