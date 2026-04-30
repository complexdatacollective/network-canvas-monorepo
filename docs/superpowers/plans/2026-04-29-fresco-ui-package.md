# `@codaco/fresco-ui` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Fresco's `components/ui/` directory (and supporting styles, utilities, hooks) out of `~/Projects/fresco-next` into a new package `@codaco/fresco-ui` published from the `~/Projects/network-canvas` monorepo. Fresco then consumes the package via npm.

**Architecture:** Vite 8 (Rolldown) library mode with multi-entry per-component subpath exports — no barrel files. Tailwind v4 CSS-first configuration; the package ships a single `styles.css` that consumers `@import` (no JS preset). Storybook lives in the package as the first Storybook in the monorepo. Subsystem internals (form/collection/dnd/dialogs) are bundled but kept private via a curated public-API allowlist that drives both the `package.json` `exports` map and Vite's `lib.entry` list.

**Tech Stack:** TypeScript 6, React 19, Vite 8 + Rolldown, vite-plugin-dts, Tailwind v4 (CSS-first), Biome, Vitest, Storybook 9 (`@storybook/react-vite`), pnpm workspaces, Turbo, Changesets.

**Spec:** `docs/superpowers/specs/2026-04-29-fresco-ui-package-design.md` — read this first.

**Two-repo work:** Tasks live in either the monorepo (`~/Projects/network-canvas`) or Fresco (`~/Projects/fresco-next`). Each task names which.

---

## Phase A — Pre-flight investigations

These resolve unknowns from spec §8 before destructive work begins. Each produces a notes file under `docs/superpowers/plans/findings/2026-04-29-fresco-ui/` in the **monorepo**. The findings inform later tasks; do not skip them.

### Task A1: Catalog the components/ui surface

**Repo:** Fresco (`~/Projects/fresco-next`)
**Files:**
- Read: `components/ui/**/*.{ts,tsx,css}`
- Create: `~/Projects/network-canvas/docs/superpowers/plans/findings/2026-04-29-fresco-ui/A1-surface.md`

- [ ] **Step 1: Enumerate every file under `components/ui/`**

```bash
cd ~/Projects/fresco-next && \
  find components/ui -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
    | sort > /tmp/fresco-ui-files.txt && \
  wc -l /tmp/fresco-ui-files.txt
```

- [ ] **Step 2: Identify imports each component makes outside `components/ui/`**

```bash
grep -rh "from '~/" ~/Projects/fresco-next/components/ui \
  | grep -v "from '~/components/ui" \
  | sort -u > /tmp/external-imports.txt
```

- [ ] **Step 3: List every file in Fresco that imports from `~/components/ui/...`**

```bash
grep -rln "from '~/components/ui" ~/Projects/fresco-next \
  --include='*.ts' --include='*.tsx' \
  | sort -u > /tmp/importers.txt && \
  wc -l /tmp/importers.txt
```

- [ ] **Step 4: Build a public-API import inventory**

```bash
grep -rh "from '~/components/ui" ~/Projects/fresco-next \
  --include='*.ts' --include='*.tsx' \
  | sed -E "s|.*from '~/components/ui/([^']+)'.*|\1|" \
  | sort -u > /tmp/public-imports.txt
```

This list is the seed for the public allowlist in Task D2.

- [ ] **Step 5: Write findings**

In `A1-surface.md`, record:
- Total file count under `components/ui/`
- The list of external `~/...` imports the components depend on (excluding `~/components/ui/...`)
- The list of importing files (count + sample)
- The deduplicated set of public import paths Fresco currently uses (Step 4 output, verbatim)

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/network-canvas && \
  git add docs/superpowers/plans/findings/2026-04-29-fresco-ui/A1-surface.md && \
  git commit -m "docs(fresco-ui): A1 surface inventory"
```

---

### Task A2: Resolve phantom `lib/dnd`/`lib/dialogs`/`lib/form`/`lib/collection` git-status entries

**Repo:** Fresco
**Files:**
- Inspect: Fresco git index, working tree
- Create: `~/Projects/network-canvas/docs/superpowers/plans/findings/2026-04-29-fresco-ui/A2-phantom-lib-paths.md`

- [ ] **Step 1: Compare git's view to disk**

```bash
cd ~/Projects/fresco-next && \
  git status --short | grep -E "lib/(dnd|dialogs|form|collection)" || echo "none"
```

- [ ] **Step 2: Check ls vs git ls-files**

```bash
cd ~/Projects/fresco-next && \
  for d in lib/dnd lib/dialogs lib/form lib/collection; do \
    echo "=== $d ==="; ls "$d" 2>&1 || true; \
    echo "--- git ---"; git ls-files "$d" | head -5 || true; \
  done
```

- [ ] **Step 3: Inspect git stashes for the same paths**

```bash
cd ~/Projects/fresco-next && git stash list && \
  git stash show -p stash@{0} 2>/dev/null | head -40 || true
```

- [ ] **Step 4: Decide**

If the entries reflect an in-flight branch or stash that intends to introduce `lib/dnd` etc., **stop the migration and surface to the user** — the parallel work would conflict. Otherwise document that the entries are stale/historic and proceed.

- [ ] **Step 5: Write findings**

Record the disposition in `A2-phantom-lib-paths.md`. Include the disposition decision (proceed vs. block) and the evidence.

- [ ] **Step 6: Commit (monorepo)**

```bash
cd ~/Projects/network-canvas && \
  git add docs/superpowers/plans/findings/2026-04-29-fresco-ui/A2-phantom-lib-paths.md && \
  git commit -m "docs(fresco-ui): A2 phantom lib path resolution"
```

---

### Task A3: Inventory every dependency the migrated code uses

**Repo:** Fresco
**Files:**
- Read: every file under `components/ui/`, `utils/cva.ts`, `utils/generatePublicId.ts`, `utils/prettify.ts`, `hooks/useSafeAnimate.ts`, `lib/interviewer/utils/scrollParent.ts`, `styles/shared/`, `styles/plugins/`
- Create: `~/Projects/network-canvas/docs/superpowers/plans/findings/2026-04-29-fresco-ui/A3-deps.md`

- [ ] **Step 1: Extract all third-party imports across the migration scope**

```bash
cd ~/Projects/fresco-next && \
  ( find components/ui utils/cva.ts utils/generatePublicId.ts utils/prettify.ts \
       hooks/useSafeAnimate.ts lib/interviewer/utils/scrollParent.ts \
       styles/shared styles/plugins -type f 2>/dev/null \
    | xargs grep -h "^import" 2>/dev/null \
  ) | grep -oE "from ['\"][^'\"]+['\"]" \
    | grep -vE "from ['\"]\.\.?/" \
    | grep -vE "from ['\"]~/" \
    | sort -u > /tmp/deps.txt && cat /tmp/deps.txt
```

- [ ] **Step 2: Resolve each dependency to a current version from Fresco's `package.json`**

For each unique package name from Step 1, look up Fresco's installed version (`pnpm --filter fresco list <pkg>`) and the monorepo catalog version (`/Users/jmh629/Projects/network-canvas/pnpm-workspace.yaml`).

- [ ] **Step 3: Write findings**

In `A3-deps.md`, record a table:

| Package | Fresco version | Monorepo catalog version | Resolution |
|---|---|---|---|

Resolution column values:
- `catalog` — both match the catalog entry; reference `catalog:` in the package
- `add-to-catalog` — Fresco has a version not yet in the monorepo catalog; **add it to the catalog first** (Task B2)
- `direct` — keep Fresco's specific version pinned in the package's `dependencies` (only if catalog adoption is impractical)

Include a section listing **peer-dependency candidates** — `react`, `react-dom`, anything used at the API surface (e.g. `@radix-ui/react-slot` for `asChild` patterns, `@reduxjs/toolkit` if subsystems expose store types). Default to `dependencies` unless ambiguity makes peer-dep correct.

- [ ] **Step 4: Commit (monorepo)**

```bash
cd ~/Projects/network-canvas && \
  git add docs/superpowers/plans/findings/2026-04-29-fresco-ui/A3-deps.md && \
  git commit -m "docs(fresco-ui): A3 dependency inventory"
```

---

### Task A4: Inspect the four subsystems for hidden coupling

**Repo:** Fresco
**Files:**
- Read: every file under `components/ui/{form,collection,dnd,dialogs}/`
- Create: `~/Projects/network-canvas/docs/superpowers/plans/findings/2026-04-29-fresco-ui/A4-subsystems.md`

- [ ] **Step 1: For each subsystem, list non-`components/ui` `~/` imports**

```bash
for sub in form collection dnd dialogs; do
  echo "=== $sub ==="
  grep -rh "from '~/" ~/Projects/fresco-next/components/ui/$sub 2>/dev/null \
    | grep -v "from '~/components/ui" \
    | sort -u
done
```

The form subsystem's known coupling is `~/lib/interviewer/selectors/forms` (only via `useProtocolForm.tsx`). Confirm no other unexpected imports.

- [ ] **Step 2: Audit subsystem `__tests__/` for Fresco-specific test setup**

```bash
for sub in form collection dnd dialogs; do
  find ~/Projects/fresco-next/components/ui/$sub -name '__tests__' -type d -exec ls {} \;
done
grep -rln "vitest.setup\|setupFiles\|vi.mock.*~/" ~/Projects/fresco-next/components/ui 2>/dev/null
```

- [ ] **Step 3: Read Fresco's vitest configuration**

```bash
find ~/Projects/fresco-next -maxdepth 2 -name 'vitest.config.*' -o -name 'vitest.setup.*' 2>/dev/null
```

- [ ] **Step 4: Write findings**

For each subsystem, in `A4-subsystems.md` record:
- External imports (those not under `components/ui/` and not under `~/utils/cva`/etc. that already travel)
- Whether tests rely on Fresco-specific setup files; if yes, what
- Recommended action: clean migrate / migrate with reshape (and what reshape) / leave behind

- [ ] **Step 5: Commit (monorepo)**

```bash
cd ~/Projects/network-canvas && \
  git add docs/superpowers/plans/findings/2026-04-29-fresco-ui/A4-subsystems.md && \
  git commit -m "docs(fresco-ui): A4 subsystem coupling audit"
