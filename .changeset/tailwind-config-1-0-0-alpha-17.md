---
"@codaco/tailwind-config": prerelease
---

Rebase `--spacing-base` from `0.25em` to `calc(0.25 * var(--theme-root-size))` and add parallel `--container-*` tokens (`w-md`, `max-w-2xs`, etc.) that multiply the same root size. This unifies spacing, sizing, and container-width axes so they scale together at theme breakpoints, and eliminates em-compounding across nested font-sizes. `default.css` and `interview.css` each redeclare `--spacing-base` and `--container-*` — `calc` snapshots the inner `var()` at the declaration site, so an inherited value would freeze at `:root` inside themed regions.

`--container-*` is static `em` rather than `calc(N * var(--theme-root-size))`. CSS doesn't allow `var()` inside `@container` conditions, so Tailwind v4 was silently dropping every named container-query variant (`@xs:` … `@7xl:`) — anything using them rendered with no grid template columns at all. Static em values let Tailwind bake the `@container (min-width: Nem)` rules at build time, and em resolves against the styled element's (and the container's) font-size, so `max-w-*` and CQ thresholds still scale per theme via the wrapper's `font-size: var(--theme-root-size)`. The prior `:root` redeclaration in `default.css` and the themed redeclaration in `interview.css` are dropped — both worked around the prior approach's "calc snapshots at declaration site" issue, which no longer applies.

**Caveat:** combining `text-*` and `max-w-*` on the same element now compounds (em resolves against that element's own font-size). Existing usages don't do this — keep the convention.

Indirect `--radius` through a new `--radius-base` token so the bare `rounded` utility keeps a `var()` reference and resolves at use-site instead of snapshotting the default-theme radius at `:root`.

Add a `theme-base` utility (`bg-background`/`text-text`/`publish-colors`/`font-body`) to `fresco/utilities.css`. `<ThemedRegion>` applies it so descendants re-resolve themed values at the themed cascade context; consumer apps can also apply it to `<body>` directly.

Interview theme:

- `--surface-popover` and `--surface-popover-contrast` now point at the regular surface tokens, so popovers inherit the themed dark surface instead of rendering as bright white panels against the navy-taupe background.
- Bump `--theme-root-size` from `1rem` to `1.1rem`, nudging type and spacing slightly larger at the default breakpoint.
