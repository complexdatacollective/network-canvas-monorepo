# @codaco/tailwind-config

Shared Tailwind theme, color palette, and plugins for Fresco and other Codaco apps.

The package ships **two parallel surfaces** for the same design system, because the monorepo is mid-migration from Tailwind v3 to v4:

- **Tailwind v4 (Fresco design system)** — preferred for new code. Distributed as a set of CSS partials built around `@theme`, `@plugin`, and per-theme variable layers.
- **Tailwind v3 presets** — `base.ts`, `fresco.ts`, and `globals.css`, retained for apps and packages that have not yet migrated.

All exports are explicit; the `exports` field in `package.json` is the public API surface.

## Tailwind v4 surface

The v4 surface ships a single foundation barrel plus theme variants. Tailwind v4 cares about ordering: `@import url(...)` (Google Fonts) must precede `@import "tailwindcss"`, and the `@theme` block must be loaded before any utilities reference its tokens. The barrel handles the foundation order internally; theme files load their own font `@import url(...)` at the top, so any theme can be the first `@import` in the host stream.

| Export                                                              | Purpose                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/fresco.css`                                | Foundation barrel — bundles colors, the `@theme` block, foundational utilities, and the three plugins.        |
| `@codaco/tailwind-config/fresco/themes/default.css`                 | Default light + dark semantic variable values, plus Nunito + Inclusive Sans font loading.                     |
| `@codaco/tailwind-config/fresco/themes/interview.css`               | Alternate palette + typography activated by `[data-interview]` on the document, plus Nunito font loading.     |
| `@codaco/tailwind-config/fresco/plugins/elevation/elevation`        | Multi-layer realistic shadows (`elevation-low/medium/high`).                                                  |
| `@codaco/tailwind-config/fresco/plugins/inset-surface/inset-surface`| Background-color-adaptive inset (pressed-in) shadows.                                                         |
| `@codaco/tailwind-config/fresco/plugins/motion-spring`              | Spring-based transition utilities (`spring-short/medium/long`) generated via `motion`.                        |

### Consuming from a Tailwind v4 app

`packages/fresco-ui/src/styles.css` is the canonical example. The minimal Fresco entry is:

```css
@import "@codaco/tailwind-config/fresco/themes/default.css";

@import "tailwindcss";

@import "@codaco/tailwind-config/fresco.css";
```

Optionally layer `themes/interview.css` after `themes/default.css` to enable the `[data-interview]` variant. Themes are mutually exclusive with each other and load their own fonts; the foundation barrel is loaded once at the document root.

### Theming

The `@theme` block (bundled in `fresco.css`) exposes semantic CSS variables (`--background`, `--primary`, `--surface-*`, `--destructive`, etc.) that resolve against values declared in a theme file. Apps can supply their own theme by re-declaring the same variables inside an `@layer theme` block — see `fresco/themes/default.css` and `fresco/themes/interview.css` for the full set of slots.

## Tailwind v3 surface

| Export                                | Purpose                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/base`        | Tailwind v3 preset (`Config` object) with shadcn-style HSL semantic colors and container settings.                        |
| `@codaco/tailwind-config/fresco`      | Tailwind v3 preset extending `base` with the Network Canvas palette, font sizes, keyframes, and `tailwindcss-animate`.    |
| `@codaco/tailwind-config/globals.css` | Network Canvas palette as HSL `H S% L%` triplets, plus dark-variant calc fallbacks. Pair with the v3 presets.             |

Used by `packages/ui`, `packages/art`, and `apps/documentation`. New consumers should prefer the v4 surface unless they are explicitly maintaining a v3 codebase.
