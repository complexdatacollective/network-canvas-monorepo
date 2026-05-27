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
pnpm --filter @codaco/architect-web dev
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

## Architecture Overview

### Monorepo Structure

This is a **pnpm workspace** monorepo with catalog dependencies for version consistency:

- **Apps**: End-user applications
  - `architect-web` - Protocol designer (Vite + Redux)
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
- **Frontend**: React with various stacks (Vite + Redux for desktop apps and architect-web, Next.js for documentation and others)
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
