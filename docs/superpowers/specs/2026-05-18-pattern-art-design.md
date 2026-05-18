# Deterministic SVG patterns for card backgrounds

Date: 2026-05-18
Package: `@codaco/art`
Status: design

## Goal

Add a family of seven decorative SVG pattern generators to `@codaco/art`. Each pattern is deterministically derived from an arbitrary input string (e.g. a protocol name): the same string always renders the same pattern and the same color palette. Patterns are intended as backgrounds for cards in the Network Canvas UIs, and are illustrated in a new Storybook that lives inside the art package.

Out of scope: animation, server-rendered SVG export, theming hooks, integration with any specific consumer (architect protocol cards etc.).

## High-level shape

```tsx
<Pattern seed="Family Networks 2024" />                   // variant derived from seed
<Pattern seed="Family Networks 2024" variant="dots" />    // explicit variant
<DotsPattern seed="Family Networks 2024" />               // direct variant access
```

Each renders an inline `<svg>` sized to the parent via CSS, containing a solid background rect and a pattern composed of shapes drawn in three accent colors from the Network Canvas palette. All values — palette, geometry, variant (when omitted) — are derived from one PRNG seeded by the input string.

## File layout

```
packages/art/
├── package.json                   ← + storybook devDeps + scripts
├── .storybook/
│   ├── main.ts                    ← mirrors fresco-ui setup
│   ├── preview.tsx
│   └── ProtocolCardMock.tsx       ← story helper, not shipped
└── src/
    ├── BackgroundBlobs/           ← unchanged
    ├── index.ts                   ← + Pattern + 7 named exports
    └── Pattern/
        ├── Pattern.tsx
        ├── Pattern.stories.tsx
        ├── seed.ts
        ├── palette.ts
        ├── types.ts
        ├── variants/
        │   ├── Dots.tsx
        │   ├── Dots.stories.tsx
        │   ├── Tiles.tsx
        │   ├── Tiles.stories.tsx
        │   ├── Flow.tsx
        │   ├── Flow.stories.tsx
        │   ├── Rings.tsx
        │   ├── Rings.stories.tsx
        │   ├── Crosses.tsx
        │   ├── Crosses.stories.tsx
        │   ├── Squiggles.tsx
        │   ├── Squiggles.stories.tsx
        │   ├── Truchet.tsx
        │   └── Truchet.stories.tsx
        └── __tests__/
            ├── seed.test.ts
            ├── palette.test.ts
            ├── determinism.test.ts
            └── smoke.test.ts
```

`src/index.ts` exports `Pattern`, `DotsPattern`, `TilesPattern`, `FlowPattern`, `RingsPattern`, `CrossesPattern`, `SquigglesPattern`, `TruchetPattern`, and the `PatternVariant` type alongside the existing `BackgroundBlobs` and `useCanvas`. Internals (`seedToRng`, `rngToPalette`, individual renderers) are not exported.

## Seed → RNG

`seed.ts`:

```ts
export type Rng = () => number;

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedToRng(seed: string): Rng {
  return mulberry32(xmur3(seed)());
}

export function nextInt(rng: Rng, minInclusive: number, maxExclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxExclusive - minInclusive));
}
```

xmur3 and mulberry32 are short, public-domain, well-distributed enough for visual variation. The same string always produces the same float sequence.

## Palette

`palette.ts` mirrors the 12 vivid Network Canvas colors from `tooling/tailwind/shared/colors.css` as a TypeScript constant, in OKLCH:

