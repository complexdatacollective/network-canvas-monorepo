# Pattern Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a family of seven deterministic SVG pattern generators to `@codaco/art`, each seeded by an input string, plus a new Storybook instance illustrating them.

**Architecture:** A `Pattern/` subtree inside the existing art package. A shared `seed.ts` (xmur3 + mulberry32) seeds a `Rng`. A shared `palette.ts` picks 3 distinct vivid OKLCH colors + a derived tinted background. Each variant has its own file containing a pure renderer `(rng, palette, w, h) => ReactNode` and a thin React component that wraps the renderer in an `<svg>`. A `Pattern` dispatcher routes by variant prop (deriving variant from the seed when absent). Stories live in a new Storybook in `packages/art`.

**Tech Stack:** React 19, TypeScript, Vitest (jsdom), Storybook 10.4 (react-vite), Tailwind 4, Biome.

**Spec:** `docs/superpowers/specs/2026-05-18-pattern-art-design.md`

---

## Phase 1 — Foundation

### Task 1: Types & seeded RNG

**Files:**
- Create: `packages/art/src/Pattern/types.ts`
- Create: `packages/art/src/Pattern/seed.ts`
- Create: `packages/art/src/Pattern/__tests__/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/art/src/Pattern/__tests__/seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextInt, seedToRng } from "../seed";

describe("seedToRng", () => {
  it("returns identical sequences for identical seeds", () => {
    const a = seedToRng("alice");
    const b = seedToRng("alice");
    const sequenceA = Array.from({ length: 10 }, () => a());
    const sequenceB = Array.from({ length: 10 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it("returns floats in [0, 1)", () => {
    const rng = seedToRng("test");
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("produces different first draws for different seeds", () => {
    const a = seedToRng("alice");
    const b = seedToRng("bob");
    expect(a()).not.toEqual(b());
  });

  it("accepts empty string as a deterministic seed", () => {
    const a = seedToRng("");
    const b = seedToRng("");
    expect(a()).toEqual(b());
  });
});

describe("nextInt", () => {
  it("returns integers in [min, max)", () => {
    const rng = seedToRng("range-test");
    for (let i = 0; i < 50; i++) {
      const n = nextInt(rng, 5, 10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThan(10);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/art test -- seed.test.ts`
Expected: FAIL — module not found (`../seed`).

- [ ] **Step 3: Create types module**

Create `packages/art/src/Pattern/types.ts`:

```ts
import type { CSSProperties, ReactNode } from "react";

export type Rng = () => number;

export type Palette = {
  background: string;
  foreground: string;
  accent: string;
  highlight: string;
};

export type Renderer = (rng: Rng, palette: Palette, width: number, height: number) => ReactNode;

export const PATTERN_VARIANTS = [
  "dots",
  "tiles",
  "flow",
  "rings",
  "crosses",
  "squiggles",
  "truchet",
] as const;
export type PatternVariant = (typeof PATTERN_VARIANTS)[number];

export type PatternProps = {
  seed: string;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
};
```

- [ ] **Step 4: Implement seed.ts**

Create `packages/art/src/Pattern/seed.ts`:

```ts
import type { Rng } from "./types";

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
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

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @codaco/art test -- seed.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 6: Lint and typecheck**

Run: `pnpm lint:fix --files packages/art/src/Pattern && pnpm --filter @codaco/art typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/art/src/Pattern/types.ts packages/art/src/Pattern/seed.ts packages/art/src/Pattern/__tests__/seed.test.ts
git commit -m "feat(art): add seeded PRNG and Pattern shared types"
```

---

### Task 2: Palette derivation

**Files:**
- Create: `packages/art/src/Pattern/palette.ts`
- Create: `packages/art/src/Pattern/__tests__/palette.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/art/src/Pattern/__tests__/palette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NC_PALETTE, rngToPalette } from "../palette";
import { seedToRng } from "../seed";

const parseOklch = (s: string) => {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(s);
  if (!m) throw new Error(`Not an oklch string: ${s}`);
  return { l: Number.parseFloat(m[1]), c: Number.parseFloat(m[2]), h: Number.parseFloat(m[3]) };
};

