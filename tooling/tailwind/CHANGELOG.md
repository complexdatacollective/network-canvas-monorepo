# @codaco/tailwind-config

## 1.0.0

### Major Changes

- **Breaking**: 1.0 alpha. Reorganize the package's exports surface.
  - The published tarball now ships only the `fresco/` directory (per the `files` field). All foundation files (colors, theme, utilities, plugins) live there.
  - `./fresco.css` (the public path) maps to `./fresco/fresco.css` (the file). It's the single barrel for colors + theme tokens + utilities + plugins. Replaces individual `@import` directives for each piece.
  - Theme variants live at `./fresco/themes/default.css` and `./fresco/themes/interview.css` (default loads Nunito + Inclusive Sans; interview loads Nunito only).
  - Removed from `exports`: `./fresco/colors.css`, `./fresco/theme.css`, `./fresco/utilities.css`, `./fresco/fonts.css`, `./fresco/default-theme.css`, `./fresco/interview-theme.css`, `./base`, `./globals.css`, the individual `./fresco/plugins/*` paths, and the legacy `./fresco` TypeScript entry. These were either internal implementation details (the foundation pieces) or unused legacy entries.

  Consumers should import:

  ```css
  @import 'tailwindcss';
  @import '@codaco/tailwind-config/fresco.css';
  @import '@codaco/tailwind-config/fresco/themes/default.css'; /* or interview.css */
  ```

### Minor Changes

- Reorganize Fresco design-system CSS exports.
  - **NEW**: `./fresco.css` is now the single foundation entry — bundles colors, theme tokens, utilities, and plugins. Replaces having to import the four pieces individually.
  - **MOVED**: theme variants live in `./fresco/themes/`. Update `./fresco/default-theme.css` → `./fresco/themes/default.css` and `./fresco/interview-theme.css` → `./fresco/themes/interview.css`.
  - **REMOVED**: `./fresco/fonts.css` is gone. Font @imports are inlined into the theme files (Nunito + Inclusive Sans in `default.css`; only Nunito in `interview.css`) since the font set is part of a theme's identity.
  - **REMOVED from exports**: `./fresco/theme.css`, `./fresco/colors.css`, `./fresco/utilities.css`. These are now internal — consume via the `./fresco.css` barrel.

  Bumped to 0.5.0 (pre-1.0 minor for breaking changes).

### Patch Changes

- Add `./fresco/utilities.css` to the package's exports field. The file already shipped, but was missing from `exports`, so consumers (notably `@codaco/fresco-ui@2.1.0`'s compiled CSS) couldn't resolve `@codaco/tailwind-config/fresco/utilities.css` under the `style`/`production`/`import` conditions and storybook builds failed with "is not exported under the conditions".

### Prerelease Changes

- Add a `build` script that compiles the Tailwind plugin TypeScript sources to `.js` siblings via tsc. Wired into `prepublishOnly` so published tarballs always include both source `.ts` and compiled `.js`. Resolves "Unable to load plugin" failures from `eslint-plugin-better-tailwindcss` (whose resolver only knows `.js`/`.cjs`, not `.ts`). Also bundles `@plugin '@tailwindcss/forms'` into the `fresco.css` barrel so consumers don't have to declare it themselves.

