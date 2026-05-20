# `@codaco/protocol-utilities` package extraction

## Background

The `synthetic/` subdirectory inside `@codaco/interview` contains two distinct things that share infrastructure:

- **`generateNetwork`** — a pure function (`src/synthetic/generateNetwork.ts`, ~840 lines) that produces an `NcNetwork` from a codebook + stages, used to preview protocols and seed tests. Already publicly exported from `@codaco/interview`; the only external consumer today is `apps/architect-web/src/components/PreviewHost/PreviewHost.tsx`.
- **`SyntheticInterview`** — a fluent builder class (`src/synthetic/SyntheticInterview.ts`, ~1640 lines) that constructs codebooks, stages, prompts, and full interview payloads for Storybook stories. Currently internal to `@codaco/interview`; all 16 consumers are sibling `*.stories.tsx` files.

Both rely on `ValueGenerator` (`@faker-js/faker` wrapper), shared `types.ts`, and shared `constants.ts` (default colors, default options, component→variable mapping).

Neither piece is a runtime concern of the interview engine. Keeping them inside `@codaco/interview` means:

- The published runtime bundle carries dead code for any consumer that doesn't generate synthetic data.
- `architect-web` depends on the full interview package only to call one pure function.
- The synthetic surface and the engine's session/store surface evolve together even though they have no shared logic.

Extracting them into a new workspace package, `@codaco/protocol-utilities`, separates these concerns and lets the two surfaces version independently.

## Scope

In:

