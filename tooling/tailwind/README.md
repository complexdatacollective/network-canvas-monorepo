# @codaco/tailwind-config

Shared Tailwind theme, color palette, and plugins for Fresco and other Codaco apps.

The package ships **two parallel surfaces** for the same design system, because the monorepo is mid-migration from Tailwind v3 to v4:

- **Tailwind v4 (Fresco design system)** — preferred for new code. Distributed as a set of CSS partials built around `@theme`, `@plugin`, and per-theme variable layers.
- **Tailwind v3 presets** — `base.ts`, `fresco.ts`, and `globals.css`, retained for apps and packages that have not yet migrated.

All exports are explicit; the published ones (`publishConfig.exports` in `package.json`) are the public API surface.

## Tailwind v4 surface

The v4 surface ships a single foundation barrel that bundles every theme and plugin. Tailwind v4 cares about `@import` ordering — by self-hosting fonts via `@font-face` (no external Google Fonts `@import url(...)`) the barrel composes safely no matter where consumers place it in their entry stream.

| Export                                                               | Purpose                                                                                                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@codaco/tailwind-config/fresco.css`                                 | Foundation barrel — colors, the `@theme` block, foundational utilities, custom plugins, **all theme variants** (default + interview + studio). The fonts are imported separately; see Fonts below. |
| `@codaco/tailwind-config/fresco/plugins/elevation/elevation`         | Multi-layer realistic shadows (`elevation-low/medium/high`).                                                                                                                                       |
| `@codaco/tailwind-config/fresco/plugins/inset-surface/inset-surface` | Background-color-adaptive inset (pressed-in) shadows.                                                                                                                                              |
| `@codaco/tailwind-config/fresco/plugins/motion-spring`               | Spring-based transition utilities (`spring-short/medium/long`) generated via `motion`.                                                                                                             |

### Consuming from a Tailwind v4 app

`packages/fresco-ui/src/styles.css` is the canonical example. The minimal Fresco entry is:

```css
@import 'tailwindcss';

@import '@codaco/tailwind-config/fresco.css';
```

### Fonts

The font stacks in the themes name three self-hosted faces, and the barrel does not load them. Import their `@font-face` rules from the app's entry module, where the bundler resolves the woff2 files out of the `@fontsource-variable` packages this package depends on:

```ts
import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import '@codaco/tailwind-config/fonts/readex-pro.css';
```

Nunito sets headings and Inclusive Sans sets body text. Readex Pro sets text marked as Arabic: for `lang="ar"` (or a regional form such as `ar-EG`), `fresco/arabic-text.css` adds it to both stacks after the Latin face, and takes it out again for text in another language nested inside. Only its Arabic subset is declared, so Latin text never resolves to it and a browser fetches the file only for a page that shows Arabic. The face has the letters of Arabic itself and not those that Persian, Urdu and other languages add to the script, which is why text in those languages is left whole to a system font. A theme of your own that changes the Latin faces should set `--heading-face` and `--body-face`, which the Arabic stacks are built from.

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

### Helpers for build tools in this repository

Three exports, `theme-colors`, `elevation` and `type-scale`, give build tools the design system's values outside Tailwind. They are TypeScript source for this repository's workspace and are not published: Node will not strip types from a file under `node_modules`, so `publishConfig.exports` leaves them out of the npm package. `tests/published-exports.test.ts` keeps it equal to `exports` less those three.

### Resolving tokens to colours

`@codaco/tailwind-config/theme-colors` turns a theme token into the concrete colour a browser would paint, for build tools that cannot hand the CSS to a browser. `buildScopes()` returns one `Scope` per theme and mode (`default-light`, `default-dark`, and the interview and studio regions); `scope.computed('--primary')` gives the token's CSS with every `var()` substituted, and `toDisplayColor(scope.token('--primary'))` gives it as clipped sRGB. The community forum's Discourse theme (`apps/community-theme`) uses it to write its colour palettes.

### Elevation shadows outside Tailwind

`@codaco/tailwind-config/elevation` exports `elevationShadow(elevation, options?)`, the `box-shadow` value the `elevation-low`, `elevation-medium` and `elevation-high` utilities apply, as plain CSS. The elevation plugin builds its utilities from it, so the two cannot drift. The community forum's Discourse theme writes it into `--nc-elevation-*` tokens for its buttons.

### Type scale outside Tailwind

`@codaco/tailwind-config/type-scale` exports `typeScale()`, every step of the `text-*` scale (`2xs` to `6xl`) read from the `@theme` block in `fresco/theme.css`: its font size, and the line height and letter spacing the utility applies with it. Sizes keep their `var(--theme-root-size)` and `var(--theme-vw, 1vw)` terms, so the consumer declares those. The community forum's Discourse theme sets Discourse's type steps from it.

### Contrast tests

`tests/theme-contrast.test.ts` resolves every colour token in `fresco/themes/*.css` for each theme and mode (with the resolver exported as `@codaco/tailwind-config/theme-colors`), then checks every fill / `-contrast` pair against WCAG 2.2 AA (4.5:1). It also checks that each ratio quoted in a theme comment still matches the colours it was measured on (`tests/recorded-ratios.ts` pairs each quote with its colours). Run it with `pnpm --filter @codaco/tailwind-config test`. Pairs that fall short today are listed, with reasons, in `KNOWN_FAILURES`; the test fails when one is added or starts passing.
