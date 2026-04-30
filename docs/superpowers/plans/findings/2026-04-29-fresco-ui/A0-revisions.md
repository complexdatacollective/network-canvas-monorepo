# Plan revisions following Phase A investigations (2026-04-30)

This document records changes to the original spec and plan based on Phase A findings (A1-A6) and user direction. Every later task should treat this document as authoritative when it conflicts with the original spec/plan.

## R1 — Migration scope additions

The original spec missed several files that components in `components/ui/` actually import from outside that tree. Per user direction, **migrate everything** — pull these into `@codaco/fresco-ui` rather than leaving them as Fresco couplings.

Add to the migration scope (in addition to what the spec already lists):

### Utilities

- `~/Projects/fresco-next/utils/composeEventHandlers.ts` → `packages/fresco-ui/src/utils/composeEventHandlers.ts`
- `~/Projects/fresco-next/utils/NoSSRWrapper.tsx` → `packages/fresco-ui/src/utils/NoSSRWrapper.tsx`

### Hooks

- `~/Projects/fresco-next/hooks/useNodeInteractions.ts` → `packages/fresco-ui/src/hooks/useNodeInteractions.ts`
- `~/Projects/fresco-next/hooks/usePrevious.ts` → `packages/fresco-ui/src/hooks/usePrevious.ts`
- `~/Projects/fresco-next/hooks/useResizablePanel.ts` → `packages/fresco-ui/src/hooks/useResizablePanel.ts`

(These join the already-planned `useSafeAnimate.ts`.)

### Custom icons (Icon.tsx dependency)

- `~/Projects/fresco-next/lib/interviewer/components/icons/` → `packages/fresco-ui/src/icons/` (entire directory tree)

`Icon.tsx` imports `customIcons` from this directory and falls back to Lucide for everything else. Move the directory verbatim, then update Icon.tsx's import to `'./icons'` (relative path inside the package). `lucide-react` stays as a normal dep (already on the A3 catalog list).

After migration, the directory must NOT have a barrel file (`index.ts`) per the user's global rules. If `~/lib/interviewer/components/icons/index.ts` (or similar) is the entry point, refactor: rename to a non-`index` filename (e.g. `icons.ts`) and update Icon.tsx's import to point at it.

### Codemod: add to G4 rules

Each new migrating file gets a corresponding rewrite rule in the Fresco codemod (Task G4):

| From | To |
|---|---|
| `from '~/utils/composeEventHandlers'` | `from '@codaco/fresco-ui/utils/composeEventHandlers'` |
| `from '~/utils/NoSSRWrapper'` | `from '@codaco/fresco-ui/utils/NoSSRWrapper'` |
| `from '~/hooks/useNodeInteractions'` | `from '@codaco/fresco-ui/hooks/useNodeInteractions'` |
| `from '~/hooks/usePrevious'` | `from '@codaco/fresco-ui/hooks/usePrevious'` |
| `from '~/hooks/useResizablePanel'` | `from '@codaco/fresco-ui/hooks/useResizablePanel'` |
| `from '~/lib/interviewer/components/icons'` (and any subpath) | the package no longer publicly exports the icons; `Icon` is the only consumer |

## R2 — Per-component reshape decisions

These are the specific reshapes for components A1 flagged as having external couplings:

### `TimeAgo.tsx` — drop `~/fresco.config` dependency

Currently imports `dateOptions` (an `Intl.DateTimeFormatOptions` object) from `~/fresco.config`. The object is generic (year/month/day/hour/minute formatting — nothing Fresco-specific):

```ts
export const dateOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric',
};
```

**Reshape:** inline this constant inside `packages/fresco-ui/src/TimeAgo.tsx` as a default, and accept an optional `dateOptions` prop on the component for callers who want to override it. Remove the `~/fresco.config` import.

### `Icon.tsx` — replace `~/lib/interviewer/components/icons` with relative `./icons`

Already covered under R1 (Custom icons). The reshape in `Icon.tsx` itself is one line:

```ts
// before
import customIcons from '~/lib/interviewer/components/icons';
// after
import customIcons from './icons';
```