```

---

### Task A5: Read the existing monorepo conventions

**Repo:** Monorepo (`~/Projects/network-canvas`)
**Files:**
- Read: `tooling/typescript/tsconfig.json` (or whatever the package exposes), `biome.json`, `turbo.json`, `pnpm-workspace.yaml`, `packages/network-exporters/{package.json, vite.config.ts, tsconfig.json}` (a recent Vite-library example), `packages/ui/{package.json, src/index.ts, src/utils.ts}`
- Create: `~/Projects/network-canvas/docs/superpowers/plans/findings/2026-04-29-fresco-ui/A5-monorepo-conventions.md`

- [ ] **Step 1: Read the conventions** (commands, no edits)

- [ ] **Step 2: Write findings**

In `A5-monorepo-conventions.md`, record:
- The `@codaco/tsconfig` `extends` shape and which exported config to extend
- The Biome root-config path the package's `biome.json` should `extends`
- The Vite library-mode pattern in use (`packages/network-exporters/vite.config.ts` is the freshest reference)
- The `package.json` shape of an existing published `@codaco/*` package
- Any monorepo-wide build hooks worth knowing (`turbo.json` `inputs`, `outputs`, `dependsOn`)

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/network-canvas && \
  git add docs/superpowers/plans/findings/2026-04-29-fresco-ui/A5-monorepo-conventions.md && \
  git commit -m "docs(fresco-ui): A5 monorepo conventions"
```

---

### Task A6: Verify Vite 8 + Rolldown + vite-plugin-dts compatibility

**Repo:** Monorepo
**Files:**
- Read: latest official docs (Vite 8 release notes, Rolldown library guide, vite-plugin-dts README)
- Create: `~/Projects/network-canvas/docs/superpowers/plans/findings/2026-04-29-fresco-ui/A6-build-tooling.md`

- [ ] **Step 1: Confirm `build.rolldownOptions` is the canonical name in Vite 8**

Read https://vite.dev/guide/migration and https://vite.dev/config/build-options. Note any compat-layer behaviour for `rollupOptions` aliases.

- [ ] **Step 2: Confirm `output.preserveModules` status**

Re-check https://github.com/rolldown/rolldown/issues/2622. If the feature has shipped since 2026-04-29, prefer it (cleaner output) over the multi-entry strategy.

- [ ] **Step 3: Confirm `vite-plugin-dts` is published with Vite-8 compatibility**

Check the `vite-plugin-dts` GitHub releases / npm versions for any 2026-Q1 release that explicitly names Vite 8.

- [ ] **Step 4: Write findings**

In `A6-build-tooling.md`, record:
- Confirmed Vite 8 lib config syntax (with code example to be used in Task B7)
- Whether `preserveModules` is available (and recommendation)
- vite-plugin-dts compat status; fallback plan if needed

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/network-canvas && \
  git add docs/superpowers/plans/findings/2026-04-29-fresco-ui/A6-build-tooling.md && \
  git commit -m "docs(fresco-ui): A6 build tooling verification"
```

---

## Phase B — Build the package skeleton

Phase B creates the new package on disk in the monorepo with no source code yet, only configuration. Each task ends with a passing `pnpm typecheck` (vacuously, since `src/` is empty for now).

### Task B1: Create the package directory and `package.json`

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/package.json`
- Create: `packages/fresco-ui/.gitignore`
- Create: `packages/fresco-ui/README.md`

- [ ] **Step 1: Create the directory and skeleton files**

```bash
mkdir -p ~/Projects/network-canvas/packages/fresco-ui/src
cd ~/Projects/network-canvas/packages/fresco-ui
```

- [ ] **Step 2: Write `package.json`**

```jsonc
{
  "name": "@codaco/fresco-ui",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "description": "Fresco UI components, styles, and utilities",
  "sideEffects": ["**/*.css"],
  "files": ["dist"],
  "exports": {},
  "scripts": {
    "build": "node scripts/build-exports.mjs && vite build",
    "dev": "vite build --watch",
    "typecheck": "tsc --build --noEmit",
    "test": "vitest run",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "prepublishOnly": "pnpm build",
    "clean": "rm -rf .turbo node_modules dist"
  },
  "peerDependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "dependencies": {},
  "devDependencies": {
    "@codaco/tsconfig": "workspace:*",
    "@biomejs/biome": "^2.4.13",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vite-plugin-dts": "catalog:",
    "tinyglobby": "^0.2.0"
  },
  "publishConfig": { "access": "public" }
}
```

`dependencies` is filled in Task B2 from the A3 inventory. `exports` is generated in Task D2.

- [ ] **Step 3: Write `.gitignore`**

```
dist
.turbo
*.tsbuildinfo
```

- [ ] **Step 4: Write a stub `README.md`**

```markdown
# @codaco/fresco-ui

Fresco UI components, styles, and utilities. See `docs/superpowers/specs/2026-04-29-fresco-ui-package-design.md` for the design spec.
```

- [ ] **Step 5: Run pnpm install at the monorepo root**

```bash
cd ~/Projects/network-canvas && pnpm install
```
Expected: lockfile updates with `@codaco/fresco-ui` as a workspace package.

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui pnpm-lock.yaml && \
  git commit -m "feat(fresco-ui): scaffold package"
```

---

### Task B2: Add migrating dependencies to the package and catalog

**Repo:** Monorepo
**Files:**
- Modify: `pnpm-workspace.yaml` (catalog additions, if A3 surfaced any)
- Modify: `packages/fresco-ui/package.json` (`dependencies`)

- [ ] **Step 1: For each `add-to-catalog` row in A3, append to `pnpm-workspace.yaml`'s `catalog:` block**

For example, if `motion` 12.x and `@tiptap/core` 3.22 aren't in the catalog yet, add them — using the same version Fresco currently has.

- [ ] **Step 2: Update `packages/fresco-ui/package.json` with all migrated dependencies**

Per A3:
- `catalog` rows → `"<pkg>": "catalog:"`
- `direct` rows → `"<pkg>": "<exact version>"`
- Any peer-dep candidates → move to `peerDependencies` instead

- [ ] **Step 3: Install**

```bash
cd ~/Projects/network-canvas && pnpm install
```
Expected: lockfile updates; no errors.

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/fresco-ui/package.json && \
  git commit -m "feat(fresco-ui): add migrating dependencies"
```

---

### Task B3: Create `tsconfig.json`

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/tsconfig.json`

- [ ] **Step 1: Write the tsconfig (extending the monorepo base per A5)**

```jsonc
{
  "extends": "@codaco/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "moduleResolution": "Bundler",
    "noEmit": true,
    "composite": false,
    "tsBuildInfoFile": "./node_modules/.cache/tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.stories.tsx", "src/**/*.test.*", "src/**/__tests__/**"]
}
```

If A5 noted a different exposed config name (e.g. `@codaco/tsconfig/library.json`), use that instead.

- [ ] **Step 2: Run typecheck**

```bash
cd ~/Projects/network-canvas && pnpm --filter @codaco/fresco-ui typecheck
```
Expected: PASS (vacuously — no source files yet).

- [ ] **Step 3: Commit**

```bash
git add packages/fresco-ui/tsconfig.json && \
  git commit -m "feat(fresco-ui): add tsconfig"
```

---

### Task B4: Create `biome.json`

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/biome.json`

- [ ] **Step 1: Write biome config**

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.4.13/schema.json",
  "extends": ["//"],
  "files": {
    "includes": ["src/**/*.{ts,tsx,js,jsx}"]
  }
}
```

If A5 noted a different `extends` value, use it.

- [ ] **Step 2: Run lint at monorepo root**

```bash
cd ~/Projects/network-canvas && pnpm lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/fresco-ui/biome.json && \
  git commit -m "feat(fresco-ui): add biome config"
```

---

### Task B5: Add the package to `turbo.json` (if not auto-included)

**Repo:** Monorepo
**Files:**
- Modify (only if needed per A5): `turbo.json`

- [ ] **Step 1: Verify the existing `turbo.json` build/test/typecheck tasks already cover the new package**

The current `inputs` are `src/**`, `tsconfig*.json`, `vite.config.*`, `package.json`. Confirm `*.css` is also picked up via `src/**`.

- [ ] **Step 2: If gaps surfaced, add `src/**/*.css` explicitly**

Otherwise no change.

- [ ] **Step 3: Run a workspace-wide turbo dry-run**

```bash
cd ~/Projects/network-canvas && pnpm turbo run typecheck --filter @codaco/fresco-ui --dry-run=json | head -40
```

- [ ] **Step 4: Commit (only if `turbo.json` changed)**

```bash
git add turbo.json && git commit -m "chore(turbo): cover fresco-ui inputs"
```

---

### Task B6: Create the public-API allowlist file

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Write a placeholder allowlist**

```ts
// Public API allowlist for @codaco/fresco-ui.
// Each entry is { subpath, source } — `subpath` is what consumers import
// (`./Button` → `@codaco/fresco-ui/Button`), `source` is the file under `src/`
// that the entry resolves to. Keep this list curated and minimal: anything
// not listed here is treated as private and not added to package.json `exports`.

export type ExportEntry = { subpath: string; source: string };

export const exportEntries: ExportEntry[] = [];

export const cssEntries: ExportEntry[] = [];
```

The list is populated in Task D1 from the A1 public-imports inventory.

- [ ] **Step 2: Commit**

