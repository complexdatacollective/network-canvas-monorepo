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

## R7 — Additional findings during C1+C2 dispatch (2026-04-30)

Two issues surfaced when C1+C2 first ran:

### R7a — Add `useSafeLocalStorage` to migration scope

`hooks/useResizablePanel.ts` imports `useSafeLocalStorage` from `~/hooks/useSafeLocalStorage`. Add it.

- Source: `~/Projects/fresco-next/hooks/useSafeLocalStorage.ts` → `packages/fresco-ui/src/hooks/useSafeLocalStorage.ts`
- Brings new third-party deps: `usehooks-ts` (Fresco currently uses `^3.1.1`). `zod/mini` is already covered by the catalog `zod` entry.
- Add `usehooks-ts: ^3.1.1` to the monorepo catalog (`pnpm-workspace.yaml`).
- Add `usehooks-ts: catalog:` to `packages/fresco-ui/package.json` `dependencies`.
- Add to the rewrite table: `from '~/hooks/useSafeLocalStorage'` → `from './useSafeLocalStorage'` (within the package).
- Add to the G4 codemod rule list: `from '~/hooks/useSafeLocalStorage'` → `from '@codaco/fresco-ui/hooks/useSafeLocalStorage'`.
- Add to `exports.config.ts` allowlist: `{ subpath: './hooks/useSafeLocalStorage', source: 'hooks/useSafeLocalStorage.ts' }`.

### R7b — Reshape `NoSSRWrapper` to drop the `next/dynamic` dependency

Fresco's `utils/NoSSRWrapper.tsx` uses `next/dynamic` with `ssr: false` — a Next-specific API. The package must be consumable from non-Next monorepo apps (architect-vite, interviewer) so this dependency must go.

The current implementation:

```tsx
import dynamic from 'next/dynamic';
const NoSSRWrapper = ({ children }) => <>{children}</>;
const NoSSRWrapperDynamic = dynamic(() => Promise.resolve(NoSSRWrapper), { ssr: false });
export const withNoSSRWrapper = (WrappedComponent) => (props) =>
  <NoSSRWrapperDynamic><WrappedComponent {...props} /></NoSSRWrapperDynamic>;
```

Replace with a generic mount-detection pattern (same observable behaviour for SSR consumers, no Next dep, works in non-SSR consumers as a no-op-after-mount):

```tsx
import { useEffect, useState, type ComponentProps, type ComponentType, type ReactNode } from 'react';

const NoSSRWrapper = ({ children }: { children: ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : null;
};

export const withNoSSRWrapper = <P extends object>(
  WrappedComponent: ComponentType<P>,
): React.FC<ComponentProps<ComponentType<P>>> => {
  const WithNoSSRWrapper: React.FC<ComponentProps<ComponentType<P>>> = (props) => (
    <NoSSRWrapper>
      <WrappedComponent {...props} />
    </NoSSRWrapper>
  );
  return WithNoSSRWrapper;
};
```

Notes:
- The original `NoSSRWrapper` (without Dynamic) was identity (`<>{children}</>`). The reshape makes it actually skip server render via mount detection. Behaviour is functionally equivalent for the use case (skip SSR), and works in any React environment.
- Drop `next/dynamic` from imports. Keep the file's docstring relevant — strip the Next-specific apologia, keep the alternatives note.

This reshape happens during the C1+C2 file copy (subagent rewrites the file content as part of the migration, not a verbatim copy).

## Revision index

