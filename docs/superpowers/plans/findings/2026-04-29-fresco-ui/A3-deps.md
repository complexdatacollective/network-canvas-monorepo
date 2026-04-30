# A3: Dependency inventory for `@codaco/fresco-ui`

Scope: every file under `components/ui/**` (excluding `SubmitButton.tsx`, `Link.tsx`, `form/hooks/useProtocolForm.tsx`, and `form/hooks/useProtocolForm.stories.tsx`), plus `utils/cva.ts`, `utils/generatePublicId.ts`, `utils/prettify.ts`, `hooks/useSafeAnimate.ts`, `lib/interviewer/utils/scrollParent.ts`, `styles/shared/**`, and `styles/plugins/**` from `~/Projects/fresco-next`. 242 files in scope.

## Dependency table

37 unique third-party packages were imported across the migration scope. Versions were taken from `~/Projects/fresco-next/package.json` and the `catalog:` block in `~/Projects/network-canvas/pnpm-workspace.yaml`.

| Package | Fresco version | Monorepo catalog version | Resolution |
| --- | --- | --- | --- |
| `@base-ui/react` | `1.4.0` | _(not in catalog)_ | `add-to-catalog` |
| `@codaco/protocol-validation` | `11.4.0-alpha.0` | _(not in catalog)_ | `add-to-catalog` |
| `@codaco/shared-consts` | `5.0.0` | _(not in catalog)_ | `add-to-catalog` |
| `@faker-js/faker` | `^10.4.0` | `^10.4.0` | `catalog` |
| `@radix-ui/react-slot` | `^1.2.4` | `^1.2.4` | `catalog` |
| `@storybook/nextjs-vite` | `^10.3.5` | _(not in catalog)_ | `add-to-catalog` (devDep — see Notes) |
| `@testing-library/react` | `^16.3.0` | _(not in catalog)_ | `add-to-catalog` (devDep) |
| `@testing-library/user-event` | `^14.6.1` | _(not in catalog)_ | `add-to-catalog` (devDep) |
| `@tiptap/core` | `^3.22.3` | _(not in catalog)_ | `add-to-catalog` |
| `@tiptap/extension-bullet-list` | `^3.22.3` | _(not in catalog)_ | `add-to-catalog` |
| `@tiptap/extension-heading` | `^3.22.3` | _(not in catalog)_ | `add-to-catalog` |
| `@tiptap/extension-ordered-list` | `^3.22.3` | _(not in catalog)_ | `add-to-catalog` |
| `@tiptap/extension-paragraph` | `^3.22.3` | _(not in catalog)_ | `add-to-catalog` |
| `@tiptap/pm` | `^3.22.4` | _(not in catalog)_ | `add-to-catalog` |
| `@tiptap/react` | `^3.22.3` | _(not in catalog)_ | `add-to-catalog` |
| `@tiptap/starter-kit` | `^3.22.3` | _(not in catalog)_ | `add-to-catalog` |
| `comlink` | `^4.4.2` | _(not in catalog)_ | `add-to-catalog` |
| `cva` | `1.0.0-beta.4` | _(not in catalog — `class-variance-authority 0.7.1` is the legacy entry)_ | `add-to-catalog` (see Notes) |
| `es-toolkit` | `^1.45.1` | `^1.46.0` | `catalog` (Fresco's range is satisfied by catalog upgrade) |
| `fuse.js` | `^7.3.0` | _(not in catalog)_ | `add-to-catalog` |
| `immer` | `^11.1.4` | _(not in catalog)_ | `add-to-catalog` |
| `lucide-react` | `^1.8.0` | `^1.9.0` | `catalog` (catalog range is forward-compatible) |
| `motion` | `^12.38.0` | `^12.38.0` | `catalog` |
| `nanoid` | `^5.1.9` | _(not in catalog)_ | `add-to-catalog` |
| `react` | `19.2.5` | `^19.2.5` | `catalog` (peer — see Peer-dependency candidates) |
| `react-aria-components` | `^1.16.0` | _(not in catalog)_ | `add-to-catalog` |
| `react-best-merge-refs` | `^1.0.2` | _(not in catalog)_ | `add-to-catalog` |
| `react-dom` | `19.2.5` | `^19.2.5` | `catalog` (peer) |
| `react-markdown` | `^10.1.0` | _(not in catalog)_ | `add-to-catalog` |
| `rehype-raw` | `^7.0.0` | _(not in catalog)_ | `add-to-catalog` |
| `rehype-sanitize` | `^6.0.0` | _(not in catalog)_ | `add-to-catalog` |
| `remark-gemoji` | `^8.0.0` | _(not in catalog)_ | `add-to-catalog` |
| `storybook` | `^10.3.5` | _(not in catalog)_ | `add-to-catalog` (devDep) |
| `tailwind-merge` | `^3.5.0` | `^3.5.0` | `catalog` |
| `tailwindcss` | `4.2.2` | `^4.2.4` | `catalog` (catalog satisfies; tailwind is a peer/devDep — see Notes) |
| `vitest` | `^4.1.4` | `^4.1.5` | `catalog` (devDep) |
| `zod` | `^4.3.6` | `^4.3.6` | `catalog` |
| `zustand` | `^5.0.12` | _(not in catalog)_ | `add-to-catalog` |

Tally: **9 catalog**, **28 add-to-catalog**, **0 direct**.

## Peer-dependency candidates

These should be `peerDependencies` (with matching `devDependencies` for local dev/build) rather than plain `dependencies`. Justifications below.

- **`react`** — Standard React rule; duplicate copies break hooks, contexts, and reconciliation. Required by virtually every file.
- **`react-dom`** — Same reasoning as React. Used directly by `dropdown-menu.tsx` (`createPortal`) and Modal/Dialog plumbing.
- **`zustand`** — `components/ui/dnd`, `components/ui/collection`, and `components/ui/dialogs` all expose store/provider patterns and re-export hooks bound to those stores. Consumers (Fresco, future apps) will read from the same stores via `useStore`/`useShallow`; two copies of zustand mean separate store registries and broken context. The package surface includes `DndStoreProvider`, `DialogProvider`, `CollectionProvider`. Mark as peer.
- **`immer`** — Used by zustand middleware (`zustand/middleware/immer`) and the form store. Immer's `produce` keeps a draft proxy registry; mixing copies can cause "Cannot perform 'X' on a proxy that has been revoked" errors when drafts cross package boundaries. Peer alongside zustand.
- **`tailwindcss`** — Consumed at the consumer's build step (the package ships compiled CSS plus tailwind plugins under `styles/plugins/**` that the host config loads). The host project provides tailwind. Peer + devDep.
- **`motion`** — Borderline. The package exposes `MotionConfig`-aware components and `LayoutGroup` boundaries (e.g. drag preview, dialog transitions). Two copies of `motion` would mean separate `AnimatePresence` trees and broken `layoutId` shared-layout animations across consumer code. **Recommend peer.**
- **`react-aria-components`** — Borderline. Currently imported only inside the package (RAC components are leaf usage, not boundary types). Lean **dep**, not peer.
- **`@radix-ui/react-slot`** — Confirmed lean dep, not peer (per task brief). Single internal use site.
- **`zod`** — The form subsystem (`components/ui/form/validation/**`) accepts and re-exports schema types. If consumers pass their own `z.object(...)` schemas to the form runtime they must be the same `zod`. Catalog already pins a single major. **Recommend peer** to be safe.
- **`@codaco/protocol-validation`, `@codaco/shared-consts`** — These provide shared protocol type definitions used at the package's API surface (form fields receive variable definitions typed against these). Two copies would mean two non-overlapping nominal types in TypeScript and runtime instanceof / enum mismatches. **Recommend peer.**

**Final proposed peer set:** `react`, `react-dom`, `zustand`, `immer`, `tailwindcss`, `motion`, `zod`, `@codaco/protocol-validation`, `@codaco/shared-consts`.

Storybook, vitest, testing-library, faker — all `devDependencies`.

## Notes

- **`cva` vs `class-variance-authority`** — The catalog has the legacy `class-variance-authority` (`0.7.1`); Fresco has migrated to the new `cva` package (`1.0.0-beta.4`). These are two different npm packages by the same author. The catalog needs the new `cva` entry; we should not pull in `class-variance-authority`. Worth flagging in Task B2 because the legacy entry may want removing once other catalog consumers migrate.
- **`@base-ui/react` is the heaviest single dependency by surface area** — it is imported from 16 distinct subpaths (checkbox, combobox, dialog, menu, popover, progress, radio, radio-group, select, slider, switch, toggle, toggle-group, toolbar, tooltip, plus the root). A single catalog entry covers all of them.
- **`@tiptap/*` cluster (8 packages)** — used only by `RichTextEditor.tsx` and its story. If we ever want to slim the install, this is the obvious lazy-load candidate. For now, all 8 must be declared.
- **`comlink`** — used only by `collection/filtering/search.worker.ts` and `collection/hooks/useSearchWorker.ts` for the worker bridge. Keep.
- **`fuse.js`** — used only by `collection/filtering/search.worker.ts` and `FilterManager.ts`. Single subsystem.
- **`react-best-merge-refs`** — niche utility, single-purpose. Trivial dep, no concerns.
- **`remark-gemoji` + `rehype-raw` + `rehype-sanitize`** — three plugins for `react-markdown`. All three live in `RenderMarkdown.tsx` and `RichTextRenderer.tsx`. They travel together.
- **`storybook` 10.x is brand-new** — Fresco is on `^10.3.5`. The monorepo catalog has no Storybook entry, so adding it pins the org on a single major. Worth coordinating with the wider monorepo if any other package wants Storybook later.
- **`zod/mini`** — `formStore.ts` imports from `zod/mini`. Same npm package, sub-export — no separate dep needed.
- **Excluded from inventory**: `useProtocolForm.tsx` (and its story) — confirmed via removal from input set before grep. The two files import additional packages (`react-hook-form`, `@hookform/resolvers`, etc.) that are intentionally NOT in this list.
- **Tailwind plugins under `styles/plugins/**`** — `tailwind-motion-spring.ts`, `tailwind-elevation/`, `tailwind-inset-surface/` import `tailwindcss/plugin`. These are Node-side build helpers, executed at the consumer's tailwind config evaluation. `tailwindcss` should appear in both `peerDependencies` and `devDependencies`.
