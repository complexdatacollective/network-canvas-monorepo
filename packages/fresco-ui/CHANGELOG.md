# @codaco/fresco-ui

## 2.10.0

### Minor Changes

- New `Accordion` component. Wraps base-ui's accordion primitives behind the fresco-ui surface (`Accordion`, `AccordionItem`, `AccordionHeader`, `AccordionTrigger`, `AccordionPanel`) and registers `./Accordion` in the package exports. Ships with Storybook coverage and uses the new `motionSafeProps` utility to strip motion props when `prefers-reduced-motion` is set.

- New `RadioItem` named export from `./form/fields/RadioGroup`. Pulls the styled radio item (label + animated indicator + base-ui `Radio.Root` + markdown label) out of `RadioGroupField`'s per-option `.map` so it can be reused inside other base-ui `RadioGroup` parents. `RadioGroupField`'s behavior and markup are unchanged.

- `RichSelectGroup` now uses listbox semantics in single-select mode. Selection decouples from focus, `Home`/`End` jump to first/last, and the single-select and multi-select branches are now separate JSX subtrees with static `role`/aria attributes (works around Biome's `useAriaPropsSupportedByRole` ternary-resolution limitation). New `autoFocus` prop. `description` is now optional. Horizontal mode sizes its container to content; `useColumns` is now gated behind an explicit prop instead of being implicit when horizontal. Used by the new Dyad/TieStrengthCensus stages over in `@codaco/interview`.

- `Surface` API simplification — **breaking for consumers passing `elevation`, `bleed`, or `dynamicSpacing`.** Drop those three props; consumers apply `shadow-*` utilities at the call site for elevation, and the spacing scale now resolves to static asymmetric padding (`px-N py-M`) at each tier rather than a mix of compound variants scaled by container queries. Default `spacing` shifts to `'md'` and each tier's `shadow-*` is bumped up one step so the resting depth matches the prior "low" elevation. Fresco-ui's own consumers (`Alert`, `Popover`, `Tooltip`, `DialogPopup`, `Combobox`) are updated; downstream consumers that relied on `elevation`/`dynamicSpacing` need to replace them with `shadow-*` classes and explicit responsive padding.

- `Surface` is now `min-h-0` by default. Surfaces nested in a flex column with a height constraint can now shrink below their content size — fixes a class of "ScrollArea viewport sizes to content instead of overflowing" bugs where the height-constraint chain was broken by flex's default `min-height: auto`. All 25 in-tree usages were audited; none depended on the prior `min-height: auto` behavior.

- `Node`'s `tabIndex` now defaults to `-1` when no `onClick` is provided, so passive nodes drop out of the tab order. Active (clickable) nodes are unaffected.

- Typography: switch `Heading`, `Paragraph`, and the list components to em-based top/bottom margins. After `--spacing-base` became rem-anchored in `@codaco/tailwind-config@1.0.0-alpha.17`, `mb-*` on typography no longer scaled per element, so headings and paragraphs lost their proportional rhythm. Em-based margins fix that without re-introducing em compounding into the global spacing scale. Also drop `h4` from `font-extrabold` to `font-bold` for consistency with the other heading levels, and downsize the `h4 + all-caps` compound to `text-sm` so it reads as a label rather than a heading.

- Theme cascade fixes for components that previously rendered a default-theme value inside `<ThemedRegion theme="interview">`:

  - `Node` selection ring: motion `boxShadow` keyframes now reference `var(--selected)` instead of `var(--color-selected)`, so the cascade picks up the interview override at the animated element. The `--color-*` alias resolves at `:root` and freezes the default-theme value, which was rendering the selection ring yellow inside the interview palette.
  - `Alert` `[--color-link:…]` variant overrides, `Button` `interview:[--component-text:…]` hover override, `Dialog` accent overrides (`[--color-primary:…]` / `[--color-primary-contrast:…]`), and `animate-pulse-glow` keyframes in `theme.css` swap to bare primitive vars for the same reason.

- `PortalContainer` is now a viewport-sized stacking context (`fixed inset-0 isolate z-50 pointer-events-none`), giving portaled popups a real containing block above sibling stage content. Re-enable pointer events on each portaled root via `[&>*]:pointer-events-auto` so dialog backdrops/popups don't inherit `pointer-events: none` from the container and stop accepting clicks.

- DnD drag preview now portals into the themed `PortalContainer` rather than `document.body`, so cloned drag items inherit the surrounding theme cascade.

- `ProgressBar` uses fixed `w-3/h-3` for the bar thickness instead of `calc(0.7 * var(--theme-root-size))`, and gates the `data-complete` pulse-glow animation behind `motion-safe:` so it respects `prefers-reduced-motion`.

- `ResizableFlexPanel` only applies `overflow: hidden` during the collapse transition, restoring it to the prior overflow behavior once the panel is fully open. Previously the panel kept `overflow: hidden` applied at all times, clipping content that should have been visible.

- `Spinner` and the package's Lucide default stroke-width drop from `2.5` to `2` for cleaner glyphs at the new themed sizes.

## 2.9.0

### Minor Changes

- Move `immer` from `peerDependencies` to `dependencies`. Hosts no longer need to declare `immer` themselves; fresco-ui now ships its own resolved version. Internal use is limited to `enableMapSet()` in the form store, and pnpm catalog/overrides keep the version aligned with `@codaco/interview`'s and any transitives (`@reduxjs/toolkit`, `zustand`).

- Drop `--color-` prefixes from a handful of `bg-[--…]` arbitrary values; tailwind-config alpha.16 now exposes the bare semantic tokens via `@theme inline`, and the `--color-*` indirection no longer flows through to scoped themes.

## 2.8.0

### Minor Changes

- `<ThemedRegion theme="interview">` now also applies Tailwind's `scheme-dark` utility (`color-scheme: dark`) on the wrapper. Interview is a dark-only palette, so native UI inside the region — form controls, scrollbars, autofill backgrounds — now matches the themed surface without the consumer having to add `scheme-dark` themselves. Consumers that previously hardcoded `scheme-dark` alongside `<ThemedRegion theme="interview">` can drop it.

## 2.7.0

### Minor Changes

- New `<ThemedRegion>` component and `<PortalContainerProvider>` for declarative theme scoping. All Portal-using components (Modal, Popover, Tooltip, DropdownMenu, Toast, Select, Combobox) now thread a portal container through React context, allowing themed dialogs and popovers to inherit the theme of the closest themed ancestor instead of always portaling into `document.body`. Outside a `<PortalContainerProvider>` the new container prop falls back to Base UI's default (`document.body`), so existing consumers see no behavior change. New exports: `@codaco/fresco-ui/ThemedRegion` (`ThemedRegion`) and `@codaco/fresco-ui/PortalContainer` (`PortalContainerProvider`, `usePortalContainer`).

- Move `@base-ui/react` from `dependencies` to `peerDependencies` (range `^1.4.0`). Previously it shipped as a regular dependency pinned to exact `1.4.0`, which caused dual-install issues when consumers (or sibling peer deps like `@codaco/interview`) wanted a different patch version. Hosts must now declare `@base-ui/react` themselves.

- Move `@codaco/protocol-validation` from `peerDependencies` to `devDependencies`. All usages inside fresco-ui are `import type` only (`Variable`, `StageSubject`, `Codebook`, `AdditionalAttributes` in the form layer's type signatures), so nothing ends up in the runtime bundle. Hosts that consume fresco-ui's form types must declare `@codaco/protocol-validation` themselves; without it, fresco-ui's emitted `.d.ts` files won't typecheck cleanly.

## 2.0.1

### Patch Changes

- 753be39: Order the Google Fonts `@import` before `@import "tailwindcss"` in `styles.css` so the nested `@import url('https://fonts.googleapis.com/...')` lands at the top of the compiled CSS stream — `@tailwindcss/postcss` expanded `tailwindcss` into rules and pushed the url() past them, breaking consumer apps with "@import rules must precede all rules" errors.

  Also: wire `@tailwindcss/vite` into Storybook + Vitest, repair the interview-theme `--warning` color, paint the themed body background and register `interview:` / `dashboard:` variants, and quiet autodocs canvas CSS warnings.

## 2.0.0

### Patch Changes

- c0cc415: Move the canonical Fresco themes (default + interview) into @codaco/tailwind-config.
  The previous default-theme.css was a stripped subset; it's now replaced with the
  full theme including light + dark variants and Inclusive Sans body font.
  The new interview-theme.css adds the interview-mode palette (keyed off
  :root:has([data-interview])).
- Updated dependencies [c0cc415]
  - @codaco/tailwind-config@0.4.0

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
