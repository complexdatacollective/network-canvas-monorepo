# Code Style and Conventions

## General Conventions
- Always use path aliases for imports (e.g., `~/components/`)
- Always use `pnpm` for package management
- Always use TypeScript for new components
- Biome is used for linting and formatting

## TypeScript
- Use types instead of interfaces where possible
- Strict mode enabled
- Path aliases configured (e.g., `~/` for src/)
- Shared configs via `@codaco/tsconfig`
- Remove PropTypes in favor of TypeScript
- ALWAYS remove defaultProps and replace with TypeScript default parameters

## Component Patterns
- Functional components with hooks (no class components)
- Do not use recompose or HOCs in new components
- ALWAYS remove recompose and refactor HOCs when found in existing components
- Remove unused types after refactoring

## Styling
- Tailwind for all new styling - migrating legacy Sass styles to Tailwind
- framer-motion (now '@motion') for animations and transitions
- Legacy UI components in `/packages/legacy-ui` should be migrated to use radix primitives and Tailwind

## File Organization
- Always remove barrel files (index.js, index.ts, index.tsx, etc.), and update imports to use correct paths
- Never create barrel files except in exceptional circumstances (confirm with user first)
- Examine @codaco/protocol-validation and @codaco/shared-consts for reusable types and schemas

## Redux Patterns (Architect app)
- Redux with Redux Toolkit for global state
- Custom timeline middleware for undo/redo
- redux-form for legacy forms (being phased out)
- Redux persistence for protocols and recent files