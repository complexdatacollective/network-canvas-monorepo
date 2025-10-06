# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key Commands

### Development
```bash
# Install all dependencies
pnpm install

# Start all applications in development mode
pnpm dev

# Build all packages and applications
pnpm build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check all packages
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
```

### Code Quality
```bash
# Check formatting and linting
pnpm run lint

# Auto-fix formatting and linting issues
pnpm run lint:fix
```

### Version Management
```bash
# Add a changeset for your changes
pnpm changeset

# Version packages (after changesets are added)
pnpm run version-packages

# Publish packages
pnpm run publish-packages
```

## Architecture Overview

### Monorepo Structure
This is a pnpm workspace monorepo with three main categories:

- **Apps**: End-user applications (`analytics-web/`, `documentation/`)
- **Packages**: Shared libraries and utilities (`protocol-validation/`, `shared-consts/`, `ui/`, etc.)
- **Tooling**: Build configuration (`tailwind/`, `typescript/`)

### Key Packages

#### @codaco/protocol-validation
The core validation system for Network Canvas protocol files. Contains:
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
4. Data exported and analyzed through Analytics tools

## Development Guidelines

### Code Style
- Uses Biome for formatting and linting with tab indentation and 120-character line width
- Enforces unused import/variable removal
- Uses double quotes for strings
- Pre-commit hooks automatically format code

### TypeScript
- NEVER use the `any` type
- Shared TypeScript configurations in `tooling/typescript/`
- Strict type checking enabled across all packages

### Testing
- Test files use `.test.ts` or `.test.tsx` extensions
- Tests are co-located with source files in `__tests__/` directories
- Uses Vitest for testing framework

### Schema Development
When working with protocol schemas in `@codaco/protocol-validation`:
- Main schema remains in `src/schemas/8/schema.ts` with the `ProtocolSchema` export
- Sub-schemas are modularized in logical directories
- All validation helpers are in `validation-helpers.ts`
- Schema migrations are handled in the `migration/` directory
- Use Zod for schema definitions with comprehensive validation rules

### Package Management
- Uses pnpm with workspace support
- Package versions managed through Changesets
- Catalog system for dependency management (check `pnpm-workspace.yaml`)
- Each package has its own `package.json` with proper dependencies

### Applications
- **analytics-web**: Next.js app for data visualization and analytics
- **documentation**: Next.js app with MDX-based documentation system
- Apps use shared UI components and follow consistent patterns