# @codaco/tailwind-config

## 1.3.0

### Minor Changes

- e9a6522: The new `ui-disabled` and `ui-enabled` variants match both native and ARIA-disabled controls. `Button` uses these variants for availability-dependent styles, so overrides should use forms such as `ui-enabled:hover:…` instead of `hover:enabled:…`.

### Patch Changes

- 3e10128: Keep a category's name visible when the people in it have long names. In the
  Categorise People screen, each category circle summarises who it holds by naming
  the first person in it. A long enough name grew that summary past the circle and
  pushed the category's own name off the top edge, leaving a circle of text with
  nothing saying which category it was.

  The summary now shortens with an ellipsis instead of growing, the count of
  everyone else in the category stays on its own line so it survives the
  shortening, and both the category name and the summary sit inside the circle
  rather than running under its edge. Tapping the category still opens it to show
  everyone in full.

- 469d404: Scope the `focus-styles` transition to the outline properties it animates. `transition-all` captured every property on a `:focus-visible` element, re-tweening each frame of script-driven animations (a node's press scale, a dragged node's position) through a 200ms ease and smearing them visibly behind the input.

## 1.2.2

### Patch Changes

- c5f30fd: Restore the full-size interview type scale on tablets.

  The interview's viewport ramp for `--theme-root-size` rendered below the full
  `1rem` base for every viewport narrower than 1280px — sitting at its `0.9rem`
  floor (14.4px) up to tablet-portrait width and only climbing to 15.7px by iPad
  Pro landscape width — so tablets rendered the participant interview at the
  smallest text sizes in the product, with spacing and touch targets
  (checkboxes, radios) shrinking in lockstep below recommended minimum sizes.
  The ramp is now piecewise: phones keep the dense `0.9rem`-floored curve in
  both orientations, tablets (768–1280px) get the full `1rem` base — matching
  the interview's pre-July size and returning default form controls to the 24px
  WCAG 2.5.8 minimum — and displays at 1280px and above are unchanged.

  The interview theme also gains a 16px font-size floor for text-entry elements
  (text inputs, textareas, selects, and rich-text editors), expressed as
  `max(16px, 1em)` so explicitly larger sizes pass through. iOS Safari zooms the
  page when a focused editable element renders below 16px; with the phone-width
  type scale this made every form field a zoom trigger in browser hosts. Editable
  text in the interview now never renders below 16px at any viewport size. To
  support this, `SegmentedCodeField` now carries its text-size class on the
  segment group wrapper (segment inputs inherit), so the floor preserves its
  `lg`/`xl` sizes; computed sizes are unchanged.

- 8ff0e2d: Participants can now adjust the interview's text size.

  The Shell accepts a new `allowUserScaling` prop. When a host enables it (as
  Interviewer now does), the interview Navigation shows a settings menu with a
  "Text size" control offering 90%–130% of the default size. The chosen size
  scales the whole interview — text, spacing, and touch targets together, with
  every step of the fluid type scale changing by exactly the chosen percentage —
  takes effect immediately with the menu open for live preview, and lasts for
  the current session. The control is fully keyboard operable and announces its
  state to screen readers. Hosts can persist the choice across remounts with the
  optional `initialTextScale`/`onTextScaleChange` props; Interviewer uses them so
  an idle-lock/unlock cycle no longer resets a participant's chosen size.

  The standalone exit button has moved into the same settings menu as an
  "Exit interview" action. Hosts that provide neither an exit handler nor
  `allowUserScaling` render no settings menu.

## 1.2.1

### Patch Changes

- 1a3fe60: Improve node entry and display across interview interfaces. Synthetic `name`
  variables now use realistic personal names whenever their validation rules
  allow it, long labels wrap and truncate without distorting node shapes, and
  Network Composer quick add retains focus after submitting a node. Shared modal,
  form-field, and theme refinements support the updated Architect editing
  experience.

## 1.2.0

### Minor Changes

