# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
- `pnpm dev` - Start all applications in development mode
- `pnpm --filter architect-vite dev` - Start architect app only
- `pnpm --filter analytics-web dev` - Start analytics web app only (Next.js with turbopack)

### Building & Testing
- `pnpm build` - Build all packages and applications
- `pnpm test` - Run all tests across packages
- `pnpm test:watch` - Run tests in watch mode
- `pnpm typecheck-all` - Type check all packages (always run before committing)

### Code Quality (Always Run Before Committing)
- `pnpm format-and-lint:fix` - Auto-fix all formatting and linting issues with Biome
- Biome config: tabs for indentation, 120 char line width, double quotes
- Pre-commit hooks automatically format staged files

### Package-Specific Commands
From package directories:
- `npm run build` - Build individual package
- `npm run dev` - Build package in watch mode
- `npm run test` - Run package tests
- `npm run typecheck` - Type check package

### Version Management
- `pnpm changeset` - Add changeset for version management (automatically formats after)
- `pnpm version-packages` - Version packages with changesets
- `pnpm publish-packages` - Build and publish packages

## Architecture Overview

### Monorepo Structure
- **pnpm workspaces** with catalog dependencies for version consistency
- **Apps**: `architect-vite` (protocol designer), `analytics-web` (Next.js dashboard), `documentation`
- **Packages**: `protocol-validation` (Zod schemas), `ui` (React components), `analytics`, `shared-consts`
- **Tooling**: `tailwind` (shared config), `typescript` (shared tsconfigs)

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

### Code Standards
- **NO `any` types** - explicitly forbidden, always use proper TypeScript typing
- **No barrel files** - avoid index.js/ts except in exceptional circumstances  
- **Tab indentation** (not spaces), 120 character line width, double quotes
- **Workspace dependencies**: Use `workspace:*` for internal package references

### Dependencies
- React ecosystem with Radix UI components via catalog
- Node.js >= 20.0.0, pnpm >= 10.0.0 required
- Heavy use of catalog dependencies in pnpm-workspace.yaml for consistency

### Development Workflow
1. Always run `pnpm format-and-lint:fix` before committing
2. Run `pnpm typecheck-all` to verify TypeScript compliance
3. Use changesets for version management - never manually bump versions
4. Test individual packages with `pnpm --filter <package-name> test`