# Network Canvas Project Overview

## Purpose
Network Canvas is an innovative suite of applications for conducting network research interviews and data collection. It helps researchers collect data about social, personal, and professional networks through intuitive interfaces and powerful data management tools.

## Tech Stack
- **Language**: TypeScript
- **Package Manager**: pnpm (version >=10.0.0)
- **Node Version**: >=20.0.0
- **Build Tool**: Vite
- **Testing**: Vitest
- **Validation**: Zod for schema validation
- **Linting/Formatting**: Biome
- **Monorepo Management**: pnpm workspaces

## Repository Structure
- **apps/**: Applications (analytics-web, documentation, architect-vite)
- **packages/**: Shared packages including:
  - `protocol-validation/`: Core validation and schema system
  - `ui/`: Shared UI components
  - `shared-consts/`: Shared constants
  - `analytics/`: Analytics functionality
  - `art/`: Asset management
  - `development-protocol/`: Development protocol definitions

## Protocol Validation Package
The main focus is on `packages/protocol-validation/` which contains:
- Schema definitions for protocol versions (currently v8)
- Validation logic with complex cross-reference validation
- Migration utilities between schema versions
- Type definitions and helper utilities