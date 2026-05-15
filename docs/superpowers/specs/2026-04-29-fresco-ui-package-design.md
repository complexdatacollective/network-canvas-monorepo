# `@codaco/fresco-ui` — Design Spec

**Date:** 2026-04-29
**Author:** Joshua Melville (with Claude)
**Status:** Approved (brainstorming complete)
**Implementation:** see companion plan in `docs/superpowers/plans/`

## 1. Goal

Migrate Fresco's `components/ui/` directory (and its supporting styles/utilities) out of `~/Projects/fresco-next` and into a new package, `@codaco/fresco-ui`, in the `~/Projects/network-canvas` monorepo. Fresco consumes the package via npm; selected monorepo apps will be able to consume it too.

## 2. Constraints and decisions (locked in)

The following decisions were made during brainstorming and are fixed inputs to implementation:

| Decision                              | Value                                                                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relationship to existing `@codaco/ui` | Separate package, lives alongside                                                                                                                                                      |
| Consumers                             | Fresco (primary) + selected monorepo apps                                                                                                                                              |
| Package name                          | `@codaco/fresco-ui`                                                                                                                                                                    |
| Distribution                          | Published to npm via the monorepo's existing `changesets` pipeline                                                                                                                     |
| Tailwind config style                 | **Tailwind v4 CSS-first** (no `tailwind.config.ts`, no JS preset)                                                                                                                      |
| Build tool                            | **Vite 8** (Rolldown bundler) library mode + `vite-plugin-dts`                                                                                                                         |
| Public API shape                      | Per-component subpath exports — **no barrel files**                                                                                                                                    |
| Internal layout                       | **Flat** (Approach 1): mirrors Fresco's tree, no `primitives/`/`subsystems/`/`foundations/` taxonomy                                                                                   |
| Lint                                  | Biome (matches monorepo)                                                                                                                                                               |
| TypeScript                            | extends `@codaco/tsconfig`, React 19 from the catalog                                                                                                                                  |
| Storybook                             | Lives in the package (`packages/fresco-ui/.storybook/`); first Storybook in the monorepo. Fresco continues to run its own Storybook for app-specific stories (interview stages, etc.). |
| Visual regression / Chromatic         | Stays in Fresco for interview-stage stories. The package ships **without** VR coverage initially.                                                                                      |
| Versioning                            | Pre-1.0 (`0.1.0-alpha.0` initial, on `next` dist-tag)                                                                                                                                  |

## 3. Scope

### 3.1 What ships in `@codaco/fresco-ui`

Everything currently under Fresco's `~/components/ui/` **except** `SubmitButton.tsx` and `Link.tsx`.

This includes:

- All top-level primitives: `Alert`, `Button` (+ `button-constants`; note: `IconButton` and `MotionButton` are exports from `Button.tsx`, not separate files — `IconButton.stories.tsx` documents that export), `CloseButton`, `Icon`, `Modal/`, `Node`, `Pips`, `ProgressBar`, `RenderMarkdown`, `ResizableFlexPanel`, `RichTextRenderer`, `ScrollArea`, `Spinner`, `TimeAgo`, `Toast`, `badge`, `dropdown-menu`, `popover`, `skeleton`, `table`, `tooltip`, `Label`
- `layout/` — `Surface`, `ResponsiveContainer`
- `typography/` — `Heading`, `Paragraph`, `PageHeader`, `UnorderedList`
- The four subsystems with their tests:
  - `form/` (~88 files: store, validation, fields, schemas)
  - `collection/` (~60 files: sortable/filterable grid+list, keyboard navigation)
  - `dnd/` (~15 files: drag-and-drop)
  - `dialogs/` (~15 files: Dialog, wizard, DialogProvider)

Travelling alongside the components:

