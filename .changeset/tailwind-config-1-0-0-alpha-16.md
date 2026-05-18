---
'@codaco/tailwind-config': prerelease
---

Two related fixes that make the scoped interview theme actually paint correctly when `data-theme-interview` is applied to a non-root element. Without these, `bg-background` / `text-text` / etc. on descendants of the wrapper still resolved to the default-theme palette — the alpha.15 scoping work didn't actually take effect at the visible color level.

1. **Switched the `@theme` block to the `inline` modifier.** Tailwind v4's default `@theme` registers typed tokens (colors, lengths) via `@property`, which causes `var()` references in their values to be resolved at _declaration_ time on `:root` — snapshotting the default-theme `--background` value into `--color-background`, and so on. Once the interview theme lives on a non-root wrapper, redeclaring `--background` inside `[data-theme-interview]` had no effect on the `--color-*` indirection that utilities went through. With `@theme inline`, utilities compile to `background-color: var(--background)` directly; the inner `var()` resolves at use-site so the wrapper's override flows through to descendants. Same applies to the type scale (`var(--theme-root-size)`), spacing (`var(--spacing-base)`), and any other token that uses `var()` indirection inside `@theme`.

2. **Elevation plugin uses bare semantic tokens.** `--scoped-bg` and `--scoped-text` now point at `var(--background)` / `var(--text)` etc. instead of going through `var(--color-background)` / `var(--color-text)`. Both forms resolve to the same value at runtime under `@theme inline`, but the bare form matches what Tailwind's standard utilities now emit and decouples the elevation plugin from the `--color-*` indirection altogether.
