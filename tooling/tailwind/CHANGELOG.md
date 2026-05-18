# @codaco/tailwind-config

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