describe("rngToPalette", () => {
  it("returns 3 distinct vivid colors sourced from NC_PALETTE", () => {
    const palette = rngToPalette(seedToRng("alice"));
    const vivid = [palette.foreground, palette.accent, palette.highlight];
    expect(new Set(vivid).size).toBe(3);
    const ncOklch = new Set(NC_PALETTE.map((c) => `oklch(${c.l} ${c.c} ${c.h})`));
    for (const color of vivid) {
      expect(ncOklch.has(color)).toBe(true);
    }
  });

  it("derives a high-lightness, low-chroma background", () => {
    const palette = rngToPalette(seedToRng("alice"));
    const bg = parseOklch(palette.background);
    expect(bg.l).toBeGreaterThanOrEqual(0.9);
    expect(bg.c).toBeLessThanOrEqual(0.05);
  });

  it("produces the same palette for the same seed", () => {
    const a = rngToPalette(seedToRng("alice"));
    const b = rngToPalette(seedToRng("alice"));
    expect(a).toEqual(b);
  });

  it("background hue matches foreground hue", () => {
    const palette = rngToPalette(seedToRng("alice"));
    const bg = parseOklch(palette.background);
    const fg = parseOklch(palette.foreground);
    expect(bg.h).toBeCloseTo(fg.h, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/art test -- palette.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement palette.ts**

Create `packages/art/src/Pattern/palette.ts`:

```ts
import type { Palette, Rng } from "./types";

type NCColor = { name: string; l: number; c: number; h: number };

export const NC_PALETTE: readonly NCColor[] = [
  { name: "neon-coral", l: 0.5733, c: 0.2584, h: 11.57 },
  { name: "mustard", l: 0.81, c: 0.17, h: 86.39 },
  { name: "sea-green", l: 0.7, c: 0.2, h: 171.52 },
  { name: "cyber-grape", l: 0.3, c: 0.09, h: 281 },
  { name: "sea-serpent", l: 0.7383, c: 0.13, h: 217.55 },
  { name: "purple-pizazz", l: 0.6249, c: 0.288, h: 320.46 },
  { name: "paradise-pink", l: 0.6586, c: 0.253, h: 359.2 },
  { name: "cerulean-blue", l: 0.5824, c: 0.229, h: 260.09 },
  { name: "kiwi", l: 0.7436, c: 0.157, h: 137.61 },
  { name: "neon-carrot", l: 0.7487, c: 0.161, h: 62.61 },
  { name: "barbie-pink", l: 0.6182, c: 0.251, h: 359.853 },
  { name: "tomato", l: 0.5599, c: 0.25, h: 23.69 },
] as const;

const toOklch = ({ l, c, h }: NCColor): string => `oklch(${l} ${c} ${h})`;

export function rngToPalette(rng: Rng): Palette {
  const indices = NC_PALETTE.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const fg = NC_PALETTE[indices[0]];
  const accent = NC_PALETTE[indices[1]];
  const highlight = NC_PALETTE[indices[2]];
  const bgChroma = Number((fg.c * 0.18).toFixed(3));
  return {
    foreground: toOklch(fg),
    accent: toOklch(accent),
    highlight: toOklch(highlight),
    background: `oklch(0.94 ${bgChroma} ${fg.h})`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/art test -- palette.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm lint:fix --files packages/art/src/Pattern && pnpm --filter @codaco/art typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/art/src/Pattern/palette.ts packages/art/src/Pattern/__tests__/palette.test.ts
git commit -m "feat(art): derive Pattern palette from seed via OKLCH"
```

---

## Phase 2 — Variants

Each variant task adds: the pure renderer + a React component + a determinism assertion in `__tests__/determinism.test.ts`. The `determinism.test.ts` file is created in Task 3 and grows in subsequent variant tasks. **Tasks 3–9 must run sequentially because they share `determinism.test.ts`.**

### Task 3: Dots variant

**Files:**
- Create: `packages/art/src/Pattern/variants/Dots.tsx`
- Create: `packages/art/src/Pattern/__tests__/determinism.test.ts`
- Modify: `packages/art/package.json` (add react-dom devDep)

- [ ] **Step 1: Write the failing test**

Create `packages/art/src/Pattern/__tests__/determinism.test.ts`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DotsPattern } from "../variants/Dots";

describe("determinism", () => {
  describe("DotsPattern", () => {
    it("produces identical markup on repeat renders with the same seed", () => {
      const a = renderToStaticMarkup(<DotsPattern seed="fixture" width={400} height={250} />);
      const b = renderToStaticMarkup(<DotsPattern seed="fixture" width={400} height={250} />);
      expect(a).toBe(b);
    });

    it("renders an svg with the background rect first", () => {
      const markup = renderToStaticMarkup(<DotsPattern seed="fixture" width={400} height={250} />);
      expect(markup.startsWith("<svg")).toBe(true);
      expect(markup).toContain("<rect");
      expect(markup).toContain("<circle");
    });

    it("matches snapshot for the determinism fixture seed", () => {
      const markup = renderToStaticMarkup(<DotsPattern seed="determinism-fixture" width={400} height={250} />);
      expect(markup).toMatchSnapshot();
    });
  });
});
```

- [ ] **Step 2: Add react-dom devDeps to packages/art/package.json**

Add to `devDependencies` (alphabetical):

```jsonc
"@types/react-dom": "catalog:",
"react-dom": "catalog:",
```

Run: `pnpm install`. Expected: installs cleanly.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`
Expected: FAIL — module not found (`../variants/Dots`).

- [ ] **Step 4: Implement Dots.tsx**

Create `packages/art/src/Pattern/variants/Dots.tsx`:

```tsx
import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderDots: Renderer = (rng, palette, w, h) => {
  const cell = 12 + Math.floor(rng() * 16);
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const colors = [palette.foreground, palette.accent, palette.highlight];
  const circles: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const r = 1 + rng() * (cell * 0.35);
      const cx = col * cell + rng() * cell * 0.25;
      const cy = row * cell + rng() * cell * 0.25;
      const fill = colors[Math.floor(rng() * 3)];
      circles.push(<circle key={`${row}-${col}`} cx={cx} cy={cy} r={r} fill={fill} />);
    }
  }
  return (
    <>
      <rect width={w} height={h} fill={palette.background} />
      {circles}
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
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderDots(rng, palette, width, height)}
    </svg>
  );
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`
Expected: PASS — 3 tests pass (1 new snapshot written).

- [ ] **Step 6: Lint and typecheck**

Run: `pnpm lint:fix --files packages/art/src/Pattern && pnpm --filter @codaco/art typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/art/src/Pattern/variants/Dots.tsx packages/art/src/Pattern/__tests__/determinism.test.ts packages/art/src/Pattern/__tests__/__snapshots__ packages/art/package.json pnpm-lock.yaml
git commit -m "feat(art): add Dots pattern variant"
```

---

### Task 4: Tiles variant

**Files:**
- Create: `packages/art/src/Pattern/variants/Tiles.tsx`
- Modify: `packages/art/src/Pattern/__tests__/determinism.test.ts`

- [ ] **Step 1: Write the failing test**

At the top of `determinism.test.ts`, add the import:

```tsx
import { TilesPattern } from "../variants/Tiles";
```

Inside the outer `describe("determinism", ...)`, append:

```tsx
describe("TilesPattern", () => {
  it("produces identical markup on repeat renders with the same seed", () => {
    const a = renderToStaticMarkup(<TilesPattern seed="fixture" width={400} height={250} />);
    const b = renderToStaticMarkup(<TilesPattern seed="fixture" width={400} height={250} />);
    expect(a).toBe(b);
  });

  it("renders an svg with polygons", () => {
    const markup = renderToStaticMarkup(<TilesPattern seed="fixture" width={400} height={250} />);
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain("<polygon");
  });

  it("matches snapshot for the determinism fixture seed", () => {
    const markup = renderToStaticMarkup(<TilesPattern seed="determinism-fixture" width={400} height={250} />);
    expect(markup).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Tiles.tsx**

Create `packages/art/src/Pattern/variants/Tiles.tsx`:

```tsx
import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderTiles: Renderer = (rng, palette, w, h) => {
  const tile = 28 + Math.floor(rng() * 20);
  const triHeight = (tile * Math.sqrt(3)) / 2;
  const cols = Math.ceil(w / tile) + 2;
  const rows = Math.ceil(h / triHeight) + 2;
  const colors = [palette.foreground, palette.accent, palette.highlight];
  const triangles: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    const y0 = row * triHeight;
    const y1 = y0 + triHeight;
    for (let col = 0; col < cols; col++) {
      const x0 = col * tile - (row % 2 === 0 ? 0 : tile / 2);
      const x1 = x0 + tile;
      const xMid = x0 + tile / 2;
      triangles.push(
        <polygon
          key={`u-${row}-${col}`}
          points={`${x0},${y1} ${x1},${y1} ${xMid},${y0}`}
          fill={colors[Math.floor(rng() * 3)]}
        />,
      );
      const xMidNext = x1 + tile / 2;
      triangles.push(
        <polygon
          key={`d-${row}-${col}`}
          points={`${x1},${y1} ${xMidNext},${y0} ${xMid},${y0}`}
          fill={colors[Math.floor(rng() * 3)]}
        />,
      );
    }
  }
  return (
    <>
      <rect width={w} height={h} fill={palette.background} />
      {triangles}
    </>
  );
};

export const TilesPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
  const rng = useMemo(() => seedToRng(seed), [seed]);
  const palette = useMemo(() => rngToPalette(rng), [rng]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      role="presentation"
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderTiles(rng, palette, width, height)}
    </svg>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint:fix --files packages/art/src/Pattern
pnpm --filter @codaco/art typecheck
git add packages/art/src/Pattern/variants/Tiles.tsx packages/art/src/Pattern/__tests__/determinism.test.ts packages/art/src/Pattern/__tests__/__snapshots__
git commit -m "feat(art): add Tiles pattern variant"
```

---

### Task 5: Flow variant

**Files:**
- Create: `packages/art/src/Pattern/variants/Flow.tsx`
- Modify: `packages/art/src/Pattern/__tests__/determinism.test.ts`

- [ ] **Step 1: Write the failing test**

At the top of `determinism.test.ts`, add:

```tsx
import { FlowPattern } from "../variants/Flow";
```

Inside the outer describe, append:

```tsx
describe("FlowPattern", () => {
  it("produces identical markup on repeat renders with the same seed", () => {
    const a = renderToStaticMarkup(<FlowPattern seed="fixture" width={400} height={250} />);
    const b = renderToStaticMarkup(<FlowPattern seed="fixture" width={400} height={250} />);
    expect(a).toBe(b);
  });

  it("renders an svg with paths", () => {
    const markup = renderToStaticMarkup(<FlowPattern seed="fixture" width={400} height={250} />);
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain("<path");
  });

  it("matches snapshot for the determinism fixture seed", () => {
    const markup = renderToStaticMarkup(<FlowPattern seed="determinism-fixture" width={400} height={250} />);
    expect(markup).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Flow.tsx**

Create `packages/art/src/Pattern/variants/Flow.tsx`:

```tsx
import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderFlow: Renderer = (rng, palette, w, h) => {
  const lineCount = 5 + Math.floor(rng() * 6);
  const colors = [palette.foreground, palette.accent, palette.highlight];
  const stroke = 1.4 + rng() * 2.2;
  const segments = 6;
  const paths: React.ReactNode[] = [];
  for (let i = 0; i < lineCount; i++) {
    const baseY = ((i + 0.5) / lineCount) * h;
    const amp = 6 + rng() * (h / (lineCount * 2));
    const phase = rng() * Math.PI * 2;
    const wavelength = w / (1 + rng() * 2);
    const stepX = w / segments;
    const points: string[] = [`M ${-stepX} ${baseY + Math.sin(phase) * amp}`];
    for (let s = 0; s <= segments + 1; s++) {
      const x = s * stepX;
      const y = baseY + Math.sin(phase + (x / wavelength) * Math.PI * 2) * amp;
      points.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    paths.push(
      <path
        key={i}
        d={points.join(" ")}
        fill="none"
        stroke={colors[i % colors.length]}
        strokeWidth={stroke}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <>
      <rect width={w} height={h} fill={palette.background} />
      {paths}
    </>
  );
};

export const FlowPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
  const rng = useMemo(() => seedToRng(seed), [seed]);
  const palette = useMemo(() => rngToPalette(rng), [rng]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      role="presentation"
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderFlow(rng, palette, width, height)}
    </svg>
  );
};
```

- [ ] **Step 4: Run, lint, commit**

```bash
pnpm --filter @codaco/art test -- determinism.test.ts
pnpm lint:fix --files packages/art/src/Pattern
pnpm --filter @codaco/art typecheck
git add packages/art/src/Pattern/variants/Flow.tsx packages/art/src/Pattern/__tests__/determinism.test.ts packages/art/src/Pattern/__tests__/__snapshots__
git commit -m "feat(art): add Flow pattern variant"
```

Expected: 9 tests pass.

---

### Task 6: Rings variant

**Files:**
- Create: `packages/art/src/Pattern/variants/Rings.tsx`
- Modify: `packages/art/src/Pattern/__tests__/determinism.test.ts`

- [ ] **Step 1: Write the failing test**

At the top of `determinism.test.ts`, add:

```tsx
import { RingsPattern } from "../variants/Rings";
```

Inside the outer describe, append:

```tsx
describe("RingsPattern", () => {
  it("produces identical markup on repeat renders with the same seed", () => {
    const a = renderToStaticMarkup(<RingsPattern seed="fixture" width={400} height={250} />);
    const b = renderToStaticMarkup(<RingsPattern seed="fixture" width={400} height={250} />);
    expect(a).toBe(b);
  });

  it("renders an svg with circles", () => {
    const markup = renderToStaticMarkup(<RingsPattern seed="fixture" width={400} height={250} />);
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain("<circle");
  });

  it("matches snapshot for the determinism fixture seed", () => {
    const markup = renderToStaticMarkup(<RingsPattern seed="determinism-fixture" width={400} height={250} />);
    expect(markup).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Rings.tsx**

Create `packages/art/src/Pattern/variants/Rings.tsx`:

```tsx
import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderRings: Renderer = (rng, palette, w, h) => {
  const centreCount = 3 + Math.floor(rng() * 4);
  const colors = [palette.foreground, palette.accent, palette.highlight];
  const stroke = 1.5 + rng() * 1.5;
  const circles: React.ReactNode[] = [];
  for (let i = 0; i < centreCount; i++) {
    const cx = rng() * w;
    const cy = rng() * h;
    const maxR = 30 + rng() * (Math.min(w, h) * 0.45);
    const ringCount = 3 + Math.floor(rng() * 3);
    const color = colors[Math.floor(rng() * 3)];
    for (let r = 0; r < ringCount; r++) {
      const radius = ((r + 1) / ringCount) * maxR;
      const opacity = 1 - r / ringCount;
      circles.push(
        <circle
          key={`${i}-${r}`}
          cx={cx.toFixed(2)}
          cy={cy.toFixed(2)}
          r={radius.toFixed(2)}
          fill="none"
          stroke={color}
          strokeOpacity={opacity.toFixed(3)}
          strokeWidth={stroke}
        />,
      );
    }
  }
  return (
    <>
      <rect width={w} height={h} fill={palette.background} />
      {circles}
    </>
  );
};

export const RingsPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
  const rng = useMemo(() => seedToRng(seed), [seed]);
  const palette = useMemo(() => rngToPalette(rng), [rng]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      role="presentation"
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderRings(rng, palette, width, height)}
    </svg>
  );
};
```

- [ ] **Step 4: Run, lint, commit**

```bash
pnpm --filter @codaco/art test -- determinism.test.ts
pnpm lint:fix --files packages/art/src/Pattern
pnpm --filter @codaco/art typecheck
git add packages/art/src/Pattern/variants/Rings.tsx packages/art/src/Pattern/__tests__/determinism.test.ts packages/art/src/Pattern/__tests__/__snapshots__
git commit -m "feat(art): add Rings pattern variant"
```

Expected: 12 tests pass.

---

### Task 7: Crosses variant

**Files:**
- Create: `packages/art/src/Pattern/variants/Crosses.tsx`
- Modify: `packages/art/src/Pattern/__tests__/determinism.test.ts`

- [ ] **Step 1: Write the failing test**

At the top of `determinism.test.ts`, add:

```tsx
import { CrossesPattern } from "../variants/Crosses";
```

Inside the outer describe, append:

```tsx
describe("CrossesPattern", () => {
  it("produces identical markup on repeat renders with the same seed", () => {
    const a = renderToStaticMarkup(<CrossesPattern seed="fixture" width={400} height={250} />);
    const b = renderToStaticMarkup(<CrossesPattern seed="fixture" width={400} height={250} />);
    expect(a).toBe(b);
  });

  it("renders an svg with lines", () => {
    const markup = renderToStaticMarkup(<CrossesPattern seed="fixture" width={400} height={250} />);
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain("<line");
  });

  it("matches snapshot for the determinism fixture seed", () => {
    const markup = renderToStaticMarkup(<CrossesPattern seed="determinism-fixture" width={400} height={250} />);
    expect(markup).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run, fail, implement**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`. Expected: FAIL.

Create `packages/art/src/Pattern/variants/Crosses.tsx`:

```tsx
import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderCrosses: Renderer = (rng, palette, w, h) => {
  const cell = 24 + Math.floor(rng() * 16);
  const cross = cell * (0.4 + rng() * 0.2);
  const stroke = 2 + rng() * 1.5;
  const cols = Math.ceil(w / cell) + 2;
  const rows = Math.ceil(h / cell) + 2;
  const colors = [palette.foreground, palette.accent, palette.highlight];
  const lines: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    const yOffset = row * cell;
    const xShift = row % 2 === 0 ? 0 : cell / 2;
    for (let col = 0; col < cols; col++) {
      const cx = col * cell + xShift;
      const cy = yOffset;
      const color = colors[Math.floor(rng() * 3)];
      const half = cross / 2;
      lines.push(
        <line
          key={`h-${row}-${col}`}
          x1={(cx - half).toFixed(2)}
          y1={cy.toFixed(2)}
          x2={(cx + half).toFixed(2)}
          y2={cy.toFixed(2)}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />,
        <line
          key={`v-${row}-${col}`}
          x1={cx.toFixed(2)}
          y1={(cy - half).toFixed(2)}
          x2={cx.toFixed(2)}
          y2={(cy + half).toFixed(2)}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />,
      );
    }
  }
  return (
    <>
      <rect width={w} height={h} fill={palette.background} />
      {lines}
    </>
  );
};

export const CrossesPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
  const rng = useMemo(() => seedToRng(seed), [seed]);
  const palette = useMemo(() => rngToPalette(rng), [rng]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      role="presentation"
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderCrosses(rng, palette, width, height)}
    </svg>
  );
};
```

- [ ] **Step 3: Run, lint, commit**

```bash
pnpm --filter @codaco/art test -- determinism.test.ts
pnpm lint:fix --files packages/art/src/Pattern
pnpm --filter @codaco/art typecheck
git add packages/art/src/Pattern/variants/Crosses.tsx packages/art/src/Pattern/__tests__/determinism.test.ts packages/art/src/Pattern/__tests__/__snapshots__
git commit -m "feat(art): add Crosses pattern variant"
```

Expected: 15 tests pass.

---

### Task 8: Squiggles variant

**Files:**
- Create: `packages/art/src/Pattern/variants/Squiggles.tsx`
- Modify: `packages/art/src/Pattern/__tests__/determinism.test.ts`

- [ ] **Step 1: Write the failing test**

At the top of `determinism.test.ts`, add:

```tsx
import { SquigglesPattern } from "../variants/Squiggles";
```

Inside the outer describe, append:

```tsx
describe("SquigglesPattern", () => {
  it("produces identical markup on repeat renders with the same seed", () => {
    const a = renderToStaticMarkup(<SquigglesPattern seed="fixture" width={400} height={250} />);
    const b = renderToStaticMarkup(<SquigglesPattern seed="fixture" width={400} height={250} />);
    expect(a).toBe(b);
  });

  it("renders an svg with paths", () => {
    const markup = renderToStaticMarkup(<SquigglesPattern seed="fixture" width={400} height={250} />);
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain("<path");
  });

  it("matches snapshot for the determinism fixture seed", () => {
    const markup = renderToStaticMarkup(<SquigglesPattern seed="determinism-fixture" width={400} height={250} />);
    expect(markup).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run, fail, implement**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`. Expected: FAIL.

Create `packages/art/src/Pattern/variants/Squiggles.tsx`:

```tsx
import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderSquiggles: Renderer = (rng, palette, w, h) => {
  const rowCount = 5 + Math.floor(rng() * 5);
  const colors = [palette.foreground, palette.accent, palette.highlight];
  const stroke = 2 + rng() * 2;
  const rowGap = h / rowCount;
  const paths: React.ReactNode[] = [];
  for (let i = 0; i < rowCount; i++) {
    const baseY = (i + 0.5) * rowGap;
    const amp = Math.min(rowGap * 0.45, 6 + rng() * (rowGap * 0.35));
    const wavelength = 30 + rng() * 50;
    const steps = Math.ceil(w / (wavelength / 2)) + 2;
    let direction = rng() > 0.5 ? 1 : -1;
    const d: string[] = [`M ${-wavelength / 2} ${baseY.toFixed(2)}`];
    for (let s = 0; s < steps; s++) {
      const xMid = s * (wavelength / 2) + wavelength / 4;
      const xEnd = (s + 1) * (wavelength / 2);
      const yMid = baseY + direction * amp;
      d.push(`Q ${xMid.toFixed(2)} ${yMid.toFixed(2)}, ${xEnd.toFixed(2)} ${baseY.toFixed(2)}`);
      direction *= -1;
    }
    paths.push(
      <path
        key={i}
        d={d.join(" ")}
        fill="none"
        stroke={colors[i % colors.length]}
        strokeWidth={stroke}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <>
      <rect width={w} height={h} fill={palette.background} />
      {paths}
    </>
  );
};

export const SquigglesPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
  const rng = useMemo(() => seedToRng(seed), [seed]);
  const palette = useMemo(() => rngToPalette(rng), [rng]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      role="presentation"
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderSquiggles(rng, palette, width, height)}
    </svg>
  );
};
```

- [ ] **Step 3: Run, lint, commit**

```bash
pnpm --filter @codaco/art test -- determinism.test.ts
pnpm lint:fix --files packages/art/src/Pattern
pnpm --filter @codaco/art typecheck
git add packages/art/src/Pattern/variants/Squiggles.tsx packages/art/src/Pattern/__tests__/determinism.test.ts packages/art/src/Pattern/__tests__/__snapshots__
git commit -m "feat(art): add Squiggles pattern variant"
```

Expected: 18 tests pass.

---

### Task 9: Truchet variant

**Files:**
- Create: `packages/art/src/Pattern/variants/Truchet.tsx`
- Modify: `packages/art/src/Pattern/__tests__/determinism.test.ts`

- [ ] **Step 1: Write the failing test**

At the top of `determinism.test.ts`, add:

```tsx
import { TruchetPattern } from "../variants/Truchet";
```

Inside the outer describe, append:

```tsx
describe("TruchetPattern", () => {
  it("produces identical markup on repeat renders with the same seed", () => {
    const a = renderToStaticMarkup(<TruchetPattern seed="fixture" width={400} height={250} />);
    const b = renderToStaticMarkup(<TruchetPattern seed="fixture" width={400} height={250} />);
    expect(a).toBe(b);
  });

  it("renders an svg with arc paths", () => {
    const markup = renderToStaticMarkup(<TruchetPattern seed="fixture" width={400} height={250} />);
    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain("<path");
    expect(markup).toContain("A ");
  });

  it("matches snapshot for the determinism fixture seed", () => {
    const markup = renderToStaticMarkup(<TruchetPattern seed="determinism-fixture" width={400} height={250} />);
    expect(markup).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run, fail, implement**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`. Expected: FAIL.

Create `packages/art/src/Pattern/variants/Truchet.tsx`:

```tsx
import { useMemo } from "react";
import { rngToPalette } from "../palette";
import { seedToRng } from "../seed";
import type { PatternProps, Renderer } from "../types";

export const renderTruchet: Renderer = (rng, palette, w, h) => {
  const tile = 24 + Math.floor(rng() * 24);
  const cols = Math.ceil(w / tile) + 1;
  const rows = Math.ceil(h / tile) + 1;
  const stroke = 2 + rng() * 2;
  const colors = [palette.foreground, palette.accent, palette.highlight];
  const paths: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * tile;
      const y = row * tile;
      const rotated = rng() > 0.5;
      const color = colors[Math.floor(rng() * 3)];
      const a = rotated
        ? `M ${x} ${y + tile / 2} A ${tile / 2} ${tile / 2} 0 0 1 ${x + tile / 2} ${y}`
        : `M ${x} ${y + tile / 2} A ${tile / 2} ${tile / 2} 0 0 0 ${x + tile / 2} ${y + tile}`;
      const b = rotated
        ? `M ${x + tile / 2} ${y + tile} A ${tile / 2} ${tile / 2} 0 0 1 ${x + tile} ${y + tile / 2}`
        : `M ${x + tile / 2} ${y} A ${tile / 2} ${tile / 2} 0 0 0 ${x + tile} ${y + tile / 2}`;
      paths.push(
        <path key={`a-${row}-${col}`} d={a} fill="none" stroke={color} strokeWidth={stroke} />,
        <path key={`b-${row}-${col}`} d={b} fill="none" stroke={color} strokeWidth={stroke} />,
      );
    }
  }
  return (
    <>
      <rect width={w} height={h} fill={palette.background} />
      {paths}
    </>
  );
};

export const TruchetPattern = ({ seed, width = 400, height = 250, className, style }: PatternProps) => {
  const rng = useMemo(() => seedToRng(seed), [seed]);
  const palette = useMemo(() => rngToPalette(rng), [rng]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      role="presentation"
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderTruchet(rng, palette, width, height)}
    </svg>
  );
};
```

- [ ] **Step 3: Run, lint, commit**

```bash
pnpm --filter @codaco/art test -- determinism.test.ts
pnpm lint:fix --files packages/art/src/Pattern
pnpm --filter @codaco/art typecheck
git add packages/art/src/Pattern/variants/Truchet.tsx packages/art/src/Pattern/__tests__/determinism.test.ts packages/art/src/Pattern/__tests__/__snapshots__
git commit -m "feat(art): add Truchet pattern variant"
```

Expected: 21 tests pass.

---

## Phase 3 — Dispatcher, exports, smoke test

### Task 10: Pattern dispatcher

**Files:**
- Create: `packages/art/src/Pattern/Pattern.tsx`
- Modify: `packages/art/src/Pattern/__tests__/determinism.test.ts`

- [ ] **Step 1: Write the failing test**

At the top of `determinism.test.ts`, add:

```tsx
import { Pattern } from "../Pattern";
```

Inside the outer describe, append:

```tsx
describe("Pattern dispatcher", () => {
  it("produces identical markup on repeat renders with no variant prop", () => {
    const a = renderToStaticMarkup(<Pattern seed="dispatch-fixture" width={400} height={250} />);
    const b = renderToStaticMarkup(<Pattern seed="dispatch-fixture" width={400} height={250} />);
    expect(a).toBe(b);
  });

  it("renders the explicit variant when provided", () => {
    const markup = renderToStaticMarkup(<Pattern seed="fixture" variant="dots" width={400} height={250} />);
    expect(markup).toContain("<circle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/art test -- determinism.test.ts`
Expected: FAIL — module not found (`../Pattern`).

- [ ] **Step 3: Implement Pattern.tsx**

Create `packages/art/src/Pattern/Pattern.tsx`:

```tsx
import { useMemo } from "react";
import { seedToRng } from "./seed";
import { PATTERN_VARIANTS, type PatternProps, type PatternVariant } from "./types";
import { CrossesPattern } from "./variants/Crosses";
import { DotsPattern } from "./variants/Dots";
import { FlowPattern } from "./variants/Flow";
import { RingsPattern } from "./variants/Rings";
import { SquigglesPattern } from "./variants/Squiggles";
import { TilesPattern } from "./variants/Tiles";
import { TruchetPattern } from "./variants/Truchet";

const componentByVariant = {
  dots: DotsPattern,
  tiles: TilesPattern,
  flow: FlowPattern,
  rings: RingsPattern,
  crosses: CrossesPattern,
  squiggles: SquigglesPattern,
  truchet: TruchetPattern,
} as const;

export const Pattern = ({
  seed,
  variant,
  ...rest
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

- [ ] **Step 4: Run, lint, commit**

```bash
pnpm --filter @codaco/art test -- determinism.test.ts
pnpm lint:fix --files packages/art/src/Pattern
pnpm --filter @codaco/art typecheck
git add packages/art/src/Pattern/Pattern.tsx packages/art/src/Pattern/__tests__/determinism.test.ts
git commit -m "feat(art): add Pattern dispatcher with seed-derived variant"
```

Expected: 23 tests pass.

---

### Task 11: Smoke test sweep

**Files:**
- Create: `packages/art/src/Pattern/__tests__/smoke.test.ts`

- [ ] **Step 1: Write the smoke test**

Create `packages/art/src/Pattern/__tests__/smoke.test.ts`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pattern } from "../Pattern";
import { PATTERN_VARIANTS } from "../types";

describe("smoke", () => {
  it.each(PATTERN_VARIANTS)("variant %s renders 50 sequential seeds without throwing", (variant) => {
    for (let i = 0; i < 50; i++) {
      const markup = renderToStaticMarkup(<Pattern seed={String(i)} variant={variant} width={400} height={250} />);
      expect(markup.length).toBeGreaterThan(50);
      expect(markup.startsWith("<svg")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run, lint, commit**

```bash
pnpm --filter @codaco/art test -- smoke.test.ts
pnpm lint:fix --files packages/art/src/Pattern
pnpm --filter @codaco/art typecheck
git add packages/art/src/Pattern/__tests__/smoke.test.ts
git commit -m "test(art): smoke-test every Pattern variant across 50 seeds"
```

Expected: 7 tests pass.

---

### Task 12: Public exports

**Files:**
- Modify: `packages/art/src/index.ts`

- [ ] **Step 1: Rewrite index.ts**

Replace `packages/art/src/index.ts` contents:

```ts
import BackgroundBlobs from "./BackgroundBlobs/BackgroundBlobs";
import useCanvas from "./BackgroundBlobs/useCanvas";
import { Pattern } from "./Pattern/Pattern";
import type { PatternProps, PatternVariant } from "./Pattern/types";
import { CrossesPattern } from "./Pattern/variants/Crosses";
import { DotsPattern } from "./Pattern/variants/Dots";
import { FlowPattern } from "./Pattern/variants/Flow";
import { RingsPattern } from "./Pattern/variants/Rings";
import { SquigglesPattern } from "./Pattern/variants/Squiggles";
import { TilesPattern } from "./Pattern/variants/Tiles";
import { TruchetPattern } from "./Pattern/variants/Truchet";

export {
  BackgroundBlobs,
  CrossesPattern,
  DotsPattern,
  FlowPattern,
  Pattern,
  RingsPattern,
  SquigglesPattern,
  TilesPattern,
  TruchetPattern,
  useCanvas,
};
export type { PatternProps, PatternVariant };
```

- [ ] **Step 2: Verify package typecheck and tests**

```bash
pnpm --filter @codaco/art typecheck
pnpm --filter @codaco/art test
```

Expected: clean + all tests pass.

- [ ] **Step 3: Lint and commit**

```bash
pnpm lint:fix --files packages/art/src/index.ts
git add packages/art/src/index.ts
git commit -m "feat(art): export Pattern and seven variants"
```

---

## Phase 4 — Storybook

### Task 13: Storybook scaffolding

**Files:**
- Modify: `packages/art/package.json`
- Create: `packages/art/.storybook/main.ts`
- Create: `packages/art/.storybook/preview.tsx`
- Create: `packages/art/.storybook/preview.css`
- Create: `packages/art/.storybook/ProtocolCardMock.tsx`

- [ ] **Step 1: Update packages/art/package.json**

Add to the `scripts` block:

```jsonc
"storybook": "storybook dev -p 6007",
"build-storybook": "storybook build"
```

Add to `devDependencies` (keep alphabetical):

```jsonc
"@codaco/fresco-ui": "workspace:*",
"@storybook/addon-a11y": "^10.4.0",
"@storybook/addon-docs": "^10.4.0",
"@storybook/react-vite": "^10.4.0",
"@tailwindcss/vite": "catalog:",
"storybook": "^10.4.0",
"tailwindcss": "catalog:"
```

Run: `pnpm install`. Expected: installs without error.

- [ ] **Step 2: Create .storybook/main.ts**

Create `packages/art/.storybook/main.ts`:

```ts
import { defineMain } from "@storybook/react-vite/node";
import tailwindcss from "@tailwindcss/vite";

export default defineMain({
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    check: false,
  },
  stories: ["../src/**/*.stories.tsx"],
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    return config;
  },
});
```

- [ ] **Step 3: Create .storybook/preview.css**

Create `packages/art/.storybook/preview.css`:

```css
@import "tailwindcss";
@import "@codaco/fresco-ui/styles.css";

body {
  padding: 1rem;
}
```

- [ ] **Step 4: Create .storybook/preview.tsx**

Create `packages/art/.storybook/preview.tsx`:

```tsx
import addonA11y from "@storybook/addon-a11y";
import addonDocs from "@storybook/addon-docs";
import { definePreview } from "@storybook/react-vite";
import "./preview.css";

export default definePreview({
  addons: [addonDocs(), addonA11y()],
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i } },
  },
});
```

- [ ] **Step 5: Create ProtocolCardMock**

Create `packages/art/.storybook/ProtocolCardMock.tsx`:

```tsx
import type { ReactNode } from "react";

type Props = {
  title: string;
  meta?: string;
  children: ReactNode;
};

export const ProtocolCardMock = ({ title, meta = "Modified May 18, 2026", children }: Props) => (
  <div
    style={{
      width: 320,
      height: 200,
      borderRadius: 12,
      overflow: "hidden",
      position: "relative",
      boxShadow: "0 6px 18px -8px rgba(0,0,0,0.25)",
      background: "#fff",
    }}
  >
    <div style={{ position: "absolute", inset: 0 }}>{children}</div>
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: "12px 16px",
        background: "linear-gradient(to top, rgba(255,255,255,0.97) 50%, rgba(255,255,255,0))",
        color: "#1a1330",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2 }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{meta}</div>
    </div>
  </div>
);
```

- [ ] **Step 6: Verify storybook builds**

Run: `pnpm --filter @codaco/art build-storybook`
Expected: builds without errors. Writes to `packages/art/storybook-static/`.

- [ ] **Step 7: Lint and commit**

```bash
pnpm lint:fix --files packages/art
git add packages/art/package.json packages/art/.storybook pnpm-lock.yaml
git commit -m "feat(art): scaffold Storybook for the art package"
```

---

### Task 14: Dots stories

**Files:**
- Create: `packages/art/src/Pattern/variants/Dots.stories.tsx`

- [ ] **Step 1: Create the story file**

Create `packages/art/src/Pattern/variants/Dots.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { DotsPattern } from "./Dots";

const meta = {
  title: "Patterns/Dots",
  component: DotsPattern,
  tags: ["autodocs"],
  argTypes: {
    seed: { control: "text" },
    width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
  args: {
    seed: "Family Networks 2024",
    width: 400,
    height: 250,
  },
} satisfies Meta<typeof DotsPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <div style={{ width: 400, height: 250 }}>
      <DotsPattern {...args} style={{ width: "100%", height: "100%" }} />
    </div>
  ),
};

export const OnCard: Story = {
  render: (args) => (
    <ProtocolCardMock title={args.seed} meta="Dots variant">
      <DotsPattern {...args} style={{ width: "100%", height: "100%" }} />
    </ProtocolCardMock>
  ),
};
```

- [ ] **Step 2: Build, lint, commit**

```bash
pnpm --filter @codaco/art build-storybook
pnpm lint:fix --files packages/art/src/Pattern/variants/Dots.stories.tsx
git add packages/art/src/Pattern/variants/Dots.stories.tsx
git commit -m "feat(art): add Storybook stories for Dots pattern"
```

---

### Task 15: Tiles stories

**Files:**
- Create: `packages/art/src/Pattern/variants/Tiles.stories.tsx`

- [ ] **Step 1: Create the story file**

Create `packages/art/src/Pattern/variants/Tiles.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { TilesPattern } from "./Tiles";

const meta = {
  title: "Patterns/Tiles",
  component: TilesPattern,
  tags: ["autodocs"],
  argTypes: {
    seed: { control: "text" },
    width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
  args: {
    seed: "Drug Use Among Young Adults",
    width: 400,
    height: 250,
  },
} satisfies Meta<typeof TilesPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <div style={{ width: 400, height: 250 }}>
      <TilesPattern {...args} style={{ width: "100%", height: "100%" }} />
    </div>
  ),
};

export const OnCard: Story = {
  render: (args) => (
    <ProtocolCardMock title={args.seed} meta="Tiles variant">
      <TilesPattern {...args} style={{ width: "100%", height: "100%" }} />
    </ProtocolCardMock>
  ),
};
```

- [ ] **Step 2: Build, lint, commit**

```bash
pnpm --filter @codaco/art build-storybook
pnpm lint:fix --files packages/art/src/Pattern/variants/Tiles.stories.tsx
git add packages/art/src/Pattern/variants/Tiles.stories.tsx
git commit -m "feat(art): add Storybook stories for Tiles pattern"
```

---

### Task 16: Flow stories

**Files:**
- Create: `packages/art/src/Pattern/variants/Flow.stories.tsx`

- [ ] **Step 1: Create the story file**

Create `packages/art/src/Pattern/variants/Flow.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { FlowPattern } from "./Flow";

const meta = {
  title: "Patterns/Flow",
  component: FlowPattern,
  tags: ["autodocs"],
  argTypes: {
    seed: { control: "text" },
    width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
  args: {
    seed: "Migration Pathways",
    width: 400,
    height: 250,
  },
} satisfies Meta<typeof FlowPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <div style={{ width: 400, height: 250 }}>
      <FlowPattern {...args} style={{ width: "100%", height: "100%" }} />
    </div>
  ),
};

export const OnCard: Story = {
  render: (args) => (
    <ProtocolCardMock title={args.seed} meta="Flow variant">
      <FlowPattern {...args} style={{ width: "100%", height: "100%" }} />
    </ProtocolCardMock>
  ),
};
```

- [ ] **Step 2: Build, lint, commit**

```bash
pnpm --filter @codaco/art build-storybook
pnpm lint:fix --files packages/art/src/Pattern/variants/Flow.stories.tsx
git add packages/art/src/Pattern/variants/Flow.stories.tsx
git commit -m "feat(art): add Storybook stories for Flow pattern"
```

---

### Task 17: Rings stories

**Files:**
- Create: `packages/art/src/Pattern/variants/Rings.stories.tsx`

- [ ] **Step 1: Create the story file**

Create `packages/art/src/Pattern/variants/Rings.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { RingsPattern } from "./Rings";

const meta = {
  title: "Patterns/Rings",
  component: RingsPattern,
  tags: ["autodocs"],
  argTypes: {
    seed: { control: "text" },
    width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
  args: {
    seed: "Social Capital Study",
    width: 400,
    height: 250,
  },
} satisfies Meta<typeof RingsPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <div style={{ width: 400, height: 250 }}>
      <RingsPattern {...args} style={{ width: "100%", height: "100%" }} />
    </div>
  ),
};

export const OnCard: Story = {
  render: (args) => (
    <ProtocolCardMock title={args.seed} meta="Rings variant">
      <RingsPattern {...args} style={{ width: "100%", height: "100%" }} />
    </ProtocolCardMock>
  ),
};
```

- [ ] **Step 2: Build, lint, commit**

```bash
pnpm --filter @codaco/art build-storybook
pnpm lint:fix --files packages/art/src/Pattern/variants/Rings.stories.tsx
git add packages/art/src/Pattern/variants/Rings.stories.tsx
git commit -m "feat(art): add Storybook stories for Rings pattern"
```

---

### Task 18: Crosses stories

**Files:**
- Create: `packages/art/src/Pattern/variants/Crosses.stories.tsx`

- [ ] **Step 1: Create the story file**

Create `packages/art/src/Pattern/variants/Crosses.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { CrossesPattern } from "./Crosses";

const meta = {
  title: "Patterns/Crosses",
  component: CrossesPattern,
  tags: ["autodocs"],
  argTypes: {
    seed: { control: "text" },
    width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
  args: {
    seed: "Health Worker Networks",
    width: 400,
    height: 250,
  },
} satisfies Meta<typeof CrossesPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <div style={{ width: 400, height: 250 }}>
      <CrossesPattern {...args} style={{ width: "100%", height: "100%" }} />
    </div>
  ),
};

export const OnCard: Story = {
  render: (args) => (
    <ProtocolCardMock title={args.seed} meta="Crosses variant">
      <CrossesPattern {...args} style={{ width: "100%", height: "100%" }} />
    </ProtocolCardMock>
  ),
};
```

- [ ] **Step 2: Build, lint, commit**

```bash
pnpm --filter @codaco/art build-storybook
pnpm lint:fix --files packages/art/src/Pattern/variants/Crosses.stories.tsx
git add packages/art/src/Pattern/variants/Crosses.stories.tsx
git commit -m "feat(art): add Storybook stories for Crosses pattern"
```

---

### Task 19: Squiggles stories

**Files:**
- Create: `packages/art/src/Pattern/variants/Squiggles.stories.tsx`

- [ ] **Step 1: Create the story file**

Create `packages/art/src/Pattern/variants/Squiggles.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { SquigglesPattern } from "./Squiggles";

const meta = {
  title: "Patterns/Squiggles",
  component: SquigglesPattern,
  tags: ["autodocs"],
  argTypes: {
    seed: { control: "text" },
    width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
  args: {
    seed: "Kinship and Caregiving",
    width: 400,
    height: 250,
  },
} satisfies Meta<typeof SquigglesPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <div style={{ width: 400, height: 250 }}>
      <SquigglesPattern {...args} style={{ width: "100%", height: "100%" }} />
    </div>
  ),
};

export const OnCard: Story = {
  render: (args) => (
    <ProtocolCardMock title={args.seed} meta="Squiggles variant">
      <SquigglesPattern {...args} style={{ width: "100%", height: "100%" }} />
    </ProtocolCardMock>
  ),
};
```

- [ ] **Step 2: Build, lint, commit**

```bash
pnpm --filter @codaco/art build-storybook
pnpm lint:fix --files packages/art/src/Pattern/variants/Squiggles.stories.tsx
git add packages/art/src/Pattern/variants/Squiggles.stories.tsx
git commit -m "feat(art): add Storybook stories for Squiggles pattern"
```

---

### Task 20: Truchet stories

**Files:**
- Create: `packages/art/src/Pattern/variants/Truchet.stories.tsx`

- [ ] **Step 1: Create the story file**

Create `packages/art/src/Pattern/variants/Truchet.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { TruchetPattern } from "./Truchet";

const meta = {
  title: "Patterns/Truchet",
  component: TruchetPattern,
  tags: ["autodocs"],
  argTypes: {
    seed: { control: "text" },
    width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
  args: {
    seed: "Adolescent Friendships",
    width: 400,
    height: 250,
  },
} satisfies Meta<typeof TruchetPattern>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => (
    <div style={{ width: 400, height: 250 }}>
      <TruchetPattern {...args} style={{ width: "100%", height: "100%" }} />
    </div>
  ),
};

export const OnCard: Story = {
  render: (args) => (
    <ProtocolCardMock title={args.seed} meta="Truchet variant">
      <TruchetPattern {...args} style={{ width: "100%", height: "100%" }} />
    </ProtocolCardMock>
  ),
};
```

- [ ] **Step 2: Build, lint, commit**

```bash
pnpm --filter @codaco/art build-storybook
pnpm lint:fix --files packages/art/src/Pattern/variants/Truchet.stories.tsx
git add packages/art/src/Pattern/variants/Truchet.stories.tsx
git commit -m "feat(art): add Storybook stories for Truchet pattern"
```

---

### Task 21: Pattern overview stories

**Files:**
- Create: `packages/art/src/Pattern/Pattern.stories.tsx`

- [ ] **Step 1: Create the overview story file**

Create `packages/art/src/Pattern/Pattern.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { ProtocolCardMock } from "../../.storybook/ProtocolCardMock";
import { Pattern } from "./Pattern";
import { PATTERN_VARIANTS, type PatternVariant } from "./types";

const meta = {
  title: "Patterns/Overview",
  component: Pattern,
  argTypes: {
    seed: { control: "text" },
    variant: { control: "select", options: [undefined, ...PATTERN_VARIANTS] },
    width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
    height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
  },
  args: {
    seed: "Family Networks 2024",
    width: 400,
    height: 250,
  },
} satisfies Meta<typeof Pattern>;

export default meta;
type Story = StoryObj<typeof meta>;

const tileBox: CSSProperties = {
  width: 200,
  height: 125,
  borderRadius: 8,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
};

export const SeedPlayground: Story = {
  render: (args) => (
    <div style={{ width: 400, height: 250 }}>
      <Pattern {...args} style={{ width: "100%", height: "100%" }} />
    </div>
  ),
};

export const AllVariants: Story = {
  args: { seed: "Comparison Seed" },
  render: (args) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 900 }}>
      {PATTERN_VARIANTS.map((variant) => (
        <div key={variant}>
          <div style={tileBox}>
            <Pattern seed={args.seed} variant={variant} style={{ width: "100%", height: "100%" }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>{variant}</div>
        </div>
      ))}
    </div>
  ),
};

const SEED_GRID_SEEDS = [
  "alpha", "beta", "gamma", "delta",
  "epsilon", "zeta", "eta", "theta",
  "iota", "kappa", "lambda", "mu",
] as const;

export const SeedGrid: Story = {
  args: { variant: "dots", seed: "" },
  argTypes: {
    variant: { control: "select", options: PATTERN_VARIANTS },
  },
  render: (args) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 900 }}>
      {SEED_GRID_SEEDS.map((seed) => (
        <div key={seed}>
          <div style={tileBox}>
            <Pattern
              seed={seed}
              variant={(args.variant ?? "dots") as PatternVariant}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <div style={{ fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>{seed}</div>
        </div>
      ))}
    </div>
  ),
};