(Or a non-barrel path like `'./icons/icons'` if R1's rename was needed.)

### `form/utils/focusFirstError.ts` — already covered

It imports `~/lib/interviewer/utils/scrollParent`, which is already in the original migration scope (moves to `src/utils/scrollParent.ts`). No additional reshape needed; just the standard `~/...` → relative-path rewrite within the package.

### `form/hooks/useProtocolForm.tsx` — leave behind (unchanged)

Per the original spec §5: stays in Fresco at `lib/interviewer/forms/useProtocolForm.tsx` (relocated in Task G3). No change.

## R3 — Build strategy: use `preserveModules`

Per A6, Rolldown's `preserveModules` option shipped in May 2025 (closed `rolldown#2622`) and is stable. Replace the multi-entry-with-shared-chunks strategy from the original spec §4.3 with `preserveModules: true, preserveModulesRoot: 'src'`.

Result:
- One output file per source file (no shared `chunks/` directory)
- The `exports` map in `package.json` is a 1:1 mirror of the public allowlist's source paths — no chunk filenames to worry about
- Simpler `vite.config.ts` (no `lib.entry` enumeration; `lib.entry` becomes a single string pointing at a "no-op" entry, with all real files reached through the rolldown options)

### Updated `vite.config.ts` (replaces the version in plan Task B7)

```ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve, dirname } from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';
import { globSync } from 'tinyglobby';

const cssCopyPlugin = () => ({
  name: 'fresco-ui-css-copy',
  async closeBundle() {
    const files = globSync(['src/**/*.css'], { cwd: import.meta.dirname });
    for (const rel of files) {
      const out = rel.replace(/^src\//, 'dist/');
      await mkdir(dirname(out), { recursive: true });
      await copyFile(rel, out);
    }
  },
});

export default defineConfig(() => ({
  build: {
    lib: {
      // Single nominal entry; `preserveModules` causes Rolldown to walk the dep
      // graph and emit one file per source module under dist/.
      entry: resolve(import.meta.dirname, 'src/styles.css'), // sentinel; real entries are reached via the graph
      formats: ['es'],
    },
    rolldownOptions: {
      input: globSync(
        ['src/**/*.{ts,tsx}', '!src/**/*.{stories,test,spec}.{ts,tsx}', '!src/**/__tests__/**'],
        { cwd: import.meta.dirname },
      ),
      external: [
        /^react/, /^react-dom/,
        /^@radix-ui/, /^@base-ui/,
        /^motion/, /^@tiptap/,
        /^lucide-react/,
        /^class-variance-authority/, /^cva/,
        /^clsx/, /^tailwind-merge/,
        /^luxon/,
        /^zustand/, /^immer/,
        /^@codaco\//,
      ],
      output: {
        format: 'esm',
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
  },
  plugins: [
    dts({
      include: 'src',
      exclude: ['**/*.stories.tsx', '**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
    }),
    cssCopyPlugin(),
  ],
}));
```

(Verify the actual `lib.entry` shape against A6's recommended snippet at `A6-build-tooling.md`; the snippet above resolves the sentinel/preserveModules tension by feeding the real entry list through `rolldownOptions.input` and using `lib.entry` only to satisfy Vite's lib-mode requirement.)

### Updated `exports.config.ts` semantics

The allowlist still enumerates public subpaths, but `build-exports.mjs` no longer needs to feed Vite an entry list — Rolldown discovers entries from the input glob. The script's only job becomes generating the `package.json` `exports` map. Simpler.

Update plan Task B7's script accordingly.

## R4 — Phase G branch strategy (Fresco)

A2 found Fresco is on branch `reorganise-ui` (HEAD `ade5abadf` "reorganise UI components ready for migration to package") — i.e. the prep commit *for* this migration, not `next` as the session-start git status implied.

**Per user direction:** Phase G (Fresco-side migration) runs **directly on the `reorganise-ui` branch** in `~/Projects/fresco-next`, no sub-branch.

This means:
- Subagents working on Phase G operate on `~/Projects/fresco-next` directly.
- They do NOT create a Fresco worktree.
- They do NOT create a sub-branch off `reorganise-ui`.
- Commits land on `reorganise-ui` directly.

Subagent prompts for Phase G must include this branch-strategy context explicitly.

## R5 — Updated dependency catalog additions (per A3)

A3 found 28 packages need adding to the monorepo catalog. The plan's Task B2 still applies, but the list is larger than the spec suggested. See `A3-deps.md` for the authoritative table. Notable additions:

- All 8 `@tiptap/*` packages (RichTextRenderer)
- `@base-ui/react` (covers 16 subpath imports)
- `cva` (different from existing `class-variance-authority`)
- `comlink`, `fuse.js`, `immer`, `nanoid`, `react-aria-components`, `react-best-merge-refs`
- `react-markdown` + 3 markdown plugins
- `storybook` (the package brings the first Storybook to the monorepo)
- `zustand`

## R6 — `useProtocolForm` is also a Fresco-only hook — confirm location

The original spec said `useProtocolForm` moves to `lib/interviewer/forms/useProtocolForm.tsx` (Task G3). A1 confirmed it's the only file importing `~/lib/interviewer/selectors/forms`. No change to the relocation target — but during G3, the subagent should verify Fresco's existing `lib/interviewer/` structure makes that location sensible (or pick a similar one and document the choice).

---

## Where each revision lands in the plan

| Revision | Plan tasks affected |
|---|---|
| R1 (scope additions) | C1 (utils — add composeEventHandlers, NoSSRWrapper), C2 (hooks — add useNodeInteractions, usePrevious, useResizablePanel), C9 (Icon — add custom icons directory + reshape import), G4 (codemod rules) |
| R2 (per-component reshape) | C6 (TimeAgo inline dateOptions), C9 (Icon import rewrite) |
| R3 (preserveModules) | B7 (vite.config.ts), B8 (sentinel build expectations), Section 4.3 of spec |
| R4 (Fresco branch) | All G-tasks (G1-G7) |
| R5 (catalog additions) | B2 (uses A3 directly) |
| R6 (useProtocolForm location) | G3 (verify location during execution) |
