# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development

```bash
# Install all dependencies
pnpm install

# Start all applications in development mode
pnpm dev

# Start specific applications
pnpm --filter architect-vite dev
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
```

### Package-specific Commands

```bash
# Work with specific packages/apps
pnpm --filter @codaco/protocol-validation build
pnpm --filter analytics-web dev
pnpm --filter @codaco/shared-consts test

# Work with multiple packages by pattern
pnpm --filter "./packages/*" build
pnpm --filter "./apps/*" dev

# Package-specific commands from directories
npm run build    # Build individual package
npm run dev      # Build package in watch mode
npm run test     # Run package tests
npm run typecheck # Type check package
```

### Code Quality (Always Run Before Committing)

```bash
# Check formatting and linting
pnpm lint

# Auto-fix formatting and linting issues
pnpm lint:fix

# Check for dependency issues
pnpm knip

# Run type checking across all packages
pnpm typecheck
```

- Biome config: tabs for indentation, 120 char line width, double quotes
- Pre-commit hooks automatically format staged files

### Cloudflare Workers

```bash
# Develop workers locally
pnpm --filter development-protocol-worker dev
pnpm --filter posthog-proxy-worker dev

# Deploy workers to Cloudflare
pnpm --filter development-protocol-worker deploy
pnpm --filter posthog-proxy-worker deploy
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

## Architecture Overview

### Monorepo Structure

This is a **pnpm workspace** monorepo with catalog dependencies for version consistency:

- **Apps**: End-user applications
  - `architect-vite` - Protocol designer (Vite + Redux)
  - `analytics-web` - Next.js dashboard with turbopack
  - `documentation` - Documentation site
- **Packages**: Shared libraries and utilities
  - `protocol-validation` - Zod schemas for protocol validation and migration
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
- **Frontend**: React with various stacks (Vite + Redux for architect, Next.js for analytics)
- **Styling**: Tailwind CSS with shared configurations
- **Testing**: Vitest across all packages

### Critical Validation Patterns
- `validateProtocol()` function in `protocol-validation` package - async function returning ValidationResult
- Used extensively in architect app save operations
- Validates both schema structure and business logic with descriptive error messages
- Use `superRefine` for complex cross-reference validation

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

#### @codaco/shared-consts

Shared constants and type definitions used across the ecosystem.

#### @codaco/ui

Reusable React UI components built on shadcn/ui and Tailwind CSS.

#### @codaco/analytics

PostHog analytics wrapper for Network Canvas applications with installation ID tracking and error reporting. Provides both client-side and server-side exports.

#### @codaco/art

Visual design components using blobs and d3-interpolate-path for animated blob graphics used throughout the Network Canvas UI.

#### @codaco/development-protocol

Development protocol assets (protocol.json and assets/) for testing Network Canvas applications during development.

### Protocol System

Network Canvas uses a protocol-based system where:

- **Protocols** define the structure and flow of network data collection interviews
- **Stages** are individual interview steps (name generators, sociograms, forms, etc.)
- **Codebook** defines the data structure (nodes, edges, ego variables)
- **Variables** define data fields with validation rules and input controls

### Data Flow

1. Protocols are designed in Architect (protocol builder)
2. Validated using @codaco/protocol-validation
3. Executed in Interviewer applications (not yet present in this repository)
4. Data exported and analyzed through Analytics tools

## Development Guidelines

### Code Style

- Uses Biome for formatting and linting with tab indentation and 120-character line width
- Enforces unused import/variable removal
- Uses double quotes for strings
- Pre-commit hooks automatically format code
- ALL code style tasks to pass successfully before committing

### Code Standards
- **NO `any` types** - explicitly forbidden, always use proper TypeScript typing
- **No barrel files** - avoid index.js/ts except in exceptional circumstances
- **Workspace dependencies**: Use `workspace:*` for internal package references

### TypeScript

- NEVER use the `any` type
- Shared TypeScript configurations in `tooling/typescript/`
- Strict type checking enabled across all packages

### Testing

- Test files use `.test.ts` or `.test.tsx` extensions
- Tests are co-located with source files in `__tests__/` directories
- Uses Vitest for testing framework

### Package Management

- Uses pnpm with workspace support
- Package versions managed through Changesets
- Catalog system for dependency management (check `pnpm-workspace.yaml`)
- Each package has its own `package.json` with proper dependencies

### Dependencies
- React ecosystem with Radix UI components via catalog
- Node.js >= 20.0.0, pnpm >= 10.0.0 required
- Heavy use of catalog dependencies in pnpm-workspace.yaml for consistency

### Development Workflow
1. Always run `pnpm lint:fix` before committing
2. Run `pnpm typecheck` to verify TypeScript compliance
3. Use changesets for version management - never manually bump versions
4. Test individual packages with `pnpm --filter <package-name> test`
