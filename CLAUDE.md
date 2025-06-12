## Repository Overview

Network Canvas is a monorepo containing multiple applications and packages for conducting network analysis interviews. The project uses pnpm workspaces to manage dependencies across apps and packages.

## Development Commands

### Root Level Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run development servers for all packages
pnpm dev

# Run tests across all packages
pnpm test
pnpm test:watch  # Watch mode

# Lint and format
pnpm lint        # Check with Biome
pnpm lint:fix    # Fix with Biome

# Type check all packages
pnpm typecheck-all
```

### App-Specific Commands

**Architect (Vite) - Protocol Builder**

```bash
cd apps/architect-vite
pnpm dev         # Start Vite dev server
pnpm build       # TypeScript check + Vite build
pnpm test        # Run vitest
pnpm typecheck   # TypeScript check only
```

**Analytics Web - Analytics Dashboard**

```bash
cd apps/analytics-web
pnpm dev         # Next.js dev with Turbopack
pnpm build       # Next.js production build
pnpm test        # Run tests
pnpm migrate     # Run database migrations
pnpm seed        # Seed database
```

**Documentation Site**

```bash
cd apps/documentation
pnpm dev         # Next.js dev server
pnpm build       # Production build with sitemap
pnpm typecheck   # TypeScript check
```

### Testing

- All apps use Vitest for testing
- Run a single test file: `pnpm test path/to/test.test.tsx`
- Run tests in watch mode: `pnpm test:watch`
- architect-vite uses jsdom environment with React Testing Library

## Architecture Overview

### Monorepo Structure

```
├── apps/
│   ├── architect-vite/     # Protocol builder (React/Vite/Redux)
│   ├── analytics-web/      # Analytics dashboard (Next.js/Clerk/Drizzle)
│   └── documentation/      # Docs site (Next.js/MDX)
├── packages/
│   ├── analytics/         # Shared analytics code
│   ├── ui/               # Shared UI components
│   └── protocol-validation/ # Protocol validation logic
└── tooling/
    ├── tailwind/         # Shared Tailwind configs
    └── typescript/       # Shared TypeScript configs
```

### Architect App Architecture

**State Management:**

- Redux with Redux Toolkit for global state
- redux-form for form state (legacy, being phased out)
- Redux persistence for protocols and recent files
- Custom timeline middleware for undo/redo functionality

**Routing:**

- Uses `wouter` for routing (not React Router)
- Custom screen/modal system managed via Redux
- Screens opened with `openScreen(name, params)` action
- Route transitions with Framer Motion

**Key Patterns:**

- Heavy use of Higher-Order Components (HOCs) for shared functionality
- Selectors with reselect for derived state
- Custom error boundaries at multiple levels
- Protocol-centric design with stages, codebook, and assets

**Form System:**

- Built on redux-form (legacy)
- Custom field components in `components/Form/Fields/`
- Validation via custom validation functions
- When refactoring forms: preserve validation behavior and default values

**Protocol Management:**

- Protocols saved as `.netcanvas` files
- Bundle/unbundle system for packaging protocol files with assets
- Asset manifest tracks all protocol resources
- Recent protocols tracked in Redux and persisted

### Code Style and Conventions

**General Conventions:**

- Always use path aliases for imports (e.g., `~/components/`)
- Always use `pnpm` for package management
- Always use typescript for new components
- Examine @codaco/protocol-validation and @codaco/shared-consts for types and schemas that may be reused.
- Biome is used for linting and formatting

**TypeScript:**

- Use types instead of interfaces where possible
- Strict mode enabled
- Path aliases configured (e.g., `~/` for src/)
- Shared configs via `@codaco/tsconfig`

**Component Patterns:**

- Functional components with hooks
- PropTypes being removed in favor of TypeScript. ALWAYS remove defaultProps and replace with TypeScript default parameters. Account for nested objects and arrays in default parameters.
- Tailwind for all new styling - migrating legacy sass styles to Tailwind.

## Important Notes

- Do not run linting or typechecking tasks unless specifically instructed to do so, as they may fail due to the current state of the codebase.
- do not use recompose or HOCs in new components.
- ALWAYS remove recompose and refactor HOCs when they are found in existing components
- prioritize completing modifications to a single file so that you do not run out of context mid way through complex tasks.
- framer-motion (now '@motion') is used for animations and transitions. Other animation systems are present, but should be removed and replaced with motion when encountered.
- Legacy UI components in `/packages/legacy-ui`. These should bemigrated to use radix primitives and Tailwind when required.

## Development Principles

- Always remove unused types after refactoring