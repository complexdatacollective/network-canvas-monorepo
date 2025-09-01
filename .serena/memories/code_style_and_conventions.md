# Code Style and Conventions

## Formatting (Biome Configuration)
- **Indentation**: Tabs (not spaces)
- **Line Width**: 120 characters
- **Quote Style**: Double quotes for JavaScript/TypeScript
- **Organize Imports**: Disabled (manual control)

## TypeScript Standards
- **No `any` type**: Explicitly forbidden - always use proper typing
- **Strict mode**: TypeScript strict mode enabled
- **Type definitions**: Comprehensive typing required

## Testing Standards
- **Framework**: Vitest
- **Pattern**: Describe blocks for test organization
- **Assertions**: Using `expect()` assertions
- **Test Structure**: Arrange-Act-Assert pattern
- **Test Files**: Located in `__tests__` directories with `.test.ts` extension

## File Organization
- **No barrel files**: Avoid index.js/index.ts files except in exceptional circumstances
- **Explicit imports**: Import specific items rather than using barrel exports
- **Modular structure**: Break complex schemas into focused modules

## Validation Patterns
- **Zod schemas**: Primary validation library
- **superRefine**: Used for complex cross-reference validation
- **Helper functions**: Validation helpers in separate modules
- **Error messages**: Descriptive, context-aware error messages

## Git and Development
- **Husky**: Git hooks for pre-commit checks
- **Lint-staged**: Automatic formatting on staged files
- **Changesets**: For version management and changelog generation