- `~/utils/cva.ts` → `src/utils/cva.ts`
- `~/styles/shared/controlVariants.ts` → `src/styles/controlVariants.ts`
- `~/styles/shared/colors.css` → `src/styles/colors.css`
- `~/styles/plugins/tailwind-elevation/` → `src/styles/plugins/elevation/`
- `~/styles/plugins/tailwind-inset-surface/` → `src/styles/plugins/inset-surface/`
- `~/styles/plugins/tailwind-motion-spring.ts` → `src/styles/plugins/motion-spring.ts`
- `~/utils/generatePublicId.ts` → `src/utils/generatePublicId.ts`
- `~/utils/prettify.ts` → `src/utils/prettify.ts` (type-only)
- `~/hooks/useSafeAnimate.ts` → `src/hooks/useSafeAnimate.ts`
- `~/lib/interviewer/utils/scrollParent.ts` → `src/utils/scrollParent.ts`

The 56 `.stories.tsx` files alongside their components.

### 3.2 What does NOT ship

- `SubmitButton.tsx` → moves back to `~/components/SubmitButton.tsx` in Fresco (Next form-state coupling)
- `Link.tsx` → moves back to `~/components/Link.tsx` in Fresco (next/link coupling)
- `~/components/ui/form/hooks/useProtocolForm.tsx` (and its story) → moves to a Fresco-internal location (final path TBD in plan; e.g. `~/lib/interviewer/forms/useProtocolForm.tsx`). It's a Network-Canvas-protocol-aware bridge that imports `~/lib/interviewer/selectors/forms` (Fresco-specific Redux state) and is the **only** form file with such coupling. After relocation, `@codaco/fresco-ui/form/...` is store-free and protocol-agnostic.
- `~/styles/themes/default.css` and `~/styles/themes/interview.css` — app-level themes; consumers apply them
- `~/styles/globals.css` — Fresco-specific globals stay in Fresco

### 3.3 What gets deprecated

- `@codaco/tailwind-config/fresco.ts` (the JS preset) — Fresco was its only consumer; the authoritative tokens move into `@codaco/fresco-ui/styles.css` (CSS-first). Preset is deleted as part of this migration.
- `@codaco/tailwind-config/base.ts` — kept untouched (other monorepo apps may still use it).
- `@codaco/tailwind-config/globals.css` — content reviewed against Fresco's authoritative tokens. Anything Fresco uses moves to `@codaco/fresco-ui/styles.css`. The file may be deleted or kept depending on whether anything else in the monorepo references it.

## 4. Architecture

### 4.1 Package layout

