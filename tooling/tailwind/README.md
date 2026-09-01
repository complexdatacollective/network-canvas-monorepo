# @codaco/tailwind-config

Shared Tailwind theme, color palette, and plugins for Fresco and other Codaco apps.

The package ships **two parallel surfaces** for the same design system, because the monorepo is mid-migration from Tailwind v3 to v4:

- **Tailwind v4 (Fresco design system)** — preferred for new code. Distributed as a set of CSS partials built around `@theme`, `@plugin`, and per-theme variable layers.
- **Tailwind v3 presets** — `base.ts`, `fresco.ts`, and `globals.css`, retained for apps and packages that have not yet migrated.

All exports are explicit; the `exports` field in `package.json` is the public API surface.

## Tailwind v4 surface

The v4 surface ships a single foundation barrel that bundles every theme, plugin, and font. Tailwind v4 cares about `@import` ordering — by self-hosting fonts via `@font-face` (no external Google Fonts `@import url(...)`) the barrel composes safely no matter where consumers place it in their entry stream.

| Export                                                               | Purpose                                                                                                                                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/fresco.css`                                 | Foundation barrel — colors, the `@theme` block, foundational utilities, custom plugins, **all theme variants** (default + interview + studio) with self-hosted Nunito + Inclusive Sans fonts. |
| `@codaco/tailwind-config/fresco/plugins/elevation/elevation`         | Multi-layer realistic shadows (`elevation-low/medium/high`).                                                                                                                                  |
| `@codaco/tailwind-config/fresco/plugins/inset-surface/inset-surface` | Background-color-adaptive inset (pressed-in) shadows.                                                                                                                                         |
| `@codaco/tailwind-config/fresco/plugins/motion-spring`               | Spring-based transition utilities (`spring-short/medium/long`) generated via `motion`.                                                                                                        |

### Consuming from a Tailwind v4 app

`packages/fresco-ui/src/styles.css` is the canonical example. The minimal Fresco entry is:

```css
@import 'tailwindcss';

@import '@codaco/tailwind-config/fresco.css';
```

The default theme writes its values under `:root`; the interview and studio themes layer overrides under `[data-theme-interview]` / `[data-theme-studio]`, which can be placed on any element. The type scale binds to a `--theme-root-size` sentinel that each theme declares (a constant `1rem` in all three themes; the full-screen interview Shell in `@codaco/interview` additionally scopes a fluid viewport ramp of this sentinel — 0.9rem on phones up to a 1.25rem cap on large displays — onto its own subtree). All themes ship together in the foundation barrel; consumers typically wrap interview UI with `<ThemedRegion theme="interview">` from `@codaco/fresco-ui`.

Light and dark: the default and studio themes are light/dark pairs, both keyed off `data-theme='dark'` (the attribute `next-themes` writes with `attribute="data-theme"`). Studio's dark block matches the attribute on the studio region itself **or** on any ancestor, so a studio region inside a dark-mode host switches with the host. Interview is dark-only and ignores the attribute.

### Theming

The `@theme` block (bundled in `fresco.css`) exposes semantic CSS variables (`--background`, `--primary`, `--surface-*`, `--destructive`, etc.) that resolve against values declared in a theme file. Apps can supply their own theme by re-declaring the same variables inside an `@layer theme` block — see `fresco/themes/default.css`, `fresco/themes/interview.css`, and `fresco/themes/studio.css` (all loaded by the barrel) for the full set of slots.

One rule governs every theme file: a `var()` inside a custom property resolves at the element the **declaration** sits on, not at the element that reads it. A derived value left on `:root` (`--surface-2: oklch(from var(--background) …)`) therefore snapshots `:root`'s inputs and cascades that snapshot into a themed region, ignoring the region's overrides. Scoped themes must restate every derived token — including `--spacing-base`, which is why each theme declares it alongside `--theme-root-size`.

## Tailwind v3 surface

| Export                                | Purpose                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/base`        | Tailwind v3 preset (`Config` object) with shadcn-style HSL semantic colors and container settings.                     |
| `@codaco/tailwind-config/fresco`      | Tailwind v3 preset extending `base` with the Network Canvas palette, font sizes, keyframes, and `tailwindcss-animate`. |
| `@codaco/tailwind-config/globals.css` | Network Canvas palette as HSL `H S% L%` triplets, plus dark-variant calc fallbacks. Pair with the v3 presets.          |

Used by `packages/ui`, `packages/art`, and `apps/documentation`. New consumers should prefer the v4 surface unless they are explicitly maintaining a v3 codebase.