- Move `@import "tailwindcss"` into `fresco/fresco.css`. The foundation package now owns the Tailwind v4 runtime entry directly, so any consumer of `@codaco/tailwind-config/fresco.css` gets a complete, runnable Tailwind setup with theme tokens, plugins, fonts, and variants — no second `@import "tailwindcss"` required.

  Restore the `@plugin` directives for `elevation` and `inset-surface` in `fresco/fresco.css`. They had been commented out in earlier alphas: the directive paths resolved to directories rather than files, so Tailwind couldn't load them and the design system's elevation / inset-surface utilities silently dropped out. Each plugin directory now contains an `index.ts` that re-exports the plugin's default, so the directory-based `@plugin "../shared/plugins/elevation"` path resolves to that index entry. `motion-spring` already lived as a flat file at the resolved path and is unaffected.

  Housekeeping: drop a leftover `@utility publish-colors` stub from `utilities.css`; remove an unused `vite` devDep (the package ships source CSS via the `exports` field, no Vite build is wired up); and quote the `url(@fontsource-variable/...)` references in the published font CSS so they parse under strict CSS parsers.

  **Breaking** for consumers that import `@codaco/tailwind-config/fresco.css` _and_ additionally `@import "tailwindcss"` themselves: that combination now loads Tailwind twice. Drop the redundant `@import "tailwindcss"` from your CSS entry.

- Restore the build step that compiles the Tailwind plugin TypeScript sources to `.js` siblings via `tsc`. Wired into `prepublishOnly` so published tarballs always include both the source `.ts` and the compiled `.js` for each plugin file (`shared/plugins/{elevation,inset-surface}/index.js`, `shared/plugins/elevation/{elevation,jwc,utils}.js`, `shared/plugins/inset-surface/inset-surface.js`, `shared/plugins/motion-spring.js`).

  Tailwind itself loads the `.ts` directly via its bundled jiti loader, so this build step is invisible at the design-system layer. The compiled `.js` files exist for tooling that does its own plugin resolution and only knows `.js`/`.cjs` extensions — most notably `eslint-plugin-better-tailwindcss`, which uses `enhanced-resolve` and was failing in consumer projects against `1.0.0-alpha.11` with `Unable to load plugin: ../shared/plugins/elevation` (and the corresponding `inset-surface` and `motion-spring` errors). Without the elevation plugin loading there, the `.publish-colors` utility it registers via `addUtilities` was missing from the lint-time Tailwind context, causing `Cannot apply unknown utility class 'publish-colors'` against the `body { @apply ... publish-colors ... }` rule in `theme.css`.

  This release reinstates the `da6c1fe8` "compile Tailwind plugins to .js for publish" pattern. `tsconfig.build.json` now emits in-place under `shared/plugins/` (instead of a separate `dist/` tree, so the relative `@plugin "../shared/plugins/elevation"` paths in `fresco.css` resolve to a sibling `.js`/`.cjs` extension when consumed from `node_modules`). The emitted artifacts are gitignored; only the npm tarball includes them, regenerated by `prepublishOnly` on every publish.

- Effective fix for the consumer-side `Unable to load plugin: ../shared/plugins/elevation` (and `inset-surface` / `motion-spring`) failures from `eslint-plugin-better-tailwindcss`. The `1.0.0-alpha.12` release intended to ship compiled `.js` siblings via `prepublishOnly: tsc -p tsconfig.build.json`, but `npm publish` honors `.gitignore` when no `.npmignore` is present, and the `shared/plugins/**/*.js` ignore rule was excluding the just-emitted artifacts from the tarball — so alpha-12 shipped `.ts`-only, identical to alpha-11.

  Adds an explicit `"files"` field to `package.json` (`["fresco/**", "shared/**", "tsconfig*.json"]`). The `files` field overrides `.gitignore` for npm-publish purposes, so the compiled plugin `.js` files now land in the tarball alongside their `.ts` siblings:

  ```
  package/shared/plugins/elevation/{elevation,jwc,utils,index}.{ts,js}
  package/shared/plugins/inset-surface/{inset-surface,index}.{ts,js}
  package/shared/plugins/motion-spring.{ts,js}
  ```

  Tailwind itself still loads the `.ts` directly via its bundled jiti loader; the `.js` exists for tooling that does its own plugin resolution and only knows `.js`/`.cjs` extensions (notably `eslint-plugin-better-tailwindcss` / `enhanced-resolve`).

  Also adds a `@codaco/tailwind-config#build` override in the workspace's `turbo.json` so this package's task hashing reflects its actual sources (`shared/plugins/**/*.ts`) and outputs (`shared/plugins/**/*.js`) rather than the generic `src/**` / `dist/**` defaults.