```ts
type NCColor = { name: string; l: number; c: number; h: number };

const NC_PALETTE: readonly NCColor[] = [
  { name: "neon-coral",     l: 0.5733, c: 0.2584, h: 11.57 },
  { name: "mustard",        l: 0.81,   c: 0.17,   h: 86.39 },
  { name: "sea-green",      l: 0.7,    c: 0.2,    h: 171.52 },
  { name: "cyber-grape",    l: 0.3,    c: 0.09,   h: 281 },
  { name: "sea-serpent",    l: 0.7383, c: 0.13,   h: 217.55 },
  { name: "purple-pizazz",  l: 0.6249, c: 0.288,  h: 320.46 },
  { name: "paradise-pink",  l: 0.6586, c: 0.253,  h: 359.2 },
  { name: "cerulean-blue",  l: 0.5824, c: 0.229,  h: 260.09 },
  { name: "kiwi",           l: 0.7436, c: 0.157,  h: 137.61 },
  { name: "neon-carrot",    l: 0.7487, c: 0.161,  h: 62.61 },
  { name: "barbie-pink",    l: 0.6182, c: 0.251,  h: 359.853 },
  { name: "tomato",         l: 0.5599, c: 0.25,   h: 23.69 },
] as const;

export type Palette = {
  background: string;
  foreground: string;
  accent: string;
  highlight: string;
};

function toOklch({ l, c, h }: NCColor): string {
  return `oklch(${l} ${c} ${h})`;
}

export function rngToPalette(rng: Rng): Palette {
  // Pick 3 distinct vivid colors from NC_PALETTE without replacement.
  const indices = [...NC_PALETTE.keys()];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const [fg, accent, highlight] = indices.slice(0, 3).map((i) => NC_PALETTE[i]);
  return {
    foreground: toOklch(fg),
    accent: toOklch(accent),
    highlight: toOklch(highlight),
    // Background = high-lightness, low-chroma tint sharing fg's hue.
    background: `oklch(0.94 ${(fg.c * 0.18).toFixed(3)} ${fg.h})`,
  };
}
```

The background's tint shares the foreground hue so the pattern feels chromatically cohesive; high lightness + low chroma guarantees the three vivid colors pop. OKLCH strings let consumers' existing color system (already OKLCH-based in `colors.css`) interoperate cleanly.

## Renderer contract

`types.ts`:

```ts
import type { ReactNode } from "react";

export type Rng = () => number;
export type Palette = { background: string; foreground: string; accent: string; highlight: string };
export type Renderer = (rng: Rng, palette: Palette, width: number, height: number) => ReactNode;

export const PATTERN_VARIANTS = [
  "dots", "tiles", "flow", "rings", "crosses", "squiggles", "truchet",
] as const;
export type PatternVariant = (typeof PATTERN_VARIANTS)[number];

export type PatternProps = {
  seed: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
};
```

Each variant exposes a pure renderer returning the SVG children only (no wrapping `<svg>`), and a React component that constructs the `<svg>` wrapper.

Template for each variant file (e.g. `Dots.tsx`):

```tsx
import { useMemo } from "react";
import { seedToRng } from "../seed";
import { rngToPalette } from "../palette";
import type { PatternProps, Renderer } from "../types";

export const renderDots: Renderer = (rng, palette, w, h) => {
  const cell = 12 + Math.floor(rng() * 16);
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const colors = [palette.foreground, palette.accent, palette.highlight];
  return (
    <>
      <rect width={w} height={h} fill={palette.background} />
      {Array.from({ length: rows * cols }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const r = 1 + rng() * (cell * 0.35);
        const cx = col * cell + rng() * cell * 0.25;
        const cy = row * cell + rng() * cell * 0.25;
        return <circle key={i} cx={cx} cy={cy} r={r} fill={colors[Math.floor(rng() * 3)]} />;
      })}
    </>
  );
};

export const DotsPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
  const rng = useMemo(() => seedToRng(seed), [seed]);
  const palette = useMemo(() => rngToPalette(rng), [rng]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      role="presentation"
    >
      {renderDots(rng, palette, width, height)}
    </svg>
  );
};
```

