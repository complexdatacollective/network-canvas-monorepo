# A5 — Monorepo conventions for `@codaco/fresco-ui`

Investigation captured 2026-04-29 from the `feat/fresco-ui-package` worktree. All findings read-only; no source files modified.

## 1. `@codaco/tsconfig`

The shared package lives at `tooling/typescript/`. Its `package.json` exports two configs via the `files` array (no `exports` map — they are accessed by direct path):

```json
{
  "name": "@codaco/tsconfig",
  "private": true,
  "version": "0.1.0",
  "files": ["base.json", "web.json"]
}
```

So consumers reference them as `"@codaco/tsconfig/base.json"` or `"@codaco/tsconfig/web.json"`.

**`base.json`** (full content):

- `target: ES2024`, `lib: ["ES2024"]`
- `module: esnext`, `moduleResolution: Bundler`
- `noEmit: true`, `noUncheckedIndexedAccess: true`, `erasableSyntaxOnly: true`
- `jsx: preserve`, `incremental: true`, `allowJs: true`, `skipLibCheck: true`
- `exclude: ["node_modules", "build", "dist", ".next", ".expo"]`

**`web.json`**:

- Extends `./base.json`
- Adds `lib: ["dom", "dom.iterable", "ES2024"]`

**Recommendation for `@codaco/fresco-ui`**:

Extend `@codaco/tsconfig/web.json` (the package targets browsers + JSX). Mirror the pattern used by `packages/ui` and `packages/network-exporters`:

```json
{
  "extends": "@codaco/tsconfig/web.json",
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "node_modules/.cache/tsbuildinfo.json",
    "outDir": "dist"
  },
  "include": ["src", "vite.config.ts"],
  "exclude": ["node_modules", "dist", "**/__tests__/**"]
}
```

Notes:

- `composite: true` and a per-package `tsBuildInfoFile` are universal across the monorepo packages; required so `tsc --build` works across the workspace.
- `network-exporters` overrides `noEmit` indirectly via the `vite build` step that calls `tsgo --noEmit` separately; the build itself is `vite build` which honors the `outDir` set in the config (`dist`). Keep `noEmit: true` inherited from base.
- Use `web.json` (not `base.json`) because we need DOM types for React components.
- Add `"types": ["node"]` only if vite config needs it; UI package does not.

## 2. Biome