- Move `tailwindcss` from `dependencies` to `peerDependencies`. The package ships only CSS configuration (theme, plugins, color tokens) — the tailwindcss compiler always runs in the consumer's tooling context (`@tailwindcss/vite` or PostCSS), never inside tailwind-config itself. Peer status better reflects that runtime relationship and avoids any chance of duplicate tailwindcss installs if a consumer pins a different version range.

  `@tailwindcss/forms` and the `@fontsource-variable/*` packages remain in `dependencies` because their paths are resolved relative to the CSS files (Tailwind v4's `@plugin` directive and font `url()` references).

  **Breaking** for consumers that previously received `tailwindcss` transitively — they must now declare it themselves. The catalog entry `tailwindcss: ^4.2.4` keeps versions aligned across the workspace.

- Two related fixes that make the scoped interview theme actually paint correctly when `data-theme-interview` is applied to a non-root element. Without these, `bg-background` / `text-text` / etc. on descendants of the wrapper still resolved to the default-theme palette — the alpha.15 scoping work didn't actually take effect at the visible color level.
  1. **Switched the `@theme` block to the `inline` modifier.** Tailwind v4's default `@theme` registers typed tokens (colors, lengths) via `@property`, which causes `var()` references in their values to be resolved at _declaration_ time on `:root` — snapshotting the default-theme `--background` value into `--color-background`, and so on. Once the interview theme lives on a non-root wrapper, redeclaring `--background` inside `[data-theme-interview]` had no effect on the `--color-*` indirection that utilities went through. With `@theme inline`, utilities compile to `background-color: var(--background)` directly; the inner `var()` resolves at use-site so the wrapper's override flows through to descendants. Same applies to the type scale (`var(--theme-root-size)`), spacing (`var(--spacing-base)`), and any other token that uses `var()` indirection inside `@theme`.
  2. **Elevation plugin uses bare semantic tokens.** `--scoped-bg` and `--scoped-text` now point at `var(--background)` / `var(--text)` etc. instead of going through `var(--color-background)` / `var(--color-text)`. Both forms resolve to the same value at runtime under `@theme inline`, but the bare form matches what Tailwind's standard utilities now emit and decouples the elevation plugin from the `--color-*` indirection altogether.

- Rebase `--spacing-base` from `0.25em` to `calc(0.25 * var(--theme-root-size))` and add parallel `--container-*` tokens (`w-md`, `max-w-2xs`, etc.) that multiply the same root size. This unifies spacing, sizing, and container-width axes so they scale together at theme breakpoints, and eliminates em-compounding across nested font-sizes. `default.css` and `interview.css` each redeclare `--spacing-base` and `--container-*` — `calc` snapshots the inner `var()` at the declaration site, so an inherited value would freeze at `:root` inside themed regions.

  `--container-*` is static `em` rather than `calc(N * var(--theme-root-size))`. CSS doesn't allow `var()` inside `@container` conditions, so Tailwind v4 was silently dropping every named container-query variant (`@xs:` … `@7xl:`) — anything using them rendered with no grid template columns at all. Static em values let Tailwind bake the `@container (min-width: Nem)` rules at build time, and em resolves against the styled element's (and the container's) font-size, so `max-w-*` and CQ thresholds still scale per theme via the wrapper's `font-size: var(--theme-root-size)`. The prior `:root` redeclaration in `default.css` and the themed redeclaration in `interview.css` are dropped — both worked around the prior approach's "calc snapshots at declaration site" issue, which no longer applies.

  **Caveat:** combining `text-*` and `max-w-*` on the same element now compounds (em resolves against that element's own font-size). Existing usages don't do this — keep the convention.

  Indirect `--radius` through a new `--radius-base` token so the bare `rounded` utility keeps a `var()` reference and resolves at use-site instead of snapshotting the default-theme radius at `:root`.

  Add a `theme-base` utility (`bg-background`/`text-text`/`publish-colors`/`font-body`) to `fresco/utilities.css`. `<ThemedRegion>` applies it so descendants re-resolve themed values at the themed cascade context; consumer apps can also apply it to `<body>` directly.

  Interview theme:
  - `--surface-popover` and `--surface-popover-contrast` now point at the regular surface tokens, so popovers inherit the themed dark surface instead of rendering as bright white panels against the navy-taupe background.
  - Bump `--theme-root-size` from `1rem` to `1.1rem`, nudging type and spacing slightly larger at the default breakpoint.

- Move the `interview:` and `dashboard:` `@custom-variant` declarations into the `fresco.css` barrel. They were previously in `@codaco/fresco-ui/styles.css`, which forced any host-CSS that wanted to use them (including the interview package's own Storybook and e2e host) to import the fresco-ui CSS entry. With them in the foundation barrel, any consumer that imports `@codaco/tailwind-config/fresco.css` gets the full set of Fresco design-system primitives — utilities, plugins, and these app-scoped variants — in one go.

- Switch the `fresco/theme.css` `@theme` block to `@theme static`. Tailwind v4's default `@theme` only emits theme variables to `:root` when a generated utility class references them — Tailwind inlines them at the use-site otherwise. That breaks any code that uses `var(--color-*)` directly in arbitrary properties (e.g. `[--base:var(--color-node-1)]` in fresco-ui's `Node.tsx`), because the variable is never declared on `:root` and there's no fallback. `static` forces every declared theme variable to `:root` unconditionally, fixing the whole class of "arbitrary CSS-variable reference resolves to nothing" bugs at the design-system layer rather than per-component.

- Drop the `@import '../theme.css' reference;` from `themes/interview.css` and inline the two breakpoint values in its `@media` queries. The reference re-import was needed for `theme(--breakpoint-*)` to resolve, but Tailwind v4's `reference` modifier flips a `@theme` block into reference-only mode globally — that retroactively cancels the `@theme static` :root emission from the earlier non-reference import of `theme.css`, leaving every `--color-*` token undeclared at runtime in any host that loads both themes (e.g. the interview package's Storybook). Hardcoded breakpoints lose single-source-of-truth, but the alternative is a much larger blast radius. The two hardcoded values are kept in sync with `--breakpoint-tablet-landscape-max` (1279px) and `--breakpoint-desktop-lg` (1920px) and a comment cross-references them.

- Self-host Nunito and Inclusive Sans inside `themes/default.css` and `themes/interview.css` (latin subset only) instead of pulling them from Google Fonts via `@import url(https://...)`. The external `@import url(...)` calls cannot be hoisted by Vite/PostCSS once the theme files get inlined into a consumer bundle — the imports end up mid-bundle and violate the CSS spec rule that `@import` must precede every rule besides `@charset`/`@layer`. That broke `@codaco/interview`'s Storybook build with `@import must precede all other statements`. The bundled `@font-face` declarations point at woff2 files in the new `fresco/fonts/` directory, sourced from `@fontsource-variable/nunito` (variable wght 200–1000) and `@fontsource/inclusive-sans` (regular + italic at 400). Total ~64KB of font assets ship with the package.

- Three coordinated changes:
  1. **Type scale is now em-based** instead of rem-based. `--text-*` tokens emit em-relative values, so `text-base` / `text-lg` / etc. inherit ancestor font-size and scale together with em-based spacing utilities (`p-4`, `gap-2`, `size-20`). Inside `[data-theme-interview]` the responsive 16/18/20px font-size override now cascades through every typography utility too — fresco-ui controls (Button, Heading, Node) that previously broke the spacing scale by applying `text-*` no longer pin themselves to the root rem value.
  2. **Both themes now ship inside `fresco.css`.** The `./fresco/themes/default.css` and `./fresco/themes/interview.css` exports have been removed; consumers no longer need to import them separately. The themes don't conflict at runtime — the default writes `:root` values, and the interview theme scopes its overrides to `:root:has([data-theme-interview])`, which only matches when an interview Shell is mounted.
  3. **The interview theme attribute is now `data-theme-interview`** (was `data-interview`). More descriptive, less likely to collide with consumer attributes. The `:root:has(...)` selector and the `interview:` / `dashboard:` `@custom-variant` selectors are updated accordingly. Consumers using `@codaco/interview`'s Shell get this for free; anything that sets the attribute directly must be updated.

  Also fixes the Inclusive Sans variable-weight migration: previous in-branch work pointed both `@font-face` blocks at the wrong files and used an out-of-range weight. Both blocks now use `format('woff2-variations')` and weight range `300 700`.

- Revert the `--text-*` tokens to rem-based values and rescope the interview theme to `:root[data-theme-interview]`.

  The em-based scale shipped in alpha.7 had a known but uncalled-out failure mode: `text-*` utilities compound when nested. A `.text-2xl` inside a container that already applies `.text-xl` evaluated to `1.266 × 1.424 ≈ 1.8×` of the grandparent's font-size instead of the intended `1.424×`, which made prompt text inside Headings (and similar nested patterns) look dramatically larger than intended.

  The fix is to keep the type scale as plain rem (no compounding — every `text-*` resolves against `<html>`'s font-size) and move the responsive font-size override onto `<html>` itself. The interview theme now scopes its block to `:root[data-theme-interview]`, which `@codaco/interview`'s Shell sets via a `useLayoutEffect` while mounted. With the override on `:root`, `1rem` becomes 16/18/20px document-wide and every `text-*` / `p-*` / `gap-*` utility scales together — without compounding.

  Selectors updated:
  - `:root:has([data-theme-interview])` → `:root[data-theme-interview]` for variable assignments
  - `[data-theme-interview]` → `:root[data-theme-interview]` for the responsive font-size override
  - `interview:` / `dashboard:` `@custom-variant` selectors updated to the same `:root[data-theme-interview]` form

- Add the foundational base-layer rules and the global reduced-motion override that previously had to be redeclared by every consumer. They now ship as part of `fresco/utilities.css`, so any package that imports `@codaco/tailwind-config/fresco.css` (transitively or directly) inherits them.
  - `@media (prefers-reduced-motion: reduce)` zeroes `animation-duration`, `animation-delay`, `transition-duration`, and `transition-delay` on `*`/`*::before`/`*::after`. Consumers no longer need their own copy of this media query — `useReducedMotion()` and motion-gated CSS classes are enough on top of this baseline.
  - Universal `border-outline` default on `*`, `::after`, `::before`, `::backdrop`, `::file-selector-button` so unstyled borders pick up the theme outline color instead of Tailwind v4's `currentColor` fallback.
  - `body` defaults: `bg-background text-text publish-colors font-body` plus `position: relative` (a Base UI v26 Safari workaround documented at base-ui.com/react/overview/quick-start#ios-26-safari).
  - Inline-semantic defaults so consumers can use `<strong>`, `<em>`, `<s>`, `<u>`, `<hr>`, and `<kbd>` from rich-text content without restyling each one. `strong` nested inside headings escalates to `font-black tracking-normal`; nested inside `<label>` it gets `font-black tracking-wide`.
  - `.lucide` icons get `stroke-width: 2.5px` for visibility against light surfaces.

  No token, plugin, or theme-variant changes.

- Type scale rewritten to use a `--theme-root-size` sentinel custom property; the interview theme drops the `:root` requirement and binds to `[data-theme-interview]` on any element. Responsive font-sizes now also honor user OS text-zoom (rem-based instead of px-pegged). `interview:` and `dashboard:` `@custom-variant` selectors updated to support nested coexistence — `dashboard:` uses a `:not()` chain so it correctly excludes themed regions and their descendants instead of relying on the broken `:root` negation.

  **Breaking** for any consumer that pinned to `:root[data-theme-interview]` selectors directly. The supported integration is via `<ThemedRegion theme="interview">` from `@codaco/fresco-ui` (or directly setting the attribute on a wrapper element).

- The viewport-width ramp for the `--theme-root-size` type-scale sentinel (1rem → 1.125rem → 1.25rem) now lives on the interview `Shell`'s `<main>` instead of on every `[data-theme-interview]` element. The `[data-theme-interview]` rule in `@codaco/tailwind-config` keeps only the non-responsive base (`--theme-root-size: 1rem` + `font-size`), so only the full-screen interview scales its type with the viewport — other themed regions (app chrome, Storybook wrappers, embedded previews) stay at the base size.

  The mid-tier breakpoint is corrected from a hardcoded `1080px` to the `--breakpoint-laptop` token (`1280px`); the upper tier remains `--breakpoint-desktop-lg` (`1920px`). Between 1080–1279px the interview now renders at the base 1rem instead of 1.125rem.

## 1.0.0-alpha.18

### Prerelease Changes

- Interview theme type-scale: tune the `--theme-root-size` clamp at the `1280×720` and `1366×768` breakpoints so headings/body sizes track the redesigned interview density more accurately.

- New static CategoricalBin grid driven by `data-count` + `@container` queries. The grid template, ragged-row centring (keyed on a `[data-flow-index]` attribute), and per-AR-band column count (different layouts at portrait vs wide aspect ratios) are now fully expressed in CSS — the consumer no longer measures the container in JS and pushes a layout dict down. Adds count-9 intermediate bands with a `clamp()`-based expanded-panel size, and a simplified `:nth-child` strategy for the in-flow slots.

## 1.0.0-alpha.17

### Prerelease Changes

- Rebase `--spacing-base` from `0.25em` to `calc(0.25 * var(--theme-root-size))` and add parallel `--container-*` tokens (`w-md`, `max-w-2xs`, etc.) that multiply the same root size. This unifies spacing, sizing, and container-width axes so they scale together at theme breakpoints, and eliminates em-compounding across nested font-sizes. `default.css` and `interview.css` each redeclare `--spacing-base` and `--container-*` — `calc` snapshots the inner `var()` at the declaration site, so an inherited value would freeze at `:root` inside themed regions.

- `--container-*` is now static `em` rather than `calc(N * var(--theme-root-size))`. CSS doesn't allow `var()` inside `@container` conditions, so Tailwind v4 was silently dropping every named container-query variant (`@xs:` … `@7xl:`) — anything using them rendered with no grid template columns at all. Static em values let Tailwind bake the `@container (min-width: Nem)` rules at build time, and em resolves against the styled element's (and the container's) font-size, so `max-w-*` and CQ thresholds still scale per theme via the wrapper's `font-size: var(--theme-root-size)`. The prior `:root` redeclaration in `default.css` and the themed redeclaration in `interview.css` are dropped — both existed to work around the prior approach's "calc snapshots at declaration site" issue, which no longer applies. **Caveat:** combining `text-*` and `max-w-*` on the same element now compounds (em resolves against that element's font-size). Existing usages don't do this — keep the convention.

- Indirect `--radius` through a new `--radius-base` token so the bare `rounded` utility keeps a `var()` reference and resolves at use-site instead of snapshotting the default-theme radius at `:root`.

- Add a `theme-base` utility (`bg-background`/`text-text`/`publish-colors`/`font-body`) to `fresco/utilities.css`. `<ThemedRegion>` applies it so descendants re-resolve themed values at the themed cascade context; consumer apps can also apply it to `<body>` directly.

- Interview theme palette wired through to popovers: `--surface-popover` and `--surface-popover-contrast` now point at the regular surface tokens, so popovers inherit the themed dark surface instead of rendering as bright white panels against the navy-taupe background.

- Interview theme bumps `--theme-root-size` from `1rem` to `1.1rem`, nudging type and spacing slightly larger at the default breakpoint.

## 1.0.0-alpha.16

### Prerelease Changes

- Two related fixes that make the scoped interview theme actually paint correctly when `data-theme-interview` is applied to a non-root element. Without these, `bg-background` / `text-text` / etc. on descendants of the wrapper still resolved to the default-theme palette — the alpha.15 scoping work didn't actually take effect at the visible color level.
  1. **Switched the `@theme` block to the `inline` modifier.** Tailwind v4's default `@theme` registers typed tokens (colors, lengths) via `@property`, which causes `var()` references in their values to be resolved at _declaration_ time on `:root` — snapshotting the default-theme `--background` value into `--color-background`, and so on. Once the interview theme lives on a non-root wrapper, redeclaring `--background` inside `[data-theme-interview]` had no effect on the `--color-*` indirection that utilities went through. With `@theme inline`, utilities compile to `background-color: var(--background)` directly; the inner `var()` resolves at use-site so the wrapper's override flows through to descendants. Same applies to the type scale (`var(--theme-root-size)`), spacing (`var(--spacing-base)`), and any other token that uses `var()` indirection inside `@theme`.

  2. **Elevation plugin uses bare semantic tokens.** `--scoped-bg` and `--scoped-text` now point at `var(--background)` / `var(--text)` etc. instead of going through `var(--color-background)` / `var(--color-text)`. Both forms resolve to the same value at runtime under `@theme inline`, but the bare form matches what Tailwind's standard utilities now emit and decouples the elevation plugin from the `--color-*` indirection altogether.

## 1.0.0-alpha.15

### Patch Changes

- Add `./fresco/utilities.css` to the package's exports field. The file already shipped, but was missing from `exports`, so consumers (notably `@codaco/fresco-ui@2.1.0`'s compiled CSS) couldn't resolve `@codaco/tailwind-config/fresco/utilities.css` under the `style`/`production`/`import` conditions and storybook builds failed with "is not exported under the conditions".

### Prerelease Changes

- Type scale rewritten to use a `--theme-root-size` sentinel custom property; the interview theme drops the `:root` requirement and binds to `[data-theme-interview]` on any element. Responsive font-sizes now also honor user OS text-zoom (rem-based instead of px-pegged). `interview:` and `dashboard:` `@custom-variant` selectors updated to support nested coexistence — `dashboard:` uses a `:not()` chain so it correctly excludes themed regions and their descendants instead of relying on the broken `:root` negation.

## 0.4.0

### Minor Changes

- c0cc415: Move the canonical Fresco themes (default + interview) into @codaco/tailwind-config.
  The previous default-theme.css was a stripped subset; it's now replaced with the
  full theme including light + dark variants and Inclusive Sans body font.
  The new interview-theme.css adds the interview-mode palette (keyed off
  :root:has([data-interview])).

## 0.3.0

### Minor Changes

- f553ba7: Move the Nunito Google Fonts `@import url(...)` out of `default-theme.css` and into a new `@codaco/tailwind-config/fresco/fonts.css`. `fresco-ui`'s `styles.css` now imports it first, so the `@import` lands at the top of the CSS stream — CSS spec requires `@import` to precede all rules except `@charset` / `@layer`. Resolves the "@import rules must precede all rules" warning emitted by Tailwind v4 builds in consumer projects.

## 0.2.0

### Minor Changes

- ead6f9e: Initial publish to npm. Now consumable by external apps via `@codaco/fresco-ui`'s CSS imports (`@import "@codaco/tailwind-config/fresco/theme.css"`, `@plugin "@codaco/tailwind-config/fresco/plugins/elevation/elevation"`, etc.). Tailwind v4 loads the TypeScript plugin entrypoints directly via its bundled `jiti` loader, so no build step ships compiled JS — the TS sources are published as-is.