```
packages/fresco-ui/
├── package.json
├── tsconfig.json                 (extends @codaco/tsconfig)
├── vite.config.ts                (Vite 8 / Rolldown library mode, multi-entry)
├── biome.json                    (extends monorepo)
├── .storybook/
│   ├── main.ts
│   ├── preview.tsx
│   ├── StoryInterviewShell.tsx
│   ├── theme-switcher.tsx
│   ├── vite-plugin-stub-use-server.ts
│   └── themes/
│       ├── default.css           (Storybook-only fixture; mirrors Fresco's themes/default.css)
│       └── interview.css         (Storybook-only fixture; mirrors Fresco's themes/interview.css)
├── scripts/
│   └── build-exports.mjs         (single source of truth: writes `exports` and `lib.entry`)
├── exports.config.ts             (curated allowlist for the public API)
└── src/
    ├── styles.css                (the package's Tailwind v4 entry: @import + @theme + @plugin + @source)
    ├── Alert.tsx
    ├── Alert.stories.tsx
    ├── Button.tsx
    ├── button-constants.ts
    ├── Button.stories.tsx
    ├── CloseButton.tsx
    ├── Icon.tsx
    ├── Icon.stories.tsx
    ├── IconButton.stories.tsx
    ├── Label.tsx
    ├── Modal/{Modal.tsx, ModalBackdrop.tsx, ModalPopup.tsx, Modal.stories.tsx}
    ├── Node.tsx
    ├── Node.stories.tsx
    ├── Pips.tsx
    ├── ProgressBar.tsx
    ├── ProgressBar.stories.tsx
    ├── RenderMarkdown.tsx
    ├── ResizableFlexPanel.tsx
    ├── ResizableFlexPanel.stories.tsx
    ├── RichTextRenderer.tsx
    ├── RichTextRenderer.stories.tsx
    ├── ScrollArea.tsx
    ├── ScrollArea.stories.tsx
    ├── Spinner.tsx
    ├── Spinner.stories.tsx
    ├── TimeAgo.tsx
    ├── Toast.tsx
    ├── Toast.stories.tsx
    ├── badge.tsx
    ├── dropdown-menu.tsx
    ├── dropdown-menu.stories.tsx
    ├── popover.tsx
    ├── skeleton.tsx
    ├── skeleton.stories.tsx
    ├── table.tsx
    ├── table.stories.tsx
    ├── tooltip.tsx
    ├── tooltip.stories.tsx
    ├── Colors.stories.tsx
    ├── layout/
    │   ├── Surface.tsx
    │   ├── Surface.stories.tsx
    │   └── ResponsiveContainer.tsx
    ├── typography/
    │   ├── Heading.tsx
    │   ├── Heading.stories.tsx
    │   ├── Paragraph.tsx
    │   ├── Paragraph.stories.tsx
    │   ├── PageHeader.tsx
    │   ├── UnorderedList.tsx
    │   ├── UnorderedList.stories.tsx
    │   └── TypeScale.stories.tsx
    ├── form/                     (~88 files preserved at relative paths under here)
    ├── collection/                (~60 files preserved at relative paths under here)
    ├── dnd/                       (~15 files preserved at relative paths under here)
    ├── dialogs/                   (~15 files preserved at relative paths under here)
    ├── styles/
    │   ├── controlVariants.ts
    │   ├── colors.css
    │   └── plugins/
    │       ├── elevation/        (preserve internal layout)
    │       ├── inset-surface/    (preserve internal layout)
    │       └── motion-spring.ts
    ├── utils/
    │   ├── cva.ts
    │   ├── generatePublicId.ts
    │   ├── prettify.ts
    │   └── scrollParent.ts
    └── hooks/
        └── useSafeAnimate.ts
```

File casing is preserved exactly as it currently exists in Fresco (some lowercase like `badge.tsx`/`popover.tsx`, some PascalCase like `Button.tsx`). Renaming for consistency is out of scope for this migration.

### 4.2 Public API via subpath exports

`package.json` declares one entry per _consumable_ file. Generated by `scripts/build-exports.mjs` from the `exports.config.ts` allowlist.

```jsonc
"exports": {
  "./styles.css":                       "./dist/styles.css",
  "./styles/colors.css":                "./dist/styles/colors.css",
  "./Button":             { "types": "./dist/Button.d.ts",           "default": "./dist/Button.js" },
  "./Modal":              { "types": "./dist/Modal/Modal.d.ts",      "default": "./dist/Modal/Modal.js" },
  "./layout/Surface":     { "types": "./dist/layout/Surface.d.ts",   "default": "./dist/layout/Surface.js" },
  "./form/components/Field":            { ... },
  "./form/store/provider":              { ... },
  "./utils/cva":                        { ... },
  "./hooks/useSafeAnimate":             { ... }
  /* … one per public file */
}
```

The same allowlist drives `lib.entry` in `vite.config.ts`, so the package's `exports` map and the Vite multi-entry list cannot drift.

**Privacy boundary.** Subsystem internals (e.g. `form/store/formStore.ts`, `collection/store/createCollectionSorter.ts`) are _not_ in `exports`. They remain build artefacts for the package's own consumption but are not import-reachable through the public API. The allowlist is generated initially by walking Fresco's current import sites — every file that imports `~/components/ui/...` from outside `components/ui/` tells us what's public.

**Validation.** The `build-exports.mjs` script fails the build if a `src/` file is matched by a public-allowlist glob but has no resolved entry, or if a resolved file isn't reachable from any allowlist entry. Renames cannot silently disappear from the API.

### 4.3 Build (Vite 8 / Rolldown)

Vite 8 ships Rolldown as the bundler. Notes specific to this design:

- `build.rolldownOptions` (not `rollupOptions`).
- **Rolldown does not yet support `output.preserveModules`** ([rolldown#2622](https://github.com/rolldown/rolldown/issues/2622)). Strategy: declare every public file as a named entry in `lib.entry`. Rolldown emits one bundled output per entry, plus automatic shared chunks for code reused across entries. Consumers only ever import named entries via `exports`; chunk files are package-private.
- Externals: `react`, `react-dom`, `@radix-ui/*`, `@base-ui/*`, `motion`, `@tiptap/*`, `lucide-react`, `class-variance-authority`/`cva`, `clsx`, `tailwind-merge`, `luxon`. Anything declared in `dependencies` / `peerDependencies` is external.
- `output.entryFileNames: '[name].js'`, `output.chunkFileNames: 'chunks/[hash].js'`, `formats: ['es']` only (no CJS), `minify: false`, `sourcemap: true`.
- Fallback if Rolldown's automatic chunking fragments badly: set `codeSplitting: false` and accept duplication, or promote shared utilities to standalone entries. Decided after the first build.

```ts
// packages/fresco-ui/vite.config.ts (sketch)
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { entries } from './scripts/build-exports.mjs';

export default defineConfig({
  build: {
    lib: { entry: entries(), formats: ['es'] },
    rolldownOptions: {
      external: [/^react/, /^react-dom/, /^@radix-ui/, /^@base-ui/, /^motion/, /^@tiptap/, /^lucide-react/, /^class-variance-authority/, /^clsx/, /^tailwind-merge/, /^cva/, /^luxon/],
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[hash].js' },
    },
    sourcemap: true,
    minify: false,
  },
  plugins: [
    dts({ include: 'src', exclude: ['**/*.stories.tsx','**/*.test.*','**/__tests__/**'] }),
    /* small plugin: copy src/**/*.css → dist/**/*.css verbatim, no PostCSS */
  ],
});
```

**CSS files.** `src/styles.css` and `src/styles/colors.css` are Tailwind v4 sources that consumers compile through _their own_ Tailwind. They must reach `dist/` unprocessed (with `@import "tailwindcss"`, `@theme`, `@plugin`, `@source` directives intact). A small Vite plugin or a build-step copy handles this — Vite's default CSS pipeline is bypassed for these files.

**Type emission.** `vite-plugin-dts` is the primary mechanism. If Vite-8/Rolldown compatibility issues surface in practice, fall back to a separate `tsc --emitDeclarationOnly --outDir dist` step in the `build` script. Decided during initial setup.

**Typecheck task.** `tsc --build --noEmit` runs in CI separately from the dts emission.

**`package.json` skeleton:**

```jsonc
{
  "name": "@codaco/fresco-ui",
  "version": "0.0.0",
  "type": "module",
  "sideEffects": ["**/*.css"],
  "files": ["dist"],
  "exports": {
    /* generated */
  },
  "scripts": {
    "build": "node scripts/build-exports.mjs && vite build",
    "dev": "vite build --watch",
    "typecheck": "tsc --build --noEmit",
    "test": "vitest run",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "prepublishOnly": "pnpm build",
    "clean": "rm -rf .turbo node_modules dist",
  },
  "peerDependencies": {
    "react": "catalog:",
    "react-dom": "catalog:",
  },
  "dependencies": {
    /* radix, base-ui, motion, tiptap, lucide-react, cva (or class-variance-authority), clsx, tailwind-merge, luxon */
  },
  "devDependencies": {
    "@codaco/tsconfig": "workspace:*",
    "vite": "catalog:",
    "vite-plugin-dts": "catalog:",
    "typescript": "catalog:",
    "@biomejs/biome": "^2.4.13",
    /* + storybook deps */
  },
  "publishConfig": { "access": "public" },
}
```

`"private": true` is dropped (the package ships).

### 4.4 Tailwind v4 CSS-first integration

The package ships its theming as CSS, not as a JS preset.

**`src/styles.css`** is the package's CSS entry. The `@theme` block carries the **entire** current Fresco token set (NC palette, semantic tokens, typography, radii, shadows, motion) — the snippet below is illustrative; the full set is lifted verbatim from Fresco's existing `styles/globals.css` + `styles/themes/default.css` + the relevant pieces of `@codaco/tailwind-config/fresco.ts` (which is being deprecated, so its tokens move here).

```css
@import 'tailwindcss';

/* Authoritative tokens (lifted from Fresco's current globals.css + themes/default.css) */
@theme {
  --color-neon-coral: hsl(var(--neon-coral));
  --color-neon-coral-dark: hsl(var(--neon-coral-dark));
  --color-sea-green: hsl(var(--sea-green));
  /* … remaining NC palette */
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-border: hsl(var(--border));
  /* … shadcn-style semantic tokens */
}

@layer base {
  :root {
    --neon-coral: 4 100% 64%;
    --sea-green: 168 70% 36%;
    /* … */
  }
}

@plugin "./styles/plugins/elevation";
@plugin "./styles/plugins/inset-surface";
@plugin "./styles/plugins/motion-spring";

@source "../../dist/**/*.js"; /* relative to dist/styles.css after build */
```

Consumers wire this into their own CSS:

```css
/* Fresco's app/globals.css */
@import '@codaco/fresco-ui/styles.css';

@source "../app/**/*.{ts,tsx}";
@source "../components/**/*.{ts,tsx}";

@import './themes/default.css';
/* @import "./themes/interview.css"; — applied conditionally */
```

No `tailwind.config.ts`, no `presets:`/`content:` arrays. The plugins are JS modules (Tailwind plugin authoring API) loaded via `@plugin`.

**`@plugin` path resolution** is relative to the CSS file's own location after build. The plugin paths in `dist/styles.css` must resolve to `dist/styles/plugins/{elevation,inset-surface,motion-spring}.js` — verified during build setup.

### 4.5 Storybook

`packages/fresco-ui/.storybook/` contains a copy of Fresco's current Storybook config, adjusted for the package context:

- `main.ts`: `stories: ['../src/**/*.stories.tsx']`, framework `@storybook/react-vite`.
- `preview.tsx`: imports `../src/styles.css` plus the Storybook-only fixture themes from `.storybook/themes/{default,interview}.css`. Keeps the existing decorators and the theme-switcher toggle.
- `StoryInterviewShell.tsx` and `theme-switcher.tsx` — moved verbatim.
- `vite-plugin-stub-use-server.ts` — moved; verify whether any migrated story actually exercises it. If none do, leave it out.
- `.storybook/themes/{default,interview}.css` — fixture duplicates of Fresco's theme files (Section 3.2 keeps the originals in Fresco). These exist solely so the Storybook preview renders correctly with the theme toggle. Maintenance cost accepted.

Run commands at the monorepo root:

- `pnpm --filter @codaco/fresco-ui storybook` (dev, port 6006)
- `pnpm --filter @codaco/fresco-ui build-storybook`

A vitest-storybook test project for the package is **out of scope** for this migration.

### 4.6 Tests

- Subsystem tests under `__tests__/` directories (in `form/`, `collection/`, `dnd/`, `dialogs/`) **move with their source** into `packages/fresco-ui/src/...`.
- Tests for utilities that move (`utils/cva` and any others) move with their source. Tests for utilities Fresco keeps stay in Fresco's `utils/__tests__/`.
- Vitest configuration is set up in the package (`vitest.config.ts`). Standard `pnpm --filter @codaco/fresco-ui test`.
- Component-level unit tests do **not** exist today for the primitives (Button, Alert, etc.); the migration does not introduce any.
- The package is added to the monorepo's `turbo.json` test task (already wildcard, but verify `inputs` cover what's needed).

### 4.7 Lint

- The package uses Biome (matches monorepo).
- `packages/fresco-ui/biome.json` extends the monorepo root config.
- ESLint config from Fresco does not travel.

## 5. Coupling resolution

The migration scope contains **one** Fresco-specific coupling:

`components/ui/form/hooks/useProtocolForm.tsx` imports `~/lib/interviewer/selectors/forms` (a Fresco Redux selector). It's used by Fresco's interviewer interfaces (NameGenerator, SlidesForm, EgoForm, FamilyPedigree, FamilyPedigree quick-start wizard).

**Resolution:** `useProtocolForm.tsx` and `useProtocolForm.stories.tsx` stay in Fresco. They move out of `components/ui/form/hooks/` to a Fresco-internal location (final path nailed down in the implementation plan). The hook continues to import the generic form primitives from `@codaco/fresco-ui/form/...` _and_ the Redux selector from `~/lib/interviewer/selectors/forms` as it does today. No reshape of the form's API needed; just a relocation of one file.

After this, `@codaco/fresco-ui/form` is a clean, store-free, protocol-agnostic form library.

## 6. Fresco migration (consumer side)

### 6.1 Codemod rules

| From                                          | To                                                |
| --------------------------------------------- | ------------------------------------------------- |
| `from '~/components/ui/Button'`               | `from '@codaco/fresco-ui/Button'`                 |
| `from '~/components/ui/Modal'`                | `from '@codaco/fresco-ui/Modal'`                  |
| `from '~/components/ui/layout/Surface'`       | `from '@codaco/fresco-ui/layout/Surface'`         |
| `from '~/components/ui/typography/Heading'`   | `from '@codaco/fresco-ui/typography/Heading'`     |
| `from '~/components/ui/form/...'`             | `from '@codaco/fresco-ui/form/...'`               |
| `from '~/components/ui/collection/...'`       | `from '@codaco/fresco-ui/collection/...'`         |
| `from '~/components/ui/dnd/...'`              | `from '@codaco/fresco-ui/dnd/...'`                |
| `from '~/components/ui/dialogs/...'`          | `from '@codaco/fresco-ui/dialogs/...'`            |
| `from '~/utils/cva'`                          | `from '@codaco/fresco-ui/utils/cva'`              |
| `from '~/styles/shared/controlVariants'`      | `from '@codaco/fresco-ui/styles/controlVariants'` |
| `from '~/utils/generatePublicId'`             | `from '@codaco/fresco-ui/utils/generatePublicId'` |
| `from '~/utils/prettify'`                     | `from '@codaco/fresco-ui/utils/prettify'`         |
| `from '~/hooks/useSafeAnimate'`               | `from '@codaco/fresco-ui/hooks/useSafeAnimate'`   |
| `from '~/lib/interviewer/utils/scrollParent'` | `from '@codaco/fresco-ui/utils/scrollParent'`     |

286 importing files. Codemod implemented as a `jscodeshift` script (or `ripgrep`+structured replacements; the patterns are mechanical).

### 6.2 Files relocated within Fresco

- `components/ui/SubmitButton.tsx` → `components/SubmitButton.tsx` (and one-off update of any importer)
- `components/ui/Link.tsx` → `components/Link.tsx`
- `components/ui/form/hooks/useProtocolForm.tsx` → Fresco-internal location TBD in plan
- `components/ui/form/hooks/useProtocolForm.stories.tsx` → moves with the hook

### 6.3 Files deleted from Fresco

After the codemod and verification:

- All of `components/ui/` except the three relocated files
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

Tests for the migrated utilities move with their source into the package; tests Fresco wants to keep stay in `utils/__tests__/`.

### 6.4 Fresco's CSS / Tailwind setup

- Fresco's `styles/globals.css` (or whichever CSS file is the Tailwind v4 entry) gets `@import "@codaco/fresco-ui/styles.css";` near the top.
- If Fresco still has a `tailwind.config.ts` (or any JS-based Tailwind config), it is removed — `@source` directives in CSS replace it. Verify and delete if present.
- `styles/themes/default.css` and `styles/themes/interview.css` stay in Fresco unchanged, applied conditionally by the existing Fresco logic.

### 6.5 Verification gates

Before declaring the Fresco migration complete:

- `pnpm typecheck` clean (Fresco)
- `pnpm lint` clean (Fresco, ESLint)
- `pnpm test` — unit and storybook projects pass (Fresco)
- Fresco's Storybook builds (`pnpm build-storybook`)
- Local `pnpm dev` boots and the dashboard + at least one interview stage render visually unbroken
- `pnpm knip` shows no new unused exports/files
- E2E suite via `./scripts/run-e2e-docker.sh` runs to completion (one round, single-browser; do not run multiple browser suites in parallel locally — they compete for ports 4100+)

## 7. Versioning, publishing, CI

- Existing changesets pipeline at the monorepo root.
- Initial release: `0.1.0-alpha.0` on the `next` npm dist-tag. Pre-1.0 means breaking changes are expected.
- Cut `0.1.0` once all Fresco verification gates pass and the API has stabilised.
- `package.json`: `"publishConfig": { "access": "public" }`, `"private": true` removed, `"prepublishOnly": "pnpm build"`.
- Turbo picks up the new package via existing wildcard config; verify `inputs` cover `*.css`.
- Cutover order — **publish-first:**
  1. Build and publish `@codaco/fresco-ui@0.1.0-alpha.0` from the monorepo (still untouched in Fresco).
  2. Bump Fresco's `package.json` to depend on it; run codemod; delete migrated source from Fresco.
  3. Iterate via `0.1.0-alpha.{1..N}` while Fresco-side issues surface.
  4. Cut `0.1.0` once stable.

This ordering forces validation of the actual published artefact (not a workspace-linked source tree), and keeps the alpha versions off the default dist-tag so other consumers don't pick them up by accident.

## 8. Risks and open items

These don't block design approval — verify or decide during implementation.

1. **Rolldown chunking quality.** Without `preserveModules`, Rolldown's automatic shared-chunk extraction is the unknown. If chunks fragment badly or filenames look wrong, fallbacks: (a) promote shared utilities to standalone entries, (b) set `codeSplitting: false` and accept duplication.
2. **`vite-plugin-dts` × Vite 8 compatibility.** Generally expected to work via Rolldown's Rollup-plugin-API compat, but not officially confirmed. Fallback: `tsc --emitDeclarationOnly` step.
3. **CSS-source pass-through.** Tailwind v4 source CSS (with `@import "tailwindcss"`, `@theme`, `@plugin`, `@source`) must reach `dist/` _unprocessed_. Vite's default CSS pipeline would break this. Solution: small build-step plugin to copy `*.css` from `src/` to `dist/` verbatim. Verify post-build that `dist/styles.css` still has the directives intact.
4. **`@plugin` path resolution.** Paths in `dist/styles.css` must resolve correctly relative to the _built_ layout (`node_modules/@codaco/fresco-ui/dist/styles.css` → `node_modules/@codaco/fresco-ui/dist/styles/plugins/*.js`). Verify when wiring up the build.
5. **Component DOM-context assumptions.** Some components (e.g. `Toast.tsx`) may assume a portal root that exists in Fresco's app shell. Migration is lift-and-shift; if components break for non-Fresco consumers, document setup requirements rather than reshape on the way in.
6. **`useSafeAnimate` hook.** Not yet read in detail; assumed to be a generic motion-safe wrapper. If it touches Fresco-specific state, surface during typecheck and either reshape or leave in Fresco.
7. **Subsystem internal-helper allowlist.** Generated initially from Fresco's current import sites. If post-migration something breaks because an import path isn't in the allowlist, add a one-line allowlist entry.
8. **Phantom `lib/dnd`/`lib/dialogs`/`lib/form`/`lib/collection` git-status entries.** Visible in the session-start git status but the directories don't exist on disk. May indicate an in-flight branch/work that could conflict with this migration. Verify before the implementation plan starts.
9. **Test setup files.** Some subsystem tests may reference Fresco-specific test setup (`vitest.setup.ts`, polyfills). Audit during migration; move what's needed into the package, leave Fresco-specific bits behind.

## 9. Out of scope

- Renaming components for casing consistency (e.g. `badge.tsx` → `Badge.tsx`).
- Adding component-level unit tests where none exist today.
- Migrating other monorepo apps to consume `@codaco/fresco-ui`.
- Migrating `@codaco/tailwind-config/base` to CSS-first.
- Adding Chromatic / visual-regression coverage for the package.
- Reshaping component APIs (e.g. removing Fresco-isms from `Toast`); they ship as-is.
- Replacing the existing `@codaco/ui` package (it stays alongside, untouched).