- Create a new workspace package `packages/protocol-utilities/`.
- Move the entire `packages/interview/src/synthetic/` directory into it (5 source files + 2 test files).
- Make `generateNetwork` (+ its option/result types) and `SyntheticInterview` the new package's public API.
- Update the two external consumers (`architect-web` and `interview`'s Storybook stories) to import from the new package.
- Remove the now-defunct exports from `@codaco/interview/src/index.ts` and add a changeset.

Out:

- No behavioural changes to `generateNetwork` or `SyntheticInterview`.
- No new abstractions, helpers, or API additions.
- `@codaco/interview`'s runtime entry point and other public exports are untouched.
- No move of `StageMetadataSchema` or other interview-owned types — they stay in `@codaco/interview`.

## Package layout

```
packages/protocol-utilities/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── README.md
└── src/
    ├── index.ts                          # build entry; only re-export file in the package
    ├── generateNetwork.ts
    ├── SyntheticInterview.ts
    ├── ValueGenerator.ts
    ├── types.ts
    ├── constants.ts
    └── __tests__/
        ├── generateNetwork.test.ts
        └── SyntheticInterview.test.ts
```

The `synthetic/` subdirectory is flattened away — the package itself is now this concern. `src/index.ts` is the only re-export file, matching the convention already documented at the top of `@codaco/interview`'s `src/index.ts`.

### `src/index.ts`

Explicit named re-exports only, no wildcard, no default barrel:

```ts
// Public API for @codaco/protocol-utilities.
// This is the only re-export file in the package. All internal modules
// import from each other directly.

export type {
  GenerateNetworkOptions,
  GenerateNetworkResult,
} from './generateNetwork';
export { generateNetwork } from './generateNetwork';
export { SyntheticInterview } from './SyntheticInterview';
```

### `package.json`

Modelled on `@codaco/network-query`'s package (which is the simplest current sibling library package):

```jsonc
{
  "name": "@codaco/protocol-utilities",
  "version": "1.0.0-alpha.0",
  "description": "Synthetic network generation and interview-payload builder for Network Canvas protocols.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/complexdatacollective/network-canvas-monorepo.git",
    "directory": "packages/protocol-utilities",
  },
  "files": ["dist"],
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js",
    },
  },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch",
    "typecheck": "tsc --build --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf .turbo node_modules dist",
  },
  "dependencies": {
    "@codaco/network-query": "workspace:^",
    "@codaco/protocol-validation": "workspace:^",
    "@codaco/shared-consts": "workspace:^",
    "@faker-js/faker": "catalog:",
    "es-toolkit": "catalog:",
    "uuid": "catalog:",
    "zod": "catalog:",
  },
  "devDependencies": {
    "@codaco/interview": "workspace:^",
    "@codaco/tsconfig": "workspace:*",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vite-plugin-dts": "catalog:",
    "vitest": "catalog:",
  },
}
```

The exact dependency list is derived from the imports in the moved files — verify against `grep "^import" src/*.ts` after the move.

### `tsconfig.json`

Mirrors `@codaco/network-query`'s tsconfig (`composite: true`, `outDir: dist`, extends `@codaco/tsconfig/base.json`).

### `vite.config.ts`

Library mode with `vite-plugin-dts`, single ESM entry — same shape as `@codaco/network-query`.

### `vitest.config.ts`

Plain `defineConfig({ test: { environment: 'node' } })` is enough — both moved tests are node-only (no jsdom, no React).

## Code-level changes during the move

### `generateNetwork.ts` — resolve the two parent-dir imports

Today:

```ts
import type { DyadCensusMetadataItem } from '../store/modules/session';
import type { VariableOptions } from '../utils/codebook';
```

After the move:

- `DyadCensusMetadataItem` → inline at the top of `generateNetwork.ts` as
  `type DyadCensusMetadataItem = [number, string, string, boolean];`
  with a one-line comment noting the structural mirror with `@codaco/interview`'s
  Zod tuple. The two definitions are independent uses of the same shape; the
  engine's Zod tuple stays put.
- `VariableOptions` → copy the 5-line shim verbatim (with the existing TODO
  comment about `@codaco/protocol-validation`) into `src/types.ts`. The TODO
  still applies — moving the shim does not solve it.

### `generateNetwork.test.ts` — switch the path alias

Today:

```ts
import { StageMetadataSchema } from '~/store/modules/session';
```

After the move:

```ts
import { StageMetadataSchema } from '@codaco/interview';
```

`StageMetadataSchema` is already publicly exported from `@codaco/interview`'s `src/index.ts` via `./session-schemas`. The test continues to validate that `generateNetwork`'s output conforms to the engine's runtime schema. This is the dev-dep cycle described under [Workspace dependency direction](#workspace-dependency-direction) below; it's intentional and benign.

### `SyntheticInterview.test.ts`

The `../SyntheticInterview` relative import stays as-is. No other changes needed.

### `SyntheticInterview.ts`, `ValueGenerator.ts`, `types.ts`, `constants.ts`

Move verbatim. None of them import outside `synthetic/` today, so the move is mechanical. Verify with `grep "from '\.\." src/synthetic/` against the source before the move.

## Updates outside the new package

1. **`packages/interview/src/synthetic/`** — delete the directory after the move (including tests).
2. **`packages/interview/src/index.ts`** — remove these three lines:
   ```ts
   export type {
     GenerateNetworkOptions,
     GenerateNetworkResult,
   } from './synthetic/generateNetwork';
   export { generateNetwork } from './synthetic/generateNetwork';
   ```
3. **`packages/interview/src/interfaces/**/\*.stories.tsx`** — 16 files. Replace each occurrence of
`import { SyntheticInterview } from '~/synthetic/SyntheticInterview';`with`import { SyntheticInterview } from '@codaco/protocol-utilities';`.
   Mechanical per-file edit.
4. **`packages/interview/package.json`** — add `"@codaco/protocol-utilities": "workspace:^"` to `devDependencies`. Stories and stories' Vitest run consume it; the runtime bundle does not.
5. **`apps/architect-web/src/components/PreviewHost/PreviewHost.tsx`** — split the existing `from '@codaco/interview'` import: `generateNetwork` moves to a new `from '@codaco/protocol-utilities'` import; the other named imports stay on `@codaco/interview`.
6. **`apps/architect-web/package.json`** — add `"@codaco/protocol-utilities": "workspace:*"` to `dependencies`.
7. **`.changeset/`** — add a changeset describing the extraction (minor bump on `@codaco/interview` for the breaking removal of `generateNetwork` from its surface, plus the new package at its initial version).
8. **`pnpm-workspace.yaml`** — no change (the `packages/*` glob already covers the new directory).

## Workspace dependency direction

Runtime edges, after the change:

```
@codaco/architect-web ──▶ @codaco/protocol-utilities
                       ╲
                        ▶ @codaco/interview ─▶ (no edge to protocol-utilities)
```

Dev-dep edges (cyclic, intentional):

```
@codaco/protocol-utilities  devDeps──▶  @codaco/interview   (test imports StageMetadataSchema)
@codaco/interview           devDeps──▶  @codaco/protocol-utilities  (stories import SyntheticInterview)
```

The cycle is confined to dev dependencies — pnpm with `linkWorkspacePackages: true` handles this. Runtime resolution stays acyclic.

## Verification

Run from the repo root after the move:

- `pnpm install` — pnpm picks up the new workspace package and links the new dev-dep cycle.
- `pnpm --filter @codaco/protocol-utilities build` — produces `dist/index.{js,d.ts}`.
- `pnpm --filter @codaco/protocol-utilities test` — both moved test files pass.
- `pnpm --filter @codaco/protocol-utilities typecheck` — clean.
- `pnpm --filter @codaco/interview typecheck` — clean after stories switch import path.
- `pnpm --filter @codaco/interview test` — engine tests untouched, pass.
- `pnpm --filter @codaco/interview test:storybook` — stories still render with `SyntheticInterview` from the new package.
- `pnpm --filter @codaco/architect-web typecheck` — `PreviewHost` import split is clean.
- `pnpm typecheck`, `pnpm lint`, `pnpm knip` from the monorepo root — no regressions.
- `pnpm build` — full monorepo build green.

## Tradeoffs and rejected alternatives

- **Move only `generateNetwork`, leave `SyntheticInterview` behind.** Would force duplicating `ValueGenerator`, the shared types, and constants between two packages, since the two builders share that infrastructure. The duplication cost outweighs any benefit from keeping `SyntheticInterview` private.
- **Move everything but keep `SyntheticInterview` behind a `/internal` subpath export.** Avoids committing to its public API in the new package, but `SyntheticInterview` is large (1640 lines) and the 16 in-repo callers already pin every method it has. Hiding it behind a subpath signals a privacy that isn't real. Plain public export.
- **Solve the `VariableOptions` TODO by adding the type to `@codaco/protocol-validation` first.** Out of scope — the shim is five lines and the TODO is independent of this extraction.
- **Move `StageMetadataSchema` to the new package.** Wrong owner — that schema describes session state managed by the interview engine. Keeping it in `@codaco/interview` and accepting a dev-dep cycle is the simpler and more accurate placement.