const PROTOCOL_NAMES = [
  "Family Networks 2024",
  "Drug Use Among Young Adults",
  "Migration Pathways",
  "Social Capital Study",
  "Health Worker Networks",
  "Kinship and Caregiving",
  "Adolescent Friendships",
] as const;

export const OnCardGrid: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, maxWidth: 1080 }}>
      {PROTOCOL_NAMES.map((name) => (
        <ProtocolCardMock key={name} title={name}>
          <Pattern seed={name} style={{ width: "100%", height: "100%" }} />
        </ProtocolCardMock>
      ))}
    </div>
  ),
};
```

- [ ] **Step 2: Build, lint, commit**

```bash
pnpm --filter @codaco/art build-storybook
pnpm lint:fix --files packages/art/src/Pattern/Pattern.stories.tsx
git add packages/art/src/Pattern/Pattern.stories.tsx
git commit -m "feat(art): add overview Storybook stories for Pattern"
```

Expected: build succeeds, story tree includes Patterns/Overview with 4 stories.

---

## Phase 5 — Verification

### Task 22: Final sweep

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck for the whole repo**

Run: `pnpm typecheck`. Expected: clean.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`. Expected: all packages pass; `@codaco/art` reports seed (5) + palette (4) + determinism (~23) + smoke (7) tests passing.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`. Expected: clean.

- [ ] **Step 4: Knip**

Run: `pnpm knip`. Expected: no new warnings inside `packages/art`. Pre-existing warnings elsewhere are out of scope.

- [ ] **Step 5: Storybook build**

Run: `pnpm --filter @codaco/art build-storybook`. Expected: success; output at `packages/art/storybook-static/`. Story tree:
- `Patterns/Overview` (4 stories)
- `Patterns/Dots` through `Patterns/Truchet` (2 stories each)

- [ ] **Step 6: Storybook dev smoke**

Run: `pnpm --filter @codaco/art storybook` in another terminal; verify the server starts on `http://localhost:6007`; kill it.

- [ ] **Step 7: Final commit (only if anything changed)**

```bash
git add -A
git commit -m "chore(art): final verification fixes"
```

If nothing changed, skip.

---

## Notes for implementers

- All Pattern variant renderers consume RNG draws in this fixed order: `rngToPalette` (12 swaps), then per-variant geometry. Don't change the order — doing so would invalidate every snapshot.
- The `::variant` seed suffix in `Pattern.tsx` is intentional. Don't replace it with the main seed and an extra draw, because that would shift palette/geometry for existing seeds when a new variant lands.
- Snapshot files (`__snapshots__/determinism.test.ts.snap`) are committed alongside their tests. Intentional renderer changes regenerate via `pnpm --filter @codaco/art test -- -u`.
- If `pnpm install` complains about peer-dep ranges for Storybook, align to fresco-ui's installed versions.