| Revision | Plan tasks affected |
|---|---|
| R1 (scope additions) | C1 (utils — add composeEventHandlers, NoSSRWrapper), C2 (hooks — add useNodeInteractions, usePrevious, useResizablePanel), C9 (Icon — add custom icons directory + reshape import), G4 (codemod rules) |
| R2 (per-component reshape) | C6 (TimeAgo inline dateOptions), C9 (Icon import rewrite) |
| R3 (preserveModules) | B7 (vite.config.ts), B8 (sentinel build expectations), Section 4.3 of spec |
| R4 (Fresco branch) | All G-tasks (G1-G7) |
| R5 (catalog additions) | B2 (uses A3 directly) |
| R6 (useProtocolForm location) | G3 (verify location during execution) |
| R7a (useSafeLocalStorage scope) | C2 (hooks — add useSafeLocalStorage), B2 retroactively (catalog: add `usehooks-ts`), G4 (codemod rule) |
| R7b (NoSSRWrapper reshape) | C1 (utils — reshape during copy) |
| R8 (NativeLink split) | New C-task: extract `NativeLink` from Fresco's `components/ui/Link.tsx` into `packages/fresco-ui/src/NativeLink.tsx`. Fresco's `Link.tsx` keeps only the default Next-coupled `Link` export and moves to `components/Link.tsx` per spec §3.2 (G3). Codemod rule G4: `from '~/components/ui/Link'` is NOT migrated to `@codaco/fresco-ui/Link` — it's relocated to `~/components/Link` per G3. The two NativeLink consumers (Link.tsx itself and RenderMarkdown.tsx) handle the import differently: RenderMarkdown imports from package locally; any Fresco code importing `NativeLink` (currently zero) imports from `@codaco/fresco-ui/NativeLink` post-codemod. |
| R9 (C6 reorder) | Original plan order (C6 primitives → C7 Button → C8 Radix → … → C12 layout → C13 typography) was wrong: `Alert.tsx` and `RenderMarkdown.tsx` (in C6) depend on layout/typography. New order: C12+C13 first (already done), then a "C6.5" task that lands Alert + NativeLink + RenderMarkdown. C6 was completed partially (9 of 11 components landed) and the deferred two will land in C6.5. |

## R8 — Extract `NativeLink` from `Link.tsx`

Fresco's `components/ui/Link.tsx` exports two things:

- `Link` (default) — wraps `next/link`. Coupled to Next.js. Stays in Fresco per spec §3.2.
- `NativeLink` (named) — wraps a plain `<a>`. No Next coupling. Generic. Used by `RenderMarkdown.tsx`.

Since `NativeLink` is the only export `RenderMarkdown` needs (and `RenderMarkdown` is migrating), split:

- Copy `NativeLink` (the named export, plus its shared className constants) into `packages/fresco-ui/src/NativeLink.tsx`.
- The function body matches Fresco's verbatim:
  ```tsx
  import { cx } from './utils/cva';

  const groupClasses =
    'group text-link focusable rounded-sm font-semibold transition-all duration-300 ease-in-out';
  const spanClasses =
    'from-link to-link bg-linear-to-r bg-[length:0%_2px] bg-bottom-left bg-no-repeat pb-[2px] transition-all duration-200 ease-out group-hover:bg-[length:100%_2px]';

  export function NativeLink({ className, ...props }: React.ComponentProps<'a'>) {
    return (
      <a className={cx(groupClasses, className)} {...props}>
        <span className={spanClasses}>{props.children}</span>
      </a>
    );
  }
  ```
- Add to allowlist: `{ subpath: './NativeLink', source: 'NativeLink.tsx' }`.

Fresco-side: when Link.tsx moves to `components/Link.tsx` in Phase G3, drop the `NativeLink` export from it (no Fresco code imports it; only RenderMarkdown did, and RenderMarkdown is now in the package).

## R9 — C6 reorder

Original plan order was wrong (Alert/RenderMarkdown in C6 depend on layout+typography in C12/C13). Actual execution order:

- C1+C2: utils + hooks ✓
- C3: shared styles ✓
- C4+C5: tailwind plugins + styles.css ✓
- C6 (partial — 9 of 11): primitives without internal cross-deps ✓
- **C12+C13: layout + typography** ✓ (moved up)
- **C6.5: Alert + NativeLink + RenderMarkdown** (new — handles the deferred C6 items)
- C7 onward: Button, Radix primitives, Icon/Node/Toast, Modal, RichTextRenderer, subsystems

This reordering doesn't change anything later in the plan; it just resolves the dependency mismatch that surfaced.