**Root `biome.json`** (`/biome.json`) is the canonical config — `formatter.indentStyle: tab`, `lineWidth: 120`, `quoteStyle: double`, `linter.domains.project: all`, organize-imports on, `useConsistentTypeDefinitions: type` (matches Fresco's `type` over `interface` rule).

**Per-package convention** (used by `packages/ui`, `packages/protocol-validation`, `packages/shared-consts`, `packages/art`):

```json
{
  "root": false,
  "$schema": "https://biomejs.dev/schemas/2.4.13/schema.json",
  "extends": "//",
  "files": {
    "includes": ["**"]
  }
}
```

Key bits:

- `extends: "//"` — Biome's nearest-root resolution. Inherits everything from the workspace root.
- `root: false` — declares this is a non-root config.
- `files.includes: ["**"]` — per-package files glob; needed because the root config's `files.includes` excludes individual packages (e.g. `network-query`, `interviewer`) and we want defaults inside this package.

`packages/network-query` overrides this to disable lint+format entirely (legacy package). `packages/network-exporters` has no `biome.json` at all — it just inherits the root via filesystem inheritance, which still works. Both are exceptions; **the new package should use the standard `extends: "//"` shape**.

The root config does not appear to exclude `packages/fresco-ui` from the `files.includes` array (only `packages/network-query` is listed), so no root-level changes are required.

## 3. Turbo

`turbo.json` defines tasks generically by name with wildcard inputs. The package will be auto-picked up because:

- `pnpm-workspace.yaml` includes `packages/*`
- All turbo task `inputs` arrays use unscoped globs (`src/**`, `tsconfig*.json`, `vite.config.*`, `package.json`) that work for any new package.

Generic tasks defined:

- `build` — `dependsOn: ["^build"]`, outputs `dist/**, out/**, .next/**`
- `dev` — `cache: false, persistent: true`
- `test` — inputs include `__tests__/**`, `vitest.config.*`
- `test:watch` — `cache: false, persistent: true`
- `typecheck` — `dependsOn: ["^build"]`

Only one package-specific override exists (`network-canvas-architect#build`). **No `turbo.json` changes are required for `@codaco/fresco-ui`** as long as its `package.json` scripts use the standard names (`build`, `dev`, `test`, `typecheck`) and emit to `dist/`.

If we add a Storybook script (`storybook`, `build-storybook`), turbo will treat them as uncached/unknown by default — fine for now; we can add task entries later if we want them parallelized in CI.

## 4. `pnpm-workspace.yaml`

Workspaces glob: `apps/*`, `packages/*`, `tooling/*`, `workers/*`. `packages/fresco-ui` will be auto-included.

Catalog already has every dep we need: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `class-variance-authority` (0.7.1), `clsx`, `tailwind-merge`, `lucide-react`, `motion`, `tailwindcss` (v4), `@tailwindcss/postcss`, `@tailwindcss/typography`, `@tailwindcss/container-queries`, `tailwindcss-animate`, `vite`, `vite-plugin-dts`, `vitest`, `typescript`, `zod`, `es-toolkit`, plus the full `@radix-ui/*` set. The new package should use `catalog:` for all of these — consistent with `packages/ui`.

`onlyBuiltDependencies` already covers the relevant native deps (`@biomejs/biome`, `esbuild`, `sharp`, `@tailwindcss/oxide`, `@swc/core`).

## 5. Vite library template (from `network-exporters`)

This is the freshest reference. **It already uses Vite 8 / Rolldown** (`rolldownOptions`, not `rollupOptions`). Catalog pins `vite: ^8.0.10`.

Annotated template to lift for `@codaco/fresco-ui`:

```ts
/// <reference types="vitest" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        // KEEP shape: object map with subpath keys → fully-qualified entry files.
        // CHANGE: replace exporter entries with fresco-ui's surface
        //   (e.g. index, Button, Dialog, primitives/*, fields/* … aligning
        //    with the `exports` map in package.json; finalised in A1/A2/D).
        index: resolve(__dirname, 'src/index.ts'),
      },
      formats: ['es'],
    },
    rolldownOptions: {
      // KEEP: use rolldownOptions (Vite 8 / Rolldown migration is done).
      // CHANGE: list every peer dep + non-bundled dep so they stay external.
      // Mirror network-exporters by including the catalog deps we actually
      // import: react, react-dom, react/jsx-runtime, class-variance-authority,
      // clsx, tailwind-merge, lucide-react, motion, all @radix-ui/* used,
      // and any /^@codaco\/.../ workspace deps.
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        // …radix, cva, clsx, tailwind-merge, lucide-react, motion, …
      ],
    },
  },
  plugins: [
    dts({
      // KEEP: vite-plugin-dts catalog version (^4.5.4).
      rollupTypes: false,
      insertTypesEntry: false,
    }),
  ],
});
```

Notes on what to keep vs change:

- **Keep**: `formats: ["es"]` (ESM-only), `rolldownOptions` (NOT `rollupOptions`), `vite-plugin-dts` with `rollupTypes: false` and `insertTypesEntry: false` so each entry gets its own colocated `.d.ts` (matches the pattern used by per-export `types` paths in `package.json`).
- **Change**: entry map → fresco-ui surface decided in A1/A2/D; external list → react ecosystem + radix + the catalog runtime deps (no `node:` builtins for a browser package).
- **Note**: `protocol-validation/vite.config.ts` still uses the older single-entry `lib.entry: resolve(...)` shape with `name`/`fileName`. The newer `network-exporters` shape (object entries) is the right reference for a multi-entry package.
- **Build script**: every package uses `"build": "tsgo --noEmit && vite build"`. `tsgo` is the TypeScript-Go preview compiler used for typecheck-only; the `vite build` does the actual emission.

## 6. Existing `@codaco/ui` reference

**Lift**: `src/utils.ts` — the `cn` helper:

```ts
import type { CxOptions } from 'class-variance-authority';
import { cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: CxOptions) => twMerge(cx(inputs));

export { cn };
```

This is exactly what Fresco's `~/utils/shadcn` provides today (uses `cx` from cva instead of bare `clsx`). The new package can ship the same helper at `src/utils.ts` (or `src/cn.ts`).

**Do NOT copy**:

- `package.json` shape — `"private": true`, `"exports": { ".": "./src/index.ts" }` (no build, raw TS exported). `@codaco/fresco-ui` will be a published, built package: needs `dist/` exports, multi-entry exports map, `"private": false` (or omitted).
- `src/index.ts` — a flat barrel re-exporting everything. Fresco's CLAUDE.md and the user's global instructions both forbid barrel files. Use the multi-entry `exports` map approach (per-component subpaths) instead.
- `tailwind.config.ts` — Tailwind v3 preset wiring via `@codaco/tailwind-config/fresco`. The new package is CSS-first Tailwind v4: ships a `tokens.css` / theme layer and consumers wire it via PostCSS, not a JS preset. The legacy preset is being retired in Phase F.

## 7. Storybook

`find packages apps -maxdepth 4 -name '.storybook' -type d` returns nothing. A grep for `*.stories.*` files across the monorepo also returned no matches.

**Confirmed: no Storybook setup exists in the monorepo.** `@codaco/fresco-ui` will be the first. Phase D will need to scaffold `.storybook/` from scratch (Storybook 9.x with Vite builder, react-vite framework). No precedent to follow inside this repo — Fresco's existing Storybook config in the consumer repo is the closest reference.

## Summary table

| Convention              | Decision                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `tsconfig.extends`      | `@codaco/tsconfig/web.json`                                                                          |
| `biome.json.extends`    | `"//"` with `root: false` and `files.includes: ["**"]`                                               |
| Turbo changes           | None required                                                                                        |
| Vite shape              | Multi-entry `lib.entry` object + `rolldownOptions.external`; copy `network-exporters/vite.config.ts` |
| Build script            | `"tsgo --noEmit && vite build"`                                                                      |
| `cn` helper             | Copy `packages/ui/src/utils.ts` verbatim                                                             |
| Barrel-style `index.ts` | **Avoid** — use multi-entry exports map                                                              |
| Storybook precedent     | None in monorepo; scaffold fresh                                                                     |