```bash
git add packages/fresco-ui/exports.config.ts && \
  git commit -m "feat(fresco-ui): scaffold exports allowlist"
```

---

### Task B7: Create `vite.config.ts`

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/vite.config.ts`
- Create: `packages/fresco-ui/scripts/build-exports.mjs`

- [ ] **Step 1: Write `scripts/build-exports.mjs`**

```js
// scripts/build-exports.mjs
//
// Single source of truth: reads exports.config.ts, validates that every
// listed source file exists, exposes `entries()` for vite.config.ts, and
// writes the `exports` map into package.json so the public API and Vite
// `lib.entry` cannot drift.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

async function loadAllowlist() {
  const { exportEntries, cssEntries } = await import(resolve(pkgRoot, 'exports.config.ts'));
  return { exportEntries, cssEntries };
}

export async function entries() {
  const { exportEntries } = await loadAllowlist();
  const out = {};
  for (const e of exportEntries) {
    const abs = resolve(pkgRoot, 'src', e.source);
    if (!existsSync(abs)) throw new Error(`exports.config.ts: missing source ${e.source}`);
    out[e.subpath.replace(/^\.\//, '')] = abs;
  }
  return out;
}

async function buildExportsMap() {
  const { exportEntries, cssEntries } = await loadAllowlist();
  const map = {};
  for (const e of exportEntries) {
    const distBase = e.source.replace(/\.tsx?$/, '');
    map[e.subpath] = {
      types:   `./dist/${distBase}.d.ts`,
      default: `./dist/${distBase}.js`,
    };
  }
  for (const e of cssEntries) {
    map[e.subpath] = `./dist/${e.source}`;
  }
  return map;
}

async function writePackageJson() {
  const pkgPath = resolve(pkgRoot, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  pkg.exports = await buildExportsMap();
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`wrote ${Object.keys(pkg.exports).length} export entries to package.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writePackageJson();
}
```

This file uses Node's experimental TS import (`import('...exports.config.ts')`). If A6 surfaced that this isn't supported by the Node version Turbo runs, replace the dynamic import with a `tsx` invocation: spawn `tsx scripts/_load-allowlist.ts` instead.

- [ ] **Step 2: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { entries } from './scripts/build-exports.mjs';

const cssCopyPlugin = () => ({
  name: 'fresco-ui-css-copy',
  async closeBundle() {
    // Copy every src/**/*.css to dist/**/*.css verbatim (bypass Vite/Lightning CSS).
    const { globSync } = await import('tinyglobby');
    const files = globSync(['src/**/*.css'], { cwd: import.meta.dirname ?? __dirname });
    for (const rel of files) {
      const out = rel.replace(/^src\//, 'dist/');
      await mkdir(dirname(out), { recursive: true });
      await copyFile(rel, out);
    }
  },
});

export default defineConfig(async () => ({
  build: {
    lib: { entry: await entries(), formats: ['es'] },
    rolldownOptions: {
      external: [
        /^react/, /^react-dom/,
        /^@radix-ui/, /^@base-ui/,
        /^motion/, /^@tiptap/,
        /^lucide-react/,
        /^class-variance-authority/, /^cva/,
        /^clsx/, /^tailwind-merge/,
        /^luxon/,
      ],
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[hash].js' },
    },
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
  },
  plugins: [
    dts({
      include: 'src',
      exclude: ['**/*.stories.tsx', '**/*.test.*', '**/__tests__/**'],
    }),
    cssCopyPlugin(),
  ],
}));
```

If A6 confirmed `output.preserveModules` is available, replace the entire `lib.entry` strategy: set `lib: { entry: 'src/styles.css' /* placeholder */ }` and set `output: { preserveModules: true, preserveModulesRoot: 'src' }`. Adjust `entries()` to return the single style entry plus all per-file entries.

- [ ] **Step 3: Run vite build to confirm config parses**

```bash
cd ~/Projects/network-canvas && \
  pnpm --filter @codaco/fresco-ui build 2>&1 | tail -30
```
Expected: an error about the empty `entries()` output. That's fine; we just need the config to parse. No commit yet — Task B8 will verify a clean run after we add a sentinel entry.

- [ ] **Step 4: Commit**

```bash
git add packages/fresco-ui/vite.config.ts packages/fresco-ui/scripts/build-exports.mjs && \
  git commit -m "feat(fresco-ui): add vite library build config"
```

---

### Task B8: First green build with a sentinel module

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/src/_sentinel.ts`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Write a sentinel source file**

```ts
// src/_sentinel.ts
// Temporary file that lets us validate the build pipeline before any real
// code is migrated. Removed in Task B9.
export const sentinel = '__fresco-ui-build-ok__';
```

- [ ] **Step 2: Add it to the allowlist**

Edit `packages/fresco-ui/exports.config.ts`:

```ts
export const exportEntries: ExportEntry[] = [
  { subpath: './_sentinel', source: '_sentinel.ts' },
];
export const cssEntries: ExportEntry[] = [];
```

- [ ] **Step 3: Build**

```bash
cd ~/Projects/network-canvas && \
  pnpm --filter @codaco/fresco-ui build
```
Expected: `dist/_sentinel.js` and `dist/_sentinel.d.ts` exist; `package.json` `exports` has `./_sentinel`.

- [ ] **Step 4: Verify build artefacts manually**

```bash
ls ~/Projects/network-canvas/packages/fresco-ui/dist/
cat ~/Projects/network-canvas/packages/fresco-ui/dist/_sentinel.d.ts
jq '.exports' ~/Projects/network-canvas/packages/fresco-ui/package.json
```

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui/src/_sentinel.ts \
        packages/fresco-ui/exports.config.ts \
        packages/fresco-ui/package.json && \
  git commit -m "feat(fresco-ui): first green build with sentinel"
```

---

### Task B9: Set up Vitest

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/vitest.config.ts`
- Create: `packages/fresco-ui/src/_sentinel.test.ts`
- Modify: `packages/fresco-ui/package.json` (add vitest devDependency)

- [ ] **Step 1: Add `vitest` and `@testing-library/react` to devDependencies**

In `package.json`:

```jsonc
"devDependencies": {
  "vitest": "catalog:",
  "@testing-library/react": "^16.0.0",
  "@testing-library/jest-dom": "^6.0.0",
  "jsdom": "^26.0.0"
  /* + the existing entries */
}
```

Use catalog versions if A3 / A5 indicate they exist; otherwise the latest stable.

- [ ] **Step 2: Install**

```bash
cd ~/Projects/network-canvas && pnpm install
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
    css: false,
  },
});
```

- [ ] **Step 4: Write the sentinel test**

```ts
// src/_sentinel.test.ts
import { describe, it, expect } from 'vitest';
import { sentinel } from './_sentinel';

describe('_sentinel', () => {
  it('exports the sentinel string', () => {
    expect(sentinel).toBe('__fresco-ui-build-ok__');
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd ~/Projects/network-canvas && \
  pnpm --filter @codaco/fresco-ui test
```
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui/{vitest.config.ts,src/_sentinel.test.ts,package.json} pnpm-lock.yaml && \
  git commit -m "feat(fresco-ui): add vitest configuration"
```

---

## Phase C — Migrate sources

Phase C copies code from Fresco into the package. Each task moves one cohesive group, ending with a green typecheck and (where applicable) tests. **No Fresco files are deleted yet** — that happens in Phase G after Fresco consumes the published package.

The general pattern for every task in Phase C:

1. Copy files (preserve relative path under `src/`).
2. Rewrite imports inside the copied files: `~/components/ui/X` → relative path within `src/`; `~/utils/cva` → `../utils/cva` (or whatever the relative path is); etc.
3. Add the migrated file(s) to `exports.config.ts`.
4. Run typecheck + build → must pass.
5. Run vitest → must pass (if any tests in this group).
6. Commit.

### Task C1: Migrate utilities (`utils/cva`, `generatePublicId`, `prettify`, `scrollParent`)

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/src/utils/cva.ts` (copy of Fresco's `~/utils/cva.ts`)
- Create: `packages/fresco-ui/src/utils/generatePublicId.ts`
- Create: `packages/fresco-ui/src/utils/prettify.ts`
- Create: `packages/fresco-ui/src/utils/scrollParent.ts`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy each utility verbatim**

```bash
cd ~/Projects/network-canvas/packages/fresco-ui
cp ~/Projects/fresco-next/utils/cva.ts            src/utils/cva.ts
cp ~/Projects/fresco-next/utils/generatePublicId.ts src/utils/generatePublicId.ts
cp ~/Projects/fresco-next/utils/prettify.ts       src/utils/prettify.ts
cp ~/Projects/fresco-next/lib/interviewer/utils/scrollParent.ts src/utils/scrollParent.ts
```

- [ ] **Step 2: Read each file and resolve any `~/...` imports**

```bash
grep -n "from '~/" src/utils/*.ts || echo "no remaining ~/ imports"
```

If any exist, resolve them:
- If the import target is *also* migrating in this plan, rewrite to a relative path within `src/`.
- Otherwise stop and surface to the user — the migration scope was supposed to capture every dependency.

- [ ] **Step 3: Migrate any tests for these utilities**

```bash
ls ~/Projects/fresco-next/utils/__tests__/ 2>&1
```

For each test file referencing one of the migrated utilities, copy it under `src/utils/__tests__/` and rewrite imports the same way.

- [ ] **Step 4: Add to allowlist**

In `exports.config.ts`:

```ts
export const exportEntries: ExportEntry[] = [
  { subpath: './_sentinel', source: '_sentinel.ts' },
  { subpath: './utils/cva',              source: 'utils/cva.ts' },
  { subpath: './utils/generatePublicId', source: 'utils/generatePublicId.ts' },
  { subpath: './utils/prettify',         source: 'utils/prettify.ts' },
  { subpath: './utils/scrollParent',     source: 'utils/scrollParent.ts' },
];
```

- [ ] **Step 5: Run typecheck + tests + build**

```bash
cd ~/Projects/network-canvas && \
  pnpm --filter @codaco/fresco-ui typecheck && \
  pnpm --filter @codaco/fresco-ui test && \
  pnpm --filter @codaco/fresco-ui build
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui && \
  git commit -m "feat(fresco-ui): migrate utility modules"
```

---

### Task C2: Migrate `useSafeAnimate` hook

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/src/hooks/useSafeAnimate.ts`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy the hook**

```bash
cp ~/Projects/fresco-next/hooks/useSafeAnimate.ts \
   ~/Projects/network-canvas/packages/fresco-ui/src/hooks/useSafeAnimate.ts
```

- [ ] **Step 2: Resolve `~/` imports**

```bash
grep -n "from '~/" ~/Projects/network-canvas/packages/fresco-ui/src/hooks/useSafeAnimate.ts || echo none
```
Rewrite as in C1 Step 2.

- [ ] **Step 3: Add to allowlist**

```ts
{ subpath: './hooks/useSafeAnimate', source: 'hooks/useSafeAnimate.ts' },
```

- [ ] **Step 4: typecheck + test + build**

Same commands as C1 Step 5. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui && \
  git commit -m "feat(fresco-ui): migrate useSafeAnimate hook"
```

---

### Task C3: Migrate shared styles (controlVariants + colors.css)

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/src/styles/controlVariants.ts`
- Create: `packages/fresco-ui/src/styles/colors.css`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy files**

```bash
cp ~/Projects/fresco-next/styles/shared/controlVariants.ts \
   ~/Projects/network-canvas/packages/fresco-ui/src/styles/controlVariants.ts
cp ~/Projects/fresco-next/styles/shared/colors.css \
   ~/Projects/network-canvas/packages/fresco-ui/src/styles/colors.css
```

- [ ] **Step 2: Resolve `~/` imports in `controlVariants.ts`**

```bash
grep -n "from '~/" ~/Projects/network-canvas/packages/fresco-ui/src/styles/controlVariants.ts || echo none
```
Rewrite to relative paths (e.g. `~/utils/cva` → `../utils/cva`).

- [ ] **Step 3: Add to allowlist**

```ts
// in exportEntries
{ subpath: './styles/controlVariants', source: 'styles/controlVariants.ts' },

// in cssEntries
{ subpath: './styles/colors.css', source: 'styles/colors.css' },
```

- [ ] **Step 4: typecheck + build, then verify CSS reaches dist verbatim**

```bash
cd ~/Projects/network-canvas && \
  pnpm --filter @codaco/fresco-ui typecheck && \
  pnpm --filter @codaco/fresco-ui build && \
  diff packages/fresco-ui/src/styles/colors.css packages/fresco-ui/dist/styles/colors.css
```
Expected: typecheck PASS, build PASS, diff produces **no output** (files identical).

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui && \
  git commit -m "feat(fresco-ui): migrate shared styles"
```

---

### Task C4: Migrate Tailwind plugins

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/src/styles/plugins/elevation/...` (preserve internal layout)
- Create: `packages/fresco-ui/src/styles/plugins/inset-surface/...`
- Create: `packages/fresco-ui/src/styles/plugins/motion-spring.ts`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy each plugin tree**

```bash
cd ~/Projects/network-canvas/packages/fresco-ui
cp -R ~/Projects/fresco-next/styles/plugins/tailwind-elevation     src/styles/plugins/elevation
cp -R ~/Projects/fresco-next/styles/plugins/tailwind-inset-surface src/styles/plugins/inset-surface
cp    ~/Projects/fresco-next/styles/plugins/tailwind-motion-spring.ts src/styles/plugins/motion-spring.ts
```

- [ ] **Step 2: Resolve `~/` imports inside each plugin**

```bash
grep -rn "from '~/" src/styles/plugins/ || echo none
```

- [ ] **Step 3: Identify each plugin's entry file**

For directory plugins (elevation, inset-surface), inspect to find the file Tailwind loads. Add only that as a public export.

```bash
ls src/styles/plugins/elevation/ src/styles/plugins/inset-surface/
```

- [ ] **Step 4: Add to allowlist**

```ts
{ subpath: './styles/plugins/elevation',     source: 'styles/plugins/elevation/<entryFile>.ts' },
{ subpath: './styles/plugins/inset-surface', source: 'styles/plugins/inset-surface/<entryFile>.ts' },
{ subpath: './styles/plugins/motion-spring', source: 'styles/plugins/motion-spring.ts' },
```

Replace `<entryFile>` with the actual filename from Step 3 (typically `index.ts` is forbidden by user rule, so the entry file should be the canonical plugin file by another name; if A1 surfaces a barrel, refactor to a named non-index file as part of this task).

- [ ] **Step 5: typecheck + build**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui && \
  git commit -m "feat(fresco-ui): migrate tailwind plugins"
```

---

### Task C5: Create the package's `styles.css` entry

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/src/styles.css`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Read Fresco's authoritative tokens**

```bash
cat ~/Projects/fresco-next/styles/globals.css
cat ~/Projects/fresco-next/styles/themes/default.css
cat ~/Projects/network-canvas/tooling/tailwind/fresco.ts
cat ~/Projects/network-canvas/tooling/tailwind/globals.css
```

Cross-reference Fresco's globals + theme with the existing `@codaco/tailwind-config/fresco.ts` JS preset. Anything used by components (any of the migrated code) belongs in `styles.css`.

- [ ] **Step 2: Write `src/styles.css`**

```css
@import "tailwindcss";

@theme {
  /* Lifted from Fresco's authoritative tokens. The full set is mechanical;
     keep variable names byte-identical to what migrated components reference. */

  /* === NC palette === */
  /* … one --color-* per palette token from Fresco … */

  /* === Semantic tokens (shadcn-style) === */
  /* … --color-background, --color-foreground, --color-primary, etc. … */

  /* === Typography === */
  /* … --font-sans, --font-mono, --text-base, etc., as currently set … */

  /* === Radii, shadows, motion === */
  /* … --radius-*, --shadow-*, --duration-*, etc. … */
}

@layer base {
  :root {
    /* HSL channel definitions for the NC palette */
    /* … from Fresco's globals.css / themes/default.css … */
  }
}

@plugin "./styles/plugins/elevation/<entryFile>";
@plugin "./styles/plugins/inset-surface/<entryFile>";
@plugin "./styles/plugins/motion-spring";

/* Path is relative to the BUILT styles.css at dist/styles.css */
@source "./**/*.js";
```

Replace `<entryFile>` with the values used in Task C4 Step 4. The `@source` glob is relative to `dist/styles.css` (the published location); `./**/*.js` matches everything under `dist/`. Keep that line in sync with the directory layout.

- [ ] **Step 3: Add to allowlist**

```ts
// cssEntries
{ subpath: './styles.css', source: 'styles.css' },
```

- [ ] **Step 4: build**

```bash
cd ~/Projects/network-canvas && \
  pnpm --filter @codaco/fresco-ui build && \
  diff packages/fresco-ui/src/styles.css packages/fresco-ui/dist/styles.css
```
Expected: PASS, diff empty.

- [ ] **Step 5: Sanity-check `@plugin` resolution**

The plugin paths in `dist/styles.css` should resolve to actual files under `dist/styles/plugins/`. Confirm:

```bash
ls ~/Projects/network-canvas/packages/fresco-ui/dist/styles/plugins/
```

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui && \
  git commit -m "feat(fresco-ui): add Tailwind v4 styles.css entry"
```

---

### Task C6: Migrate primitive components — Group 1 (no internal cross-deps)

**Repo:** Monorepo
**Files (copy each from Fresco's `components/ui/`):**
- `Alert.tsx`, `badge.tsx`, `button-constants.ts`, `Pips.tsx`, `ProgressBar.tsx`, `RenderMarkdown.tsx`, `ResizableFlexPanel.tsx`, `ScrollArea.tsx`, `skeleton.tsx`, `Spinner.tsx`, `TimeAgo.tsx`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy files**

```bash
cd ~/Projects/network-canvas/packages/fresco-ui/src
for f in Alert badge button-constants Pips ProgressBar RenderMarkdown ResizableFlexPanel ScrollArea skeleton Spinner TimeAgo; do
  cp ~/Projects/fresco-next/components/ui/$f.tsx ./ 2>/dev/null \
    || cp ~/Projects/fresco-next/components/ui/$f.ts ./
done
```

- [ ] **Step 2: Rewrite `~/` imports in each copied file**

For each file, every `~/` import must be rewritten:

| Source path | Target path (relative from src/) |
|---|---|
| `~/utils/cva` | `./utils/cva` |
| `~/styles/shared/controlVariants` | `./styles/controlVariants` |
| `~/utils/generatePublicId` | `./utils/generatePublicId` |
| `~/utils/prettify` | `./utils/prettify` |
| `~/hooks/useSafeAnimate` | `./hooks/useSafeAnimate` |
| `~/lib/interviewer/utils/scrollParent` | `./utils/scrollParent` |
| Any other `~/` not in this table | **stop and report**: it isn't accounted for in the migration |

```bash
grep -rln "from '~/" src/*.ts src/*.tsx 2>/dev/null
```
Loop until no `~/` imports remain in this group.

- [ ] **Step 3: Add to allowlist**

```ts
{ subpath: './Alert',              source: 'Alert.tsx' },
{ subpath: './badge',              source: 'badge.tsx' },
{ subpath: './button-constants',   source: 'button-constants.ts' },
{ subpath: './Pips',               source: 'Pips.tsx' },
{ subpath: './ProgressBar',        source: 'ProgressBar.tsx' },
{ subpath: './RenderMarkdown',     source: 'RenderMarkdown.tsx' },
{ subpath: './ResizableFlexPanel', source: 'ResizableFlexPanel.tsx' },
{ subpath: './ScrollArea',         source: 'ScrollArea.tsx' },
{ subpath: './skeleton',           source: 'skeleton.tsx' },
{ subpath: './Spinner',            source: 'Spinner.tsx' },
{ subpath: './TimeAgo',            source: 'TimeAgo.tsx' },
```

- [ ] **Step 4: typecheck + build**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui && \
  git commit -m "feat(fresco-ui): migrate primitive components (group 1)"
```

---

### Task C7: Migrate primitive components — Group 2 (Button + dependents)

**Repo:** Monorepo
**Files (copy from Fresco):**
- `Button.tsx` (defines `Button`, `IconButton`, `MotionButton`)
- `CloseButton.tsx`
- Modify: `packages/fresco-ui/exports.config.ts`

`Button.tsx` imports `./skeleton` (already migrated in C6) and `~/styles/shared/controlVariants` and `~/utils/cva` and `motion/react`. Rewrite to relative paths.

- [ ] **Step 1: Copy**

```bash
cp ~/Projects/fresco-next/components/ui/Button.tsx ~/Projects/network-canvas/packages/fresco-ui/src/Button.tsx
cp ~/Projects/fresco-next/components/ui/CloseButton.tsx ~/Projects/network-canvas/packages/fresco-ui/src/CloseButton.tsx
```

- [ ] **Step 2: Rewrite imports per the table in C6 Step 2; also handle `./skeleton` (already correct relative)**

- [ ] **Step 3: Add to allowlist**

```ts
{ subpath: './Button',      source: 'Button.tsx' },
{ subpath: './CloseButton', source: 'CloseButton.tsx' },
```

- [ ] **Step 4: typecheck + build → PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate Button and CloseButton"
```

---

### Task C8: Migrate primitive components — Group 3 (Radix-based)

**Repo:** Monorepo
**Files (copy from Fresco):**
- `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `table.tsx`, `Label.tsx`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy**

```bash
for f in dropdown-menu popover tooltip table Label; do
  cp ~/Projects/fresco-next/components/ui/$f.tsx ~/Projects/network-canvas/packages/fresco-ui/src/$f.tsx
done
```

- [ ] **Step 2: Rewrite `~/` imports per the table in C6 Step 2**

- [ ] **Step 3: Add to allowlist**

```ts
{ subpath: './dropdown-menu', source: 'dropdown-menu.tsx' },
{ subpath: './popover',       source: 'popover.tsx' },
{ subpath: './tooltip',       source: 'tooltip.tsx' },
{ subpath: './table',         source: 'table.tsx' },
{ subpath: './Label',         source: 'Label.tsx' },
```

- [ ] **Step 4: typecheck + build → PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate Radix-based primitives"
```

---

### Task C9: Migrate Icon and Node and Toast

**Repo:** Monorepo
**Files (copy from Fresco):**
- `Icon.tsx`, `Node.tsx`, `Toast.tsx`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy + rewrite imports**

```bash
for f in Icon Node Toast; do
  cp ~/Projects/fresco-next/components/ui/$f.tsx ~/Projects/network-canvas/packages/fresco-ui/src/$f.tsx
done
```
Rewrite imports per C6 Step 2.

- [ ] **Step 2: Add to allowlist**

```ts
{ subpath: './Icon',  source: 'Icon.tsx' },
{ subpath: './Node',  source: 'Node.tsx' },
{ subpath: './Toast', source: 'Toast.tsx' },
```

- [ ] **Step 3: typecheck + build → PASS**

- [ ] **Step 4: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate Icon, Node, Toast"
```

---

### Task C10: Migrate Modal subdirectory

**Repo:** Monorepo
**Files:**
- Copy directory: `~/Projects/fresco-next/components/ui/Modal/` → `packages/fresco-ui/src/Modal/`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy**

```bash
cp -R ~/Projects/fresco-next/components/ui/Modal \
      ~/Projects/network-canvas/packages/fresco-ui/src/Modal
```

- [ ] **Step 2: Rewrite imports per C6 Step 2 across all files in Modal/**

```bash
grep -rln "from '~/" ~/Projects/network-canvas/packages/fresco-ui/src/Modal
```

- [ ] **Step 3: Add to allowlist**

```ts
{ subpath: './Modal', source: 'Modal/Modal.tsx' },
```

`ModalBackdrop.tsx` and `ModalPopup.tsx` are kept private (not in `exports`) unless A1 surfaces external imports.

- [ ] **Step 4: typecheck + build → PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate Modal"
```

---

### Task C11: Migrate RichTextRenderer

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/src/RichTextRenderer.tsx`
- Modify: `packages/fresco-ui/exports.config.ts`

`RichTextRenderer` brings the heaviest dependency tree (Tiptap). Treat as its own task because the `external` array in `vite.config.ts` may need to expand.

- [ ] **Step 1: Copy**

```bash
cp ~/Projects/fresco-next/components/ui/RichTextRenderer.tsx \
   ~/Projects/network-canvas/packages/fresco-ui/src/RichTextRenderer.tsx
```

- [ ] **Step 2: Audit imports**

```bash
grep -n "^import" ~/Projects/network-canvas/packages/fresco-ui/src/RichTextRenderer.tsx
```

Confirm every `@tiptap/...` package is in `dependencies` (per A3). If not, add and rerun `pnpm install`. Confirm `/^@tiptap/` is in `vite.config.ts` `external`.

- [ ] **Step 3: Rewrite `~/` imports per C6 Step 2**

- [ ] **Step 4: Add to allowlist**

```ts
{ subpath: './RichTextRenderer', source: 'RichTextRenderer.tsx' },
```

- [ ] **Step 5: typecheck + build → PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate RichTextRenderer"
```

---

### Task C12: Migrate `layout/`

**Repo:** Monorepo
**Files:**
- Copy: `~/Projects/fresco-next/components/ui/layout/Surface.tsx` and `ResponsiveContainer.tsx`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy + rewrite imports**

```bash
mkdir -p ~/Projects/network-canvas/packages/fresco-ui/src/layout
cp ~/Projects/fresco-next/components/ui/layout/{Surface,ResponsiveContainer}.tsx \
   ~/Projects/network-canvas/packages/fresco-ui/src/layout/
```
Rewrite imports per C6 Step 2.

- [ ] **Step 2: Add to allowlist**

```ts
{ subpath: './layout/Surface',              source: 'layout/Surface.tsx' },
{ subpath: './layout/ResponsiveContainer',  source: 'layout/ResponsiveContainer.tsx' },
```

- [ ] **Step 3: typecheck + build → PASS**

- [ ] **Step 4: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate layout components"
```

---

### Task C13: Migrate `typography/`

**Repo:** Monorepo
**Files:**
- Copy each file from `~/Projects/fresco-next/components/ui/typography/`
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy + rewrite imports**

```bash
mkdir -p ~/Projects/network-canvas/packages/fresco-ui/src/typography
cp ~/Projects/fresco-next/components/ui/typography/{Heading,Paragraph,PageHeader,UnorderedList}.tsx \
   ~/Projects/network-canvas/packages/fresco-ui/src/typography/
```

- [ ] **Step 2: Add to allowlist**

```ts
{ subpath: './typography/Heading',        source: 'typography/Heading.tsx' },
{ subpath: './typography/Paragraph',      source: 'typography/Paragraph.tsx' },
{ subpath: './typography/PageHeader',     source: 'typography/PageHeader.tsx' },
{ subpath: './typography/UnorderedList',  source: 'typography/UnorderedList.tsx' },
```

- [ ] **Step 3: typecheck + build → PASS**

- [ ] **Step 4: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate typography components"
```

---

### Task C14: Migrate `dialogs/` subsystem

**Repo:** Monorepo
**Files:**
- Copy directory: `~/Projects/fresco-next/components/ui/dialogs/` → `packages/fresco-ui/src/dialogs/` (preserve `__tests__/`)
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy**

```bash
cp -R ~/Projects/fresco-next/components/ui/dialogs \
      ~/Projects/network-canvas/packages/fresco-ui/src/dialogs
```

- [ ] **Step 2: Rewrite all `~/` imports across the subsystem**

```bash
grep -rln "from '~/" ~/Projects/network-canvas/packages/fresco-ui/src/dialogs
```

Apply the C6 Step 2 table. If A4 flagged a Fresco-specific import not in the table, stop and report.

- [ ] **Step 3: Resolve test-setup expectations**

If A4 noted Fresco-specific test-setup imports, copy or stub them (e.g. create `src/test-setup.ts` with the necessary polyfills) and reference from `vitest.config.ts`.

- [ ] **Step 4: Add public files to allowlist**

Walk A1 Step 4's public-imports list (`/tmp/public-imports.txt` or its preserved equivalent in A1's findings file). Every entry that starts with `dialogs/...` is a public path. Convert each to an `exportEntries` row.

Example (use the actual list from A1):

```ts
{ subpath: './dialogs/Dialog',          source: 'dialogs/Dialog.tsx' },
{ subpath: './dialogs/DialogProvider',  source: 'dialogs/DialogProvider.tsx' },
{ subpath: './dialogs/useWizard',       source: 'dialogs/useWizard.ts' },
// … and so on per A1
```

- [ ] **Step 5: typecheck + build + test → PASS**

```bash
cd ~/Projects/network-canvas && \
  pnpm --filter @codaco/fresco-ui typecheck && \
  pnpm --filter @codaco/fresco-ui build && \
  pnpm --filter @codaco/fresco-ui test
```

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate dialogs subsystem"
```

---

### Task C15: Migrate `dnd/` subsystem

Same shape as C14. Source: `~/Projects/fresco-next/components/ui/dnd/`.

- [ ] **Step 1: Copy → Step 2: Rewrite imports → Step 3: Test setup → Step 4: Allowlist (per A1 entries starting `dnd/...`) → Step 5: typecheck/build/test PASS → Step 6: Commit**

```bash
cp -R ~/Projects/fresco-next/components/ui/dnd \
      ~/Projects/network-canvas/packages/fresco-ui/src/dnd
# … Steps 2-6 mirror C14, with `dnd/` paths
```

Commit message: `feat(fresco-ui): migrate dnd subsystem`.

---

### Task C16: Migrate `collection/` subsystem

Same shape as C14. Source: `~/Projects/fresco-next/components/ui/collection/`. ~60 files.

- [ ] **Step 1-6 mirror C14**

Commit message: `feat(fresco-ui): migrate collection subsystem`.

---

### Task C17: Migrate `form/` subsystem (excluding `useProtocolForm`)

**Repo:** Monorepo
**Files:**
- Copy directory: `~/Projects/fresco-next/components/ui/form/` → `packages/fresco-ui/src/form/`
- Delete: `packages/fresco-ui/src/form/hooks/useProtocolForm.tsx` and `packages/fresco-ui/src/form/hooks/useProtocolForm.stories.tsx` (these stay in Fresco — see G3)
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Copy whole subsystem**

```bash
cp -R ~/Projects/fresco-next/components/ui/form \
      ~/Projects/network-canvas/packages/fresco-ui/src/form
```

- [ ] **Step 2: Remove `useProtocolForm.tsx` + its story from the copy**

```bash
rm ~/Projects/network-canvas/packages/fresco-ui/src/form/hooks/useProtocolForm.tsx \
   ~/Projects/network-canvas/packages/fresco-ui/src/form/hooks/useProtocolForm.stories.tsx
```

- [ ] **Step 3: Rewrite `~/` imports across the subsystem**

```bash
grep -rln "from '~/" ~/Projects/network-canvas/packages/fresco-ui/src/form
```

After removing `useProtocolForm`, only the C6 Step 2 table imports should remain. The previously-flagged `from '~/lib/interviewer/selectors/forms'` is now gone (it was only in `useProtocolForm.tsx`). If any other Fresco-only import surfaces, stop and report.

- [ ] **Step 4: Add public files to allowlist (per A1 entries starting `form/...`)**

- [ ] **Step 5: typecheck + build + test → PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): migrate form subsystem"
```

---

## Phase D — Stories, exports, packaging polish

### Task D1: Reconcile the public allowlist with A1's import inventory

**Repo:** Monorepo
**Files:**
- Modify: `packages/fresco-ui/exports.config.ts`

- [ ] **Step 1: Compare allowlist vs. observed Fresco imports**

```bash
node -e "
  const { exportEntries } = await import('./packages/fresco-ui/exports.config.ts');
  console.log(exportEntries.map(e => e.subpath.replace(/^\.\//,'')).sort().join('\n'));
" > /tmp/declared.txt

# A1's observed list:
sort -u < ~/Projects/network-canvas/docs/superpowers/plans/findings/2026-04-29-fresco-ui/A1-public-imports.txt > /tmp/observed.txt

diff /tmp/observed.txt /tmp/declared.txt || true
```

(Adjust the path to A1's observed-imports list to whatever A1 wrote.)

- [ ] **Step 2: For every entry in `observed - declared`, add an allowlist row**

These are Fresco import paths the package needs to support. If the file truly doesn't exist (e.g. it was the `useProtocolForm` file we're keeping in Fresco), strike it from the observed list — that import will be rewritten to a Fresco-internal path in Phase G.

- [ ] **Step 3: For every entry in `declared - observed`, audit**

If a declared entry isn't currently imported anywhere, decide: keep (anticipated future use) or remove (YAGNI). Default: remove.

- [ ] **Step 4: Remove `_sentinel` from the allowlist and delete the sentinel files**

```bash
rm ~/Projects/network-canvas/packages/fresco-ui/src/_sentinel.{ts,test.ts}
```

Edit `exports.config.ts` to remove the `_sentinel` row.

- [ ] **Step 5: typecheck + build + test → PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui && \
  git commit -m "chore(fresco-ui): finalize public API allowlist"
```

---

### Task D2: Migrate Storybook config

**Repo:** Monorepo
**Files:**
- Create: `packages/fresco-ui/.storybook/main.ts`
- Create: `packages/fresco-ui/.storybook/preview.tsx`
- Create: `packages/fresco-ui/.storybook/StoryInterviewShell.tsx`
- Create: `packages/fresco-ui/.storybook/theme-switcher.tsx`
- Create: `packages/fresco-ui/.storybook/themes/default.css` (fixture)
- Create: `packages/fresco-ui/.storybook/themes/interview.css` (fixture)
- Modify: `packages/fresco-ui/package.json` (add storybook devDeps)

- [ ] **Step 1: Add Storybook devDependencies**

```jsonc
"devDependencies": {
  "storybook": "^9.0.0",
  "@storybook/react-vite": "^9.0.0",
  "@storybook/test": "^9.0.0",
  "@storybook/addon-essentials": "^9.0.0"
}
```

(Use whichever 9.x is current; consult Fresco's own `package.json` for the exact version it currently runs.)

```bash
cd ~/Projects/network-canvas && pnpm install
```

- [ ] **Step 2: Copy Storybook config from Fresco**

```bash
cp ~/Projects/fresco-next/.storybook/{main.ts,preview.tsx,StoryInterviewShell.tsx,theme-switcher.tsx} \
   ~/Projects/network-canvas/packages/fresco-ui/.storybook/
```

- [ ] **Step 3: Adjust `main.ts`**

Set `stories: ['../src/**/*.stories.tsx']`. Confirm `framework: { name: '@storybook/react-vite' }`.

- [ ] **Step 4: Adjust `preview.tsx`**

Replace any Fresco-relative CSS imports with the package's own:

```ts
import '../src/styles.css';
import './themes/default.css';
// Theme-switcher swaps in interview.css when toggled
```

- [ ] **Step 5: Copy theme fixtures**

```bash
cp ~/Projects/fresco-next/styles/themes/default.css \
   ~/Projects/network-canvas/packages/fresco-ui/.storybook/themes/default.css
cp ~/Projects/fresco-next/styles/themes/interview.css \
   ~/Projects/network-canvas/packages/fresco-ui/.storybook/themes/interview.css
```

- [ ] **Step 6: Decide on `vite-plugin-stub-use-server`**

```bash
grep -rln "'use server'" ~/Projects/network-canvas/packages/fresco-ui/src 2>/dev/null
```

If nothing matches, omit the plugin from the package's Storybook (don't copy `vite-plugin-stub-use-server.ts`). Otherwise copy it and reference from `main.ts`.

- [ ] **Step 7: Run Storybook headlessly**

```bash
cd ~/Projects/network-canvas && pnpm --filter @codaco/fresco-ui build-storybook
```
Expected: PASS, `storybook-static/` created.

- [ ] **Step 8: Commit**

```bash
git add packages/fresco-ui pnpm-lock.yaml && \
  git commit -m "feat(fresco-ui): add storybook"
```

---

### Task D3: Copy stories alongside their components

**Repo:** Monorepo
**Files:**
- Copy every `.stories.tsx` file from `~/Projects/fresco-next/components/ui/**/*.stories.tsx` to the equivalent location in `packages/fresco-ui/src/`

- [ ] **Step 1: Enumerate stories**

```bash
find ~/Projects/fresco-next/components/ui -name '*.stories.tsx' \
  | sed "s|.*/components/ui/||" > /tmp/stories.txt
```

- [ ] **Step 2: Copy each one**

```bash
while IFS= read -r rel; do
  src=~/Projects/fresco-next/components/ui/$rel
  dst=~/Projects/network-canvas/packages/fresco-ui/src/$rel
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
done < /tmp/stories.txt
```

- [ ] **Step 3: Skip the `useProtocolForm` story**

```bash
rm -f ~/Projects/network-canvas/packages/fresco-ui/src/form/hooks/useProtocolForm.stories.tsx
```
(May already not exist if the file wasn't part of the form/ tree we copied; the line is idempotent.)

- [ ] **Step 4: Rewrite imports inside each story per the C6 Step 2 table**

Stories often import from `~/.storybook/preview` — rewrite to `'../../.storybook/preview'` or remove the dependency if Storybook v9 makes it unnecessary.

```bash
grep -rln "from '~/" ~/Projects/network-canvas/packages/fresco-ui/src --include='*.stories.tsx'
```

- [ ] **Step 5: Run Storybook build**

```bash
cd ~/Projects/network-canvas && pnpm --filter @codaco/fresco-ui build-storybook
```
Expected: PASS. Story-load errors usually surface as warnings; treat any error as a failure.

- [ ] **Step 6: Commit**

```bash
git add packages/fresco-ui && git commit -m "feat(fresco-ui): copy storybook stories"
```

---

### Task D4: Add a changeset

**Repo:** Monorepo
**Files:**
- Create: `.changeset/<random-name>.md` (the existing changeset CLI generates this)

- [ ] **Step 1: Generate a changeset**

```bash
cd ~/Projects/network-canvas && pnpm changeset
```

Select `@codaco/fresco-ui`. Mark as **minor** (since it's the initial release at `0.1.0`).

Summary:
> Initial release of `@codaco/fresco-ui` — Fresco UI components, styles, and utilities migrated from `~/Projects/fresco-next/components/ui`.

- [ ] **Step 2: Inspect the generated file**

```bash
ls .changeset/ | grep -v README
```

- [ ] **Step 3: Commit**

```bash
git add .changeset && git commit -m "chore(changesets): release fresco-ui 0.1.0"
```

---

## Phase E — Pre-publish validation

### Task E1: Full pipeline green

**Repo:** Monorepo

- [ ] **Step 1: Lint**

```bash
cd ~/Projects/network-canvas && pnpm lint
```

- [ ] **Step 2: Typecheck the package + the whole monorepo**

```bash
pnpm --filter @codaco/fresco-ui typecheck && pnpm typecheck
```

- [ ] **Step 3: Tests**

```bash
pnpm --filter @codaco/fresco-ui test
```

- [ ] **Step 4: Build**

```bash
pnpm --filter @codaco/fresco-ui build
```

- [ ] **Step 5: Storybook build**

```bash
pnpm --filter @codaco/fresco-ui build-storybook
```

- [ ] **Step 6: Inspect `dist/` shape**

```bash
find packages/fresco-ui/dist -type f | sort | head -50
jq '.exports | keys | length' packages/fresco-ui/package.json
```

Sanity-check: number of `.js` entries roughly matches the allowlist size; `chunks/` directory exists (or doesn't, depending on Rolldown's decisions).

- [ ] **Step 7: Smoke-test the published shape locally**

```bash
cd packages/fresco-ui && pnpm pack --pack-destination /tmp
tar -tzf /tmp/codaco-fresco-ui-*.tgz | head -20
```

Expected: tarball includes `dist/`, `package.json`, `README.md`. Source files (`src/`, `.storybook/`) are NOT in the tarball.

- [ ] **Step 8: No commit needed (validation only)**

---

### Task E2: Pre-publish in the monorepo via changesets pre-release mode

**Repo:** Monorepo

- [ ] **Step 1: Enter pre-release mode on the `next` tag**

```bash
cd ~/Projects/network-canvas && pnpm exec changeset pre enter next
```

- [ ] **Step 2: Version**

```bash
pnpm exec changeset version
```

`@codaco/fresco-ui` is bumped to `0.1.0-next.0`. Lockfile updates.

- [ ] **Step 3: Install + commit**

```bash
pnpm install --no-frozen-lockfile
git add . && git commit -m "chore(versions): @codaco/fresco-ui 0.1.0-next.0"
```

- [ ] **Step 4: Publish**

This step is gated on user authorisation — npm publish is irreversible. STOP and ask the user to run:

```bash
cd ~/Projects/network-canvas && pnpm exec changeset publish
```

(or to confirm before you do.)

- [ ] **Step 5: Verify the published package**

```bash
npm view @codaco/fresco-ui dist-tags
npm view @codaco/fresco-ui@next exports
```

Expected: `next: 0.1.0-next.0`, `exports` map present.

---

## Phase F — Tailwind-config cleanup

### Task F1: Deprecate `@codaco/tailwind-config/fresco`

**Repo:** Monorepo
**Files:**
- Delete: `tooling/tailwind/fresco.ts`
- Modify: `tooling/tailwind/package.json` (remove the `./fresco` export)

- [ ] **Step 1: Confirm Fresco is the only consumer of the `fresco` preset**

```bash
grep -rln "@codaco/tailwind-config/fresco" ~/Projects/network-canvas
grep -rln "@codaco/tailwind-config/fresco" ~/Projects/fresco-next
```

If Fresco is the only consumer **and** Phase G hasn't started yet, defer this task to after Fresco's CSS migration in G2 — otherwise Fresco breaks. **Schedule note:** F1 runs *after* G2.

- [ ] **Step 2: After G2 lands, remove the file and the export**

```bash
rm ~/Projects/network-canvas/tooling/tailwind/fresco.ts
```

Edit `tooling/tailwind/package.json` and remove the `./fresco` entry from `exports`.

- [ ] **Step 3: Lint + typecheck**

```bash
cd ~/Projects/network-canvas && pnpm lint && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add tooling/tailwind && git commit -m "chore(tailwind-config): drop fresco preset (moved to @codaco/fresco-ui)"
```

---

## Phase G — Migrate Fresco to consume `@codaco/fresco-ui`

### Task G1: Add the dependency in Fresco

**Repo:** Fresco
**Files:**
- Modify: `~/Projects/fresco-next/package.json`

- [ ] **Step 1: Add the dependency**

```bash
cd ~/Projects/fresco-next && \
  pnpm add @codaco/fresco-ui@next
```

- [ ] **Step 2: Verify**

```bash
grep "@codaco/fresco-ui" package.json
```

Expected: `"@codaco/fresco-ui": "^0.1.0-next.0"` (or whatever was published in E2).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml && \
  git commit -m "feat(deps): add @codaco/fresco-ui"
```

---

### Task G2: Wire Fresco's CSS to the package

**Repo:** Fresco
**Files:**
- Modify: Fresco's Tailwind v4 entry CSS (likely `styles/globals.css` or `app/globals.css`; verify)
- Delete (only at end of G7): `tailwind.config.ts` if present

- [ ] **Step 1: Locate the Tailwind entry CSS**

```bash
find ~/Projects/fresco-next -maxdepth 3 -name 'globals.css'
grep -l "@import \"tailwindcss\"" ~/Projects/fresco-next/styles/*.css ~/Projects/fresco-next/app/**/*.css 2>/dev/null
```

- [ ] **Step 2: Add the import + adjust source globs**

In Fresco's entry CSS, near the top (after any `@import "tailwindcss"`):

```css
@import "@codaco/fresco-ui/styles.css";

@source "../app/**/*.{ts,tsx}";
@source "../components/**/*.{ts,tsx}";
@source "../lib/**/*.{ts,tsx}";
@source "../hooks/**/*.{ts,tsx}";
@source "../utils/**/*.{ts,tsx}";
```

(Adjust paths to be relative to the entry CSS's actual location.)

- [ ] **Step 3: Remove anything now duplicated**

If the entry CSS or other Fresco CSS files declare the same `@theme` tokens that `@codaco/fresco-ui/styles.css` provides, remove the duplicate declarations. `themes/default.css` and `themes/interview.css` keep their `:root` HSL channel definitions.

- [ ] **Step 4: Run dev**

This step requires the user to run the Fresco dev server. Ask the user to:

```bash
cd ~/Projects/fresco-next && pnpm dev
```

…and confirm the dashboard renders. Components from `@codaco/fresco-ui` (e.g. dashboard buttons, dialogs) won't be in use yet (codemod hasn't run), but the CSS pipeline must still resolve cleanly.

- [ ] **Step 5: Commit**

```bash
git add styles app && git commit -m "feat(fresco): import @codaco/fresco-ui styles"
```

---

### Task G3: Relocate Fresco-internal files (SubmitButton, Link, useProtocolForm)

**Repo:** Fresco
**Files:**
- Move: `components/ui/SubmitButton.tsx` → `components/SubmitButton.tsx`
- Move: `components/ui/Link.tsx` → `components/Link.tsx`
- Move: `components/ui/form/hooks/useProtocolForm.tsx` → `lib/interviewer/forms/useProtocolForm.tsx`
- Move: `components/ui/form/hooks/useProtocolForm.stories.tsx` → `lib/interviewer/forms/useProtocolForm.stories.tsx`

- [ ] **Step 1: Move via `git mv` to preserve history**

```bash
cd ~/Projects/fresco-next
git mv components/ui/SubmitButton.tsx components/SubmitButton.tsx
git mv components/ui/Link.tsx        components/Link.tsx
mkdir -p lib/interviewer/forms
git mv components/ui/form/hooks/useProtocolForm.tsx \
       lib/interviewer/forms/useProtocolForm.tsx
git mv components/ui/form/hooks/useProtocolForm.stories.tsx \
       lib/interviewer/forms/useProtocolForm.stories.tsx
```

- [ ] **Step 2: Update all importers**

```bash
grep -rln "from '~/components/ui/SubmitButton'" ~/Projects/fresco-next --include='*.ts' --include='*.tsx' \
  | xargs sed -i '' "s|from '~/components/ui/SubmitButton'|from '~/components/SubmitButton'|g"

grep -rln "from '~/components/ui/Link'" ~/Projects/fresco-next --include='*.ts' --include='*.tsx' \
  | xargs sed -i '' "s|from '~/components/ui/Link'|from '~/components/Link'|g"

grep -rln "from '~/components/ui/form/hooks/useProtocolForm'" ~/Projects/fresco-next --include='*.ts' --include='*.tsx' \
  | xargs sed -i '' "s|from '~/components/ui/form/hooks/useProtocolForm'|from '~/lib/interviewer/forms/useProtocolForm'|g"
```

- [ ] **Step 3: Update imports inside the relocated files**

`useProtocolForm.tsx`'s imports of `~/components/ui/form/...` will be rewritten to `@codaco/fresco-ui/form/...` in G4 (handled by the codemod). The Redux selector import stays as-is.

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "refactor(fresco): relocate SubmitButton, Link, useProtocolForm"
```

---

### Task G4: Codemod — rewrite imports to `@codaco/fresco-ui`

**Repo:** Fresco
**Files:**
- Create: `~/Projects/fresco-next/scripts/codemod-fresco-ui-imports.mjs`
- Modify: every Fresco file that imports `~/components/ui/...`, `~/utils/cva`, etc.

- [ ] **Step 1: Write the codemod**

```js
// scripts/codemod-fresco-ui-imports.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { globSync } from 'tinyglobby';

const rules = [
  // [from regex, to template]
  [/from '~\/components\/ui\/(.+?)'/g, "from '@codaco/fresco-ui/$1'"],
  [/from '~\/utils\/cva'/g,                       "from '@codaco/fresco-ui/utils/cva'"],
  [/from '~\/utils\/generatePublicId'/g,          "from '@codaco/fresco-ui/utils/generatePublicId'"],
  [/from '~\/utils\/prettify'/g,                  "from '@codaco/fresco-ui/utils/prettify'"],
  [/from '~\/hooks\/useSafeAnimate'/g,            "from '@codaco/fresco-ui/hooks/useSafeAnimate'"],
  [/from '~\/lib\/interviewer\/utils\/scrollParent'/g, "from '@codaco/fresco-ui/utils/scrollParent'"],
  [/from '~\/styles\/shared\/controlVariants'/g,  "from '@codaco/fresco-ui/styles/controlVariants'"],
];

const files = globSync(['**/*.{ts,tsx}'], { cwd: process.cwd(), ignore: ['node_modules', '.next', 'dist'] });

let touched = 0;
for (const f of files) {
  const before = await readFile(f, 'utf8');
  let after = before;
  for (const [re, to] of rules) after = after.replace(re, to);
  if (after !== before) { await writeFile(f, after); touched++; }
}
console.log(`rewrote imports in ${touched} files`);
```

- [ ] **Step 2: Run dry-run**

```bash
cd ~/Projects/fresco-next && \
  node -e "
    import { readFile } from 'node:fs/promises';
    import { globSync } from 'tinyglobby';
    const rules = [/* same as above */];
    const files = globSync(['**/*.{ts,tsx}'], { cwd: process.cwd(), ignore: ['node_modules','.next','dist'] });
    let count = 0;
    for (const f of files) { const t = await readFile(f, 'utf8'); for (const [re] of rules) if (re.test(t)) { count++; break; } }
    console.log('would touch', count, 'files');
  "
```

- [ ] **Step 3: Run for real**

```bash
node scripts/codemod-fresco-ui-imports.mjs
```

- [ ] **Step 4: Carve out the relocated `useProtocolForm`**

The codemod might have rewritten an import inside `lib/interviewer/forms/useProtocolForm.tsx` itself. That's fine — the file imports from `@codaco/fresco-ui/form/...` for primitives, and from `~/lib/interviewer/selectors/forms` for the selector (which the codemod doesn't touch).

- [ ] **Step 5: typecheck**

```bash
pnpm typecheck
```
Expected: PASS. If it fails, the typical cause is a missing allowlist entry in the package — circle back to D1 and add it, republish a new alpha (E2 with a fresh changeset), bump Fresco's dependency, retry.

- [ ] **Step 6: Lint**

```bash
pnpm lint
```
Expected: PASS. If lint surfaces unused-import warnings on Fresco files that re-imported things, fix as part of this commit.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "refactor(fresco): rewrite imports to @codaco/fresco-ui"
```

---

### Task G5: Delete the migrated source from Fresco

**Repo:** Fresco
**Files (to delete):**
- `components/ui/` (entire directory; the relocated files moved out in G3)
- `utils/cva.ts`
- `utils/generatePublicId.ts`
- `utils/prettify.ts`
- `hooks/useSafeAnimate.ts`
- `lib/interviewer/utils/scrollParent.ts`
- `styles/shared/controlVariants.ts`
- `styles/shared/colors.css`
- `styles/plugins/tailwind-elevation/`
- `styles/plugins/tailwind-inset-surface/`
- `styles/plugins/tailwind-motion-spring.ts`

- [ ] **Step 1: Confirm no remaining imports**

```bash
cd ~/Projects/fresco-next && \
  grep -rln "from '~/components/ui" --include='*.ts' --include='*.tsx' && echo FAIL || echo OK
grep -rln "from '~/utils/cva'" --include='*.ts' --include='*.tsx' && echo FAIL || echo OK
grep -rln "from '~/utils/generatePublicId'" --include='*.ts' --include='*.tsx' && echo FAIL || echo OK
grep -rln "from '~/utils/prettify'" --include='*.ts' --include='*.tsx' && echo FAIL || echo OK
grep -rln "from '~/hooks/useSafeAnimate'" --include='*.ts' --include='*.tsx' && echo FAIL || echo OK
grep -rln "from '~/lib/interviewer/utils/scrollParent'" --include='*.ts' --include='*.tsx' && echo FAIL || echo OK
grep -rln "from '~/styles/shared/controlVariants'" --include='*.ts' --include='*.tsx' && echo FAIL || echo OK
```

If any FAIL: stop, fix imports, re-run.

- [ ] **Step 2: Delete via `git rm`**

```bash
git rm -r components/ui
git rm utils/cva.ts utils/generatePublicId.ts utils/prettify.ts
git rm hooks/useSafeAnimate.ts
git rm lib/interviewer/utils/scrollParent.ts
git rm styles/shared/controlVariants.ts styles/shared/colors.css
git rm -r styles/plugins/tailwind-elevation styles/plugins/tailwind-inset-surface
git rm styles/plugins/tailwind-motion-spring.ts
```

- [ ] **Step 3: Move tests Fresco still wants to keep**

If `utils/__tests__/` tested utilities Fresco kept (e.g. `getBaseUrl`, `password`, etc., which aren't migrating), they stay. Only tests for migrated utilities were removed by Step 2 (they live in the package now).

```bash
ls ~/Projects/fresco-next/utils/__tests__/
```

- [ ] **Step 4: typecheck + lint + test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: all PASS.

- [ ] **Step 5: Knip**

```bash
pnpm knip
```
Expected: no new unused exports/files.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "chore(fresco): delete code migrated to @codaco/fresco-ui"
```

---

### Task G6: Visual smoke test

**Repo:** Fresco

Per CLAUDE.md, UI changes should be tested in a browser before claim of completion.

- [ ] **Step 1: Ask the user to start dev**

```bash
cd ~/Projects/fresco-next && pnpm dev
```

- [ ] **Step 2: Smoke-check key surfaces**

User-driven checklist (the user navigates):

- Dashboard renders, sidebar/nav icons visible
- A protocol's interviews table loads
- An interview's first stage renders (any stage type)
- A modal opens (e.g. settings or delete dialog)
- Toasts fire (e.g. trigger an action that shows a toast)
- Form fields render and validate
- Theme switches between default / interview as before

- [ ] **Step 3: Capture findings**

If anything is visually broken, file an issue per item in the user's tracker (or note inline with the work). Each fix follows the same flow: amend the package, publish a new alpha, bump in Fresco, verify.

- [ ] **Step 4: No commit (validation only)**

---

### Task G7: E2E suite

**Repo:** Fresco

- [ ] **Step 1: Run the E2E suite (Docker, single browser to start)**

Per the user's memory: never run multiple browser test suites in parallel locally — they compete for ports 4100+. Start with Chromium only.

```bash
cd ~/Projects/fresco-next && \
  E2E_BROWSERS=chromium ./scripts/run-e2e-docker.sh
```

- [ ] **Step 2: Read the results**

```bash
cat tests/e2e/test-results/results.json | jq '.suites[].suites[].specs[] | select(.tests[].status != "passed")'
```

- [ ] **Step 3: For each failing test, diagnose**

Most likely categories:
- Selector breakage (testids preserved? component DOM unchanged?)
- Style regression (a class no longer resolves because a token isn't in `styles.css`)
- Toast/dialog portal mounting (component DOM-context assumption from spec §8 risk 5)

Fix in the package, publish a new alpha, bump Fresco, retry.

- [ ] **Step 4: Iterate over remaining browsers (Firefox, WebKit) one at a time**

```bash
E2E_BROWSERS=firefox ./scripts/run-e2e-docker.sh
E2E_BROWSERS=webkit ./scripts/run-e2e-docker.sh
```

- [ ] **Step 5: No commit (validation only)**

---

## Phase H — Stable release

### Task H1: Exit pre-release mode and cut `0.1.0`

**Repo:** Monorepo

- [ ] **Step 1: Exit pre-release mode**

```bash
cd ~/Projects/network-canvas && pnpm exec changeset pre exit
```

- [ ] **Step 2: Add a release changeset**

```bash
pnpm exec changeset
```

Pick `@codaco/fresco-ui`, **minor** bump, summary: `Initial stable release.`

- [ ] **Step 3: Version**

```bash
pnpm exec changeset version
pnpm install --no-frozen-lockfile
git add . && git commit -m "chore(versions): @codaco/fresco-ui 0.1.0"
```

- [ ] **Step 4: Publish (gated on user authorisation)**

Ask the user to run, or confirm before running:

```bash
pnpm exec changeset publish
```

- [ ] **Step 5: Bump Fresco to the stable version**

```bash
cd ~/Projects/fresco-next && pnpm add @codaco/fresco-ui@latest
git add package.json pnpm-lock.yaml && \
  git commit -m "chore(deps): @codaco/fresco-ui ^0.1.0"
```

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: PASS.

- [ ] **Step 7: Final commit**

(no extra commit needed beyond Step 5)

---

## Self-review checklist

(Author runs once before handoff.)

- **Spec coverage:** Every section of `docs/superpowers/specs/2026-04-29-fresco-ui-package-design.md` mapped to one or more tasks above? Yes — §3 scope → C-tasks, §4 architecture → B+C+D, §5 coupling → C17/G3, §6 Fresco migration → G-tasks, §7 versioning → E2/H1, §8 risks → A-tasks (pre-flight), §9 out-of-scope items unaffected.
- **Placeholder scan:** No "TBD/TODO/implement later/etc." in execution steps. The two intentional `<entryFile>` placeholders in C4/C5 are gated on A1's findings; both tasks cite the source.
- **Type consistency:** Subpath naming consistent (lowercase `./Button`, `./Modal`, etc., matching the source file casing); no allowlist entry references a file the same plan hasn't migrated.
- **Decision criteria for impl-time choices:** `preserveModules` fallback in B7 (gated on A6); chunking quality fallback noted in spec §8.1 and revisited at E1 Step 6; `vite-plugin-stub-use-server` inclusion gated on a grep in D2 Step 6.
