# Suggested Development Commands

## Root Level Commands
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

## App-Specific Commands

### Architect (Vite) - Protocol Builder
```bash
cd apps/architect-vite
pnpm dev         # Start Vite dev server
pnpm build       # TypeScript check + Vite build
pnpm test        # Run vitest
pnpm typecheck   # TypeScript check only
```

### Analytics Web - Analytics Dashboard
```bash
cd apps/analytics-web
pnpm dev         # Next.js dev with Turbopack
pnpm build       # Next.js production build
pnpm test        # Run tests
pnpm migrate     # Run database migrations
pnpm seed        # Seed database
```

### Documentation Site
```bash
cd apps/documentation
pnpm dev         # Next.js dev server
pnpm build       # Production build with sitemap
pnpm typecheck   # TypeScript check
```

## System Commands (Darwin/macOS)
- `ls`, `cd`, `grep`, `find` - standard Unix commands
- `git` - version control
- Package management via `pnpm` (not npm or yarn)