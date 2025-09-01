# Development Commands and Scripts

## Primary Commands (from root)
- `pnpm build`: Build all packages
- `pnpm dev`: Start development mode for all packages
- `pnpm test`: Run all tests
- `pnpm test:watch`: Run tests in watch mode

## Code Quality Commands
- `pnpm format-and-lint`: Check formatting and linting with Biome
- `pnpm format-and-lint:fix`: Fix formatting and linting issues automatically
- `pnpm typecheck-all`: Run TypeScript type checking across all packages

## Protocol Validation Package Specific
From `packages/protocol-validation/`:
- `npm run build`: Build the package
- `npm run dev`: Build in watch mode
- `npm run test`: Run package tests
- `npm run test:watch`: Run tests in watch mode
- `npm run typecheck`: Run TypeScript checking

## Publishing Commands
- `pnpm changeset`: Add a changeset for versioning
- `pnpm version-packages`: Version packages with changesets
- `pnpm publish-packages`: Build and publish packages

## System Commands (Darwin)
Standard Unix commands available:
- `git`, `ls`, `cd`, `grep`, `find`, `cat`, `head`, `tail`
- Package manager: `pnpm`
- Node version manager: Use `.nvmrc` file for version consistency