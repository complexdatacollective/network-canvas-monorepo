# @codaco/tailwind-config

Shared Tailwind theme, color palette, and plugins for Fresco and other Codaco apps.

The package ships **two parallel surfaces** for the same design system, because the monorepo is mid-migration from Tailwind v3 to v4:

- **Tailwind v4 (Fresco design system)** — preferred for new code. Distributed as a set of CSS partials built around `@theme`, `@plugin`, and per-theme variable layers.
- **Tailwind v3 presets** — `base.ts`, `fresco.ts`, and `globals.css`, retained for apps and packages that have not yet migrated.

All exports are explicit; the `exports` field in `package.json` is the public API surface.

## Tailwind v4 surface

The v4 surface ships a single foundation barrel that bundles every theme, plugin, and font. Tailwind v4 cares about `@import` ordering — by self-hosting fonts via `@font-face` (no external Google Fonts `@import url(...)`) the barrel composes safely no matter where consumers place it in their entry stream.

| Export                                                              | Purpose                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/fresco.css`                                | Foundation barrel — colors, the `@theme` block, foundational utilities, custom plugins, **both theme variants** (default + interview) with self-hosted Nunito + Inclusive Sans fonts. |
| `@codaco/tailwind-config/fresco/plugins/elevation/elevation`        | Multi-layer realistic shadows (`elevation-low/medium/high`).                                                  |
| `@codaco/tailwind-config/fresco/plugins/inset-surface/inset-surface`| Background-color-adaptive inset (pressed-in) shadows.                                                         |
| `@codaco/tailwind-config/fresco/plugins/motion-spring`              | Spring-based transition utilities (`spring-short/medium/long`) generated via `motion`.                        |

### Consuming from a Tailwind v4 app

`packages/fresco-ui/src/styles.css` is the canonical example. The minimal Fresco entry is:

```css
@import "tailwindcss";

@import "@codaco/tailwind-config/fresco.css";
```

The default theme writes its values under `:root`; the interview theme layers overrides under `:root[data-theme-interview]`. `@codaco/interview`'s Shell sets that attribute on `<html>` via a `useLayoutEffect` while it's mounted, so both `1rem` (the type scale's base) and the theme's CSS variables apply document-wide. Both themes ship together in the foundation barrel.

### Theming

The `@theme` block (bundled in `fresco.css`) exposes semantic CSS variables (`--background`, `--primary`, `--surface-*`, `--destructive`, etc.) that resolve against values declared in a theme file. Apps can supply their own theme by re-declaring the same variables inside an `@layer theme` block — see `fresco/themes/default.css` and `fresco/themes/interview.css` (loaded by the barrel) for the full set of slots.

## Tailwind v3 surface

| Export                                | Purpose                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/base`        | Tailwind v3 preset (`Config` object) with shadcn-style HSL semantic colors and container settings.                        |
| `@codaco/tailwind-config/fresco`      | Tailwind v3 preset extending `base` with the Network Canvas palette, font sizes, keyframes, and `tailwindcss-animate`.    |
| `@codaco/tailwind-config/globals.css` | Network Canvas palette as HSL `H S% L%` triplets, plus dark-variant calc fallbacks. Pair with the v3 presets.             |

Used by `packages/ui`, `packages/art`, and `apps/documentation`. New consumers should prefer the v4 surface unless they are explicitly maintaining a v3 codebase.