Notes:
- `preserveAspectRatio="xMidYMid slice"` so the pattern fills any card aspect ratio (cards aren't always 16:10), cropping rather than letterboxing.
- `viewBox` width/height is coordinate space, not pixels — CSS controls rendered size. Default `400×250`.
- `role="presentation"` — patterns are decorative.
- The component's `rng` and `palette` are memoized on `seed`. Because palette draws consume RNG state, the same `rng` instance flows through `renderDots`, so palette draws + geometry draws come from the same sequence — that's intentional: same seed → identical SVG, byte-for-byte.

## Per-variant geometry

| Variant   | Geometry                                                                | Seed-varied parameters                                              |
|-----------|-------------------------------------------------------------------------|---------------------------------------------------------------------|
| Dots      | Grid of circles, one per cell                                           | Cell size (12–28), radius range, color per circle, per-cell jitter   |
| Tiles     | Up/down triangle tessellation                                            | Tile size (28–48), color per triangle                                |
| Flow      | Stacked horizontal sinusoidal `<path>`s                                  | Line count (5–10), stroke width, amplitude per row, phase per row    |
| Rings     | N "epicenters" each emitting concentric stroked circles                  | Centre count (3–6), positions, ring counts, max radius, color        |
| Crosses   | Grid of plus signs, every other row offset                              | Cell size (24–40), cross size, stroke width, color per cross         |
| Squiggles | Rows of sine-wave squiggles using `q`-cubic chains                       | Row count (5–9), wavelength, amplitude (< row gap), stroke, color    |
| Truchet   | Tile grid; each tile is two opposing quarter-circle arcs in 1 of 2 rotations | Tile size (24–48), per-tile rotation, color per arc                 |

All renderers add a 1-cell overdraw at edges (`Math.ceil(w / cell) + 1`) so `slice` cropping never reveals the background through gaps. No shared `<filter>` or `<defs>` — every pattern's SVG is self-contained, so two `<Pattern>`s on the same page never collide.

## Dispatcher

`Pattern.tsx`:

```tsx
import { useMemo } from "react";
import { seedToRng } from "./seed";
import { PATTERN_VARIANTS, type PatternProps, type PatternVariant } from "./types";
import { DotsPattern } from "./variants/Dots";
import { TilesPattern } from "./variants/Tiles";
import { FlowPattern } from "./variants/Flow";
import { RingsPattern } from "./variants/Rings";
import { CrossesPattern } from "./variants/Crosses";
import { SquigglesPattern } from "./variants/Squiggles";
import { TruchetPattern } from "./variants/Truchet";

const componentByVariant = {
  dots: DotsPattern,
  tiles: TilesPattern,
  flow: FlowPattern,
  rings: RingsPattern,
  crosses: CrossesPattern,
  squiggles: SquigglesPattern,
  truchet: TruchetPattern,
};

export const Pattern = ({
  seed, variant, ...rest
}: PatternProps & { variant?: PatternVariant }) => {
  const resolvedVariant = useMemo<PatternVariant>(() => {
    if (variant) return variant;
    const rng = seedToRng(`${seed}::variant`);
    return PATTERN_VARIANTS[Math.floor(rng() * PATTERN_VARIANTS.length)];
  }, [seed, variant]);

  const Component = componentByVariant[resolvedVariant];
  return <Component seed={seed} {...rest} />;
};
```

The `::variant` suffix gives variant selection its own seed channel, so a future 8th variant won't change what `seed="alice"` already looks like (its palette and geometry still come from the original `seedToRng("alice")`).

## Storybook

New Storybook in `packages/art`, mirroring `packages/fresco-ui/.storybook` setup.

`packages/art/.storybook/main.ts`:

```ts
import { defineMain } from "@storybook/react-vite/node";
import tailwindcss from "@tailwindcss/vite";

export default defineMain({
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  typescript: { check: false },
  stories: ["../src/**/*.stories.tsx"],
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    return config;
  },
});
```

`packages/art/package.json` adds:

```jsonc
{
  "scripts": {
    "storybook": "storybook dev -p 6007",
    "build-storybook": "storybook build"
  },
  "devDependencies": {
    "@codaco/fresco-ui": "workspace:*",
    "@storybook/addon-a11y": "^10.4.0",
    "@storybook/addon-docs": "^10.4.0",
    "@storybook/react-vite": "^10.4.0",
    "@tailwindcss/vite": "catalog:",
    "storybook": "^10.4.0",
    "tailwindcss": "catalog:"
  }
}
```

Storybook versions match fresco-ui's existing `^10.4.0`. `@tailwindcss/vite` and `tailwindcss` are catalog references. Port 6007 avoids colliding with fresco-ui's 6006. `turbo.json` already defines a `build-storybook` task globally, so no root-config changes are needed.

`preview.tsx` imports the fresco-ui stylesheet so the on-card stories have access to design-token CSS variables. No theme switcher addon is added — patterns are self-contained (include their own background), so light/dark theming doesn't apply to the pattern itself, only to the card mock.

`.storybook/ProtocolCardMock.tsx` is a single ~30-line helper: a rounded surface with a `<Pattern>` filling its top portion via absolute positioning, and a title + last-modified label sitting on a translucent neutral scrim at the bottom. Not exported from the package.

### Story content

Each variant has one stories file with two stories:

- **Gallery** — pattern at `400×250`, `seed` exposed as a Storybook control.
- **OnCard** — pattern as the background of a `<ProtocolCardMock>`.

`Pattern.stories.tsx` (overview) has four stories:

- **AllVariants** — all 7 variants side-by-side with the same seed. Lets reviewers compare geometry while palette stays constant.
- **SeedGrid** — one variant, 12 seeds in a grid. Verifies visual variety per variant.
- **SeedPlayground** — single `<Pattern>` with `seed` and `variant` (allowing `undefined`) as controls.
- **OnCardGrid** — seven `<ProtocolCardMock>`s with realistic protocol names (`"Family Networks 2024"`, `"Drug Use Among Young Adults"`, etc.) and `<Pattern>` auto-deriving variant per name. The most "real" story.

## Testing

Four small Vitest files in `src/Pattern/__tests__/`. Existing vitest config + jsdom is reused.

`seed.test.ts`:
- `seedToRng("alice")` returns identical first 10 floats on two separate calls.
- Two different seeds produce different first floats (sanity, not statistical).
- Empty-string seed is valid and deterministic.

`palette.test.ts`:
- `rngToPalette(rng)` returns 4 colors; the three vivid ones are distinct OKLCH strings sourced from `NC_PALETTE`.
- Background has `L >= 0.9` and `C <= 0.05` (parse the OKLCH string).
- `rngToPalette(seedToRng("alice"))` is bit-identical across calls.

`determinism.test.ts` uses `renderToStaticMarkup`:
- For each of 7 variants: render twice with `seed="determinism-fixture"` and assert byte-identical markup.
- One markup snapshot per variant. Snapshots will be 5–15 KB each — reviewable in PRs; intentional renderer changes regenerate via `pnpm test -- -u`.
- `<Pattern seed="alice" />` (no variant) resolves to the same variant on repeat calls.

`smoke.test.ts`:
- For each variant, render 50 sequential numeric seeds (`"0"` through `"49"`) at `400×250`. Assert each call returns non-empty markup and does not throw.

No visual regression test — Storybook stories are the visual review surface; snapshot tests cover markup-level regressions.

## Non-goals

- Animation. Each pattern is static. Adding motion later remains possible by layering a Canvas component over the SVG; not part of this work.
- SVG string export / data-URL helper. The renderer returns React children; if export is wanted later, a `renderToString` wrapper is one file.
- Themed (light/dark) variants of the same seed. The pattern's own background is opaque — light/dark only affects content around the card, not the pattern.
- Integration with any specific consumer (architect protocol card etc.). That's downstream work that depends on the consumer's card layout.