- 00e16c0: Refine interview typography scaling and unify the type-scale base.

  The shared Fresco theme now uses a single `0.9rem` base for `--theme-root-size`
  across product surfaces, and exposes a new `--theme-root-size-fluid` token — an
  opt-in `clamp()` ramp for presentation surfaces that want type and spacing to
  grow on wide or scaled-up displays. The participant interview adopts the shared
  `0.9rem` base and scales it with a continuous ramp (reaching ~`1rem` at typical
  screen sizes and up to `1.25rem` on large displays), replacing the previous
  three-step ramp. Dense product UI keeps a constant, compact base.

  Also fixes the scroll-to-bottom "ready" detection in scrolling forms
  (`useScrolledToBottom`): it now measures scroll position directly instead of
  relying on a zero-height sentinel's edge intersection, which some browsers
  (notably Firefox) fail to report when the form is scrolled to the exact bottom —
  so the "ready to continue" cue reliably appears.

- 711c77a: Add raised buttons, uppercase text styling, larger heading variants, and the supporting shared type-scale tokens for expressive product pages. Add the accessible Definition tooltip for inline terms, including touch activation.

### Patch Changes

- 0134e88: Reduce the default Fresco theme root scale so shared typography, spacing, and component dimensions render more compactly across consuming applications.

## 1.1.0

### Minor Changes

- 83dddd8: Add a canonical, oklch-derived default dark theme (`[data-theme='dark']`) to the Fresco design system; the previous default dark variant was broken and unused, so apps opting into dark mode now get a working, on-brand dark theme. Does not affect apps that never set `data-theme='dark'` (architect is light-only; interviewer uses the interview theme).
- 452549c: Add a compound `Tabs` component (Base UI-backed vertical tabs: import `Tabs` and `TabsPanel`; the rail is driven by a `tabs` array and renders its own active indicator).

  Add a reusable "glass" control treatment — a new `control-glass` utility and `--control-border-width` token in the Tailwind config — exposed as a Button `glass` variant and a `SegmentedSwitcher` `variant` prop (`'outline'` default, `'glass'` opt-in). `SegmentedSwitcher` now defaults to an outline-button treatment, gains an `xl` size, and has its outer height and active-pill radius harmonised with Button.

  `BaseField`'s inline layout is now driven by a container query rather than a viewport breakpoint, and `Table`'s `bodyScroll` region suppresses overscroll chaining (no rubber-band).

  `InputField` now applies the caller's `className` to the field wrapper only, not to the inner `<input>` — so a background/backdrop passed to the field no longer double-applies onto the input.

### Patch Changes

- c16a1d9: Emit NodeNext-compatible relative module specifiers in generated declaration files so TypeScript consumers can resolve package types without a bundled declaration rollup.
- 179952e: Add canonical localized site navigation and footer components, a shared animated link treatment for anchors, footer links, and link-style buttons, a canonical default text color, plus a shared public-site locale definition for edge routing and translation coverage.
- a37d0a2: Use slate blue for the default theme accent colour.
- 5c269b3: Adjusted the light theme's `--surface-2` colour token to
  `oklch(0.91 0.01 231.77)`.
- ebdd094: Derive default surface colors from the page background and align table headers to the bottom.

## 1.0.2

### Patch Changes

- 8ed4c07: Interview theme: define `--selected-contrast` (the foreground colour for the white `--selected` fill). Previously it inherited the default theme's value (`--accent-contrast`, white in the interview palette), so selected text/icons rendered white-on-white and were invisible.

## 1.0.1

### Patch Changes

- 36d29eb: Bump the global `hr` border opacity from `border-current/5` to
  `border-current/10` so separators read a little stronger against themed
  surfaces.

## 1.0.0

First stable release of `@codaco/tailwind-config`, the shared Tailwind configuration and design tokens for Network Canvas. This promotes the `1.0.0-alpha` development series to a stable `1.0.0` with no further functional changes; see the `1.0.0-alpha.*` entries below for the detailed history.

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
