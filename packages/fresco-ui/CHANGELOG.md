# @codaco/fresco-ui

## 1.0.0

### Patch Changes

- f553ba7: Move the Nunito Google Fonts `@import url(...)` out of `default-theme.css` and into a new `@codaco/tailwind-config/fresco/fonts.css`. `fresco-ui`'s `styles.css` now imports it first, so the `@import` lands at the top of the CSS stream — CSS spec requires `@import` to precede all rules except `@charset` / `@layer`. Resolves the "@import rules must precede all rules" warning emitted by Tailwind v4 builds in consumer projects.
- Updated dependencies [f553ba7]
  - @codaco/tailwind-config@0.3.0

## 0.3.0

### Minor Changes

- 3ea5b76: Move `@codaco/tailwind-config` from `dependencies` to `peerDependencies`. Tailwind v4's CSS resolver walks `node_modules/` from the consuming `.css` file's directory upward; pnpm doesn't hoist transitive deps, so the `@plugin` directives in `dist/styles.css` couldn't resolve in consumer projects. As a peer dep, pnpm with `auto-install-peers` (the default) hoists it correctly. Consumers without `auto-install-peers` need to install `@codaco/tailwind-config` themselves.

## 0.2.1

### Patch Changes

- fae569b: Restore `ValidFieldComponent = React.ComponentType<any>`. The narrower `React.ComponentType<FieldValueProps<FieldValue> & InjectedFieldProps>` introduced in 0.2.0 broke consumers that pass narrowly-typed field components (e.g. `InputField` accepts `value: string|number`) — contravariance forced them to handle the entire `FieldValue` union. The `any` is intentional and documented at the type definition.

## 0.2.0

### Minor Changes

- ff40992: Restructure the package's public surface and build setup. The public API is unchanged in behaviour, but several import paths have moved and the Tailwind theme now lives in a separate package.

  Changes:

  - **Tailwind theme moved to `@codaco/tailwind-config`.** The Fresco theme tokens, colour palette, and Tailwind plugins (elevation, inset-surface, motion-spring) are now hosted by `@codaco/tailwind-config` under the `./fresco/*` subpaths. The Nunito font is now loaded from there as well. `@codaco/fresco-ui` re-consumes them internally.
  - **Component file names standardised to PascalCase.** The lowercase files (`badge`, `dropdown-menu`, `popover`, `skeleton`, `table`, `tooltip`) and their corresponding subpath exports have been renamed.
  - **`form/components/` flattened to `form/`.** Field components are now imported one level shallower.
  - **`nuqs` is no longer a peer dependency.** Components that previously read URL state via `nuqs` now expose controlled `value`/`onChange` APIs, so consumers are free to wire up any state source.
  - **Storybook interaction tests.** A Vitest browser-mode project (Playwright + Chromium) now runs the Storybook play functions in CI.
  - **Build internals.** `exports.config.ts` and the build-exports script have been removed — `package.json#exports` is now the single source of truth. Externals are declared inline via regex (replacing `vite-plugin-externalize-deps`). Vite plugins, including `@vitejs/plugin-react` v6, are on their latest releases.

  Migration:

  - `import … from '@codaco/fresco-ui/badge'` → `'@codaco/fresco-ui/Badge'`
  - `import … from '@codaco/fresco-ui/dropdown-menu'` → `'@codaco/fresco-ui/DropdownMenu'`
  - `import … from '@codaco/fresco-ui/popover'` → `'@codaco/fresco-ui/Popover'`
  - `import … from '@codaco/fresco-ui/skeleton'` → `'@codaco/fresco-ui/Skeleton'`
  - `import … from '@codaco/fresco-ui/table'` → `'@codaco/fresco-ui/Table'`
  - `import … from '@codaco/fresco-ui/tooltip'` → `'@codaco/fresco-ui/Tooltip'`
  - `import … from '@codaco/fresco-ui/form/components/<X>'` → `'@codaco/fresco-ui/form/<X>'`
  - Theme/colour CSS imports move from `@codaco/fresco-ui/styles.css` add-ons to `@codaco/tailwind-config/fresco/theme.css` and `@codaco/tailwind-config/fresco/colors.css`.
  - Drop `nuqs` from peer dependencies; pass controlled state into the affected components instead.

### Patch Changes

- Updated dependencies [ead6f9e]
  - @codaco/tailwind-config@0.2.0

## 0.1.1

### Patch Changes

- Port two fixes from Fresco's `next` branch:
  - **Combobox**: control `inputValue` and only honour `input-change` so the user's search query survives item-press. Resets the query on popup close. Workaround for [mui/base-ui#3977](https://github.com/mui/base-ui/issues/3977) / [#4360](https://github.com/mui/base-ui/issues/4360).
  - **PasswordField**: `Omit<..., 'type'>` so consumers can't override the input type and break the password masking.

## 0.1.0

### Minor Changes

- fcfe1aa: Initial release of `@codaco/fresco-ui` — Fresco UI components, styles, and utilities migrated from Fresco's `components/ui/` directory. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems. Pre-1.0; expect breaking changes until the API stabilises.
- Stable initial release. Components, styles, and utilities migrated from Fresco's `components/ui/`. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems.

### Patch Changes

- d678a2a: Expose `./dnd/dnd`, `./form/components/Field/Field`, four form field components (`LikertScale`, `RelativeDatePicker`, `ToggleButtonGroup`, `VisualAnalogScale`), `./form/store/types`, and `./form/utils/ymd`. These are required by Fresco's `useProtocolForm` (relocated to `lib/interviewer/forms/`) and by Fresco code that imported the dnd barrel.
- 5793bf2: Inline the Collection's search Web Worker as a base64 blob URL. The previous build emitted the worker as a separate file at `dist/assets/search.worker-<hash>.js` with an absolute URL that consumers (Next.js, etc.) couldn't resolve. Switching to Vite's `?worker&inline` syntax embeds the worker so it works in any environment.

## 0.1.0-next.2

### Patch Changes

- Inline the Collection's search Web Worker as a base64 blob URL. The previous build emitted the worker as a separate file at `dist/assets/search.worker-<hash>.js` with an absolute URL that consumers (Next.js, etc.) couldn't resolve. Switching to Vite's `?worker&inline` syntax embeds the worker so it works in any environment.

## 0.1.0-next.1

### Patch Changes

- Expose `./dnd/dnd`, `./form/components/Field/Field`, four form field components (`LikertScale`, `RelativeDatePicker`, `ToggleButtonGroup`, `VisualAnalogScale`), `./form/store/types`, and `./form/utils/ymd`. These are required by Fresco's `useProtocolForm` (relocated to `lib/interviewer/forms/`) and by Fresco code that imported the dnd barrel.

## 0.1.0-next.0

### Minor Changes

- fcfe1aa: Initial release of `@codaco/fresco-ui` — Fresco UI components, styles, and utilities migrated from Fresco's `components/ui/` directory. Tailwind v4 CSS-first; ~96 public exports across primitives, layout, typography, dialogs, dnd, collection, and form subsystems. Pre-1.0; expect breaking changes until the API stabilises.
