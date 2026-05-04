# @codaco/tailwind-config

Shared Tailwind theme, color palette, and plugins for Fresco and other Codaco apps.

The package ships **two parallel surfaces** for the same design system, because the monorepo is mid-migration from Tailwind v3 to v4:

- **Tailwind v4 (Fresco design system)** — preferred for new code. Distributed as a set of CSS partials built around `@theme`, `@plugin`, and per-theme variable layers.
- **Tailwind v3 presets** — `base.ts`, `fresco.ts`, and `globals.css`, retained for apps and packages that have not yet migrated.

All exports are explicit; the `exports` field in `package.json` is the public API surface.

## Tailwind v4 surface

The v4 surface is split into small CSS files so consumers can compose them in the right order. Tailwind v4 cares about ordering: `@import url(...)` (Google Fonts) must precede `@import "tailwindcss"`, and the `@theme` block must be loaded before any utilities reference its tokens.

| Export                                                              | Purpose                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/fresco/fonts.css`                          | Google Fonts loader for Nunito (heading) and Inclusive Sans (body). Must be the first `@import`.              |
| `@codaco/tailwind-config/fresco/colors.css`                         | Named-color triplets (oklch L C H) for the Network Canvas palette. Referenced by `theme.css`.                 |
| `@codaco/tailwind-config/fresco/theme.css`                          | The `@theme` block — typography scale, semantic color slots, spacing, breakpoints, radii, shadows, keyframes. |
| `@codaco/tailwind-config/fresco/default-theme.css`                  | Default light + dark semantic variable values that `theme.css` resolves against.                              |
| `@codaco/tailwind-config/fresco/interview-theme.css`                | Alternate palette + typography activated by `[data-interview]` on the document.                               |
| `@codaco/tailwind-config/fresco/plugins/elevation/elevation`        | Multi-layer realistic shadows (`elevation-low/medium/high`).                                                  |
| `@codaco/tailwind-config/fresco/plugins/inset-surface/inset-surface`| Background-color-adaptive inset (pressed-in) shadows.                                                         |
| `@codaco/tailwind-config/fresco/plugins/motion-spring`              | Spring-based transition utilities (`spring-short/medium/long`) generated via `motion`.                        |

### Consuming from a Tailwind v4 app

`packages/fresco-ui/src/styles.css` is the canonical example. The minimal Fresco entry is:

```css
@import "@codaco/tailwind-config/fresco/fonts.css";

@import "tailwindcss";

@import "@codaco/tailwind-config/fresco/colors.css";
@import "@codaco/tailwind-config/fresco/theme.css";
@import "@codaco/tailwind-config/fresco/default-theme.css";

@plugin "@codaco/tailwind-config/fresco/plugins/elevation/elevation";
@plugin "@codaco/tailwind-config/fresco/plugins/inset-surface/inset-surface";
@plugin "@codaco/tailwind-config/fresco/plugins/motion-spring";
```

Optionally layer `interview-theme.css` after `default-theme.css` to enable the `[data-interview]` variant.

### Theming

`theme.css` exposes semantic CSS variables (`--background`, `--primary`, `--surface-*`, `--destructive`, etc.) that resolve against values declared in a theme file. Apps can supply their own theme by re-declaring the same variables inside an `@layer theme` block — see `default-theme.css` and `interview-theme.css` for the full set of slots.

## Tailwind v3 surface

| Export                                | Purpose                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/base`        | Tailwind v3 preset (`Config` object) with shadcn-style HSL semantic colors and container settings.                        |
| `@codaco/tailwind-config/fresco`      | Tailwind v3 preset extending `base` with the Network Canvas palette, font sizes, keyframes, and `tailwindcss-animate`.    |
| `@codaco/tailwind-config/globals.css` | Network Canvas palette as HSL `H S% L%` triplets, plus dark-variant calc fallbacks. Pair with the v3 presets.             |

Used by `packages/ui`, `packages/art`, and `apps/documentation`. New consumers should prefer the v4 surface unless they are explicitly maintaining a v3 codebase.
