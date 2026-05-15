# CategoricalBin static layout — design

**Date:** 2026-05-12
**Status:** Proposed
**Packages affected:** `@codaco/interview`, `@codaco/tailwind-config`

## Problem

`useCircleLayout` chooses bin grid dimensions by maximising `min(cellW, cellH)` over a JS-measured container, then exposes `cols`/`rows` to a CSS grid. The function is a continuous-input optimisation with sharp transitions between adjacent column counts — for example, with 4 bins at gap=16 and viewport `1920×1080`, the catbin-outer post-drawer-collapse measurement sits ~4 px from the threshold between `2×2` and `1×4`. Any sub-50 px drift in `W` or `H` flips the output.

Drift sources that have, in practice, produced this flip:

- Sibling reflows (Prompts, NodeDrawer) committing on different frames across runs.
- ResizeObserver firing on sub-pixel changes in some browsers but not others.
- Drawer expand/collapse animation hitting low-velocity moments where RO doesn't emit a pixel-change for >120 ms — the settle debounce fires and commits a near-final-but-not-final dimension.
- Firefox vs Chromium box-model rounding.

Five fixes have been layered onto the JS hook (50-px snapping, 120 ms debounce, 64 px minimum, `isReady` gate, `data-cb-layout-pending` e2e wait). Each shrank the failure window without removing it, because all of them attack measurement stability while the root cause is **a discontinuous decision evaluated on a continuous, drift-prone input**.

## Goals

1. Bin grid dimensions are determined statically — never via JS measurement of the container.
2. Drawer expand/collapse never changes which grid is chosen (it can change circle _size_ but not row/column count).
3. The layout responds correctly to both landscape and portrait container orientations.
4. The total number of bins is bounded to ≤ 10 (a constraint of the broader product).
5. Removing `useCircleLayout` removes the measurement-debouncing/pending machinery downstream of it.

## Non-goals

- Optimal cell sizing across every conceivable viewport — the curated grid sacrifices some pixel-perfect packing for determinism and predictability.
- Animated transitions between landscape and portrait modes when the container crosses aspect-ratio 1.
- Support for >10 bins.

## Design

### Architecture

Move the entire grid-shape decision into CSS. The React component sets a single `data-count={n}` attribute on the grid wrapper; everything else is declarative.

- **Orientation:** a CSS `@container catbin (aspect-ratio < 1)` query toggles between two lookup tables. `.catbin-outer` is already a named container of type `size` (`tooling/tailwind/fresco/themes/interview.css:194-197`).
- **Count:** rules keyed on `.catbin-circles[data-count="N"]` set `--cols` and `--rows` custom properties.
- **Ragged rows:** counts 5 and 7 — where the last row has fewer items than the rest and needs to be centered — use a "doubled-column" grid (`--cols` set to `2 × conceptualCols`) with every item spanning 2 grid columns. The first item of the last row is shifted by one grid column via `grid-column-start`, which equates to half a conceptual column — exactly the offset needed to centre 2 items in a 3-wide row, or 3 items in a 4-wide row.

The drawer returns to the document flow as a `shrink-0` flex sibling. Drawer expand/collapse changes `.catbin-outer`'s block size, which:

- Re-evaluates the `@container catbin (aspect-ratio < 1)` query natively — no JS, no debouncing.
- Re-resolves `100cqb`-derived sizes on circles synchronously.
- **Does not** change the `(rows, cols)` lookup, because that's keyed on `data-count` only.

### The lookup tables

Both tables apply the "balanced" shape philosophy: square counts (4, 9) get square grids; counts that don't divide evenly (3, 5, 7) get one extra item on the longer-axis side with the short row/column centred.

**Landscape** (default, `aspect-ratio ≥ 1`):

| count | rows | cols | notes                                  |
| ----: | ---: | ---: | -------------------------------------- |
|     1 |    1 |    1 |                                        |
|     2 |    1 |    2 |                                        |
|     3 |    1 |    3 |                                        |
|     4 |    2 |    2 |                                        |
|     5 |    2 |    3 | row 1: 3 items; row 2: 2 items centred |
|     6 |    2 |    3 |                                        |
|     7 |    2 |    4 | row 1: 4 items; row 2: 3 items centred |
|     8 |    2 |    4 |                                        |
|     9 |    3 |    3 |                                        |
|    10 |    2 |    5 |                                        |

**Portrait** (`aspect-ratio < 1`) — mirror of landscape:

| count | rows | cols | notes                                    |
| ----: | ---: | ---: | ---------------------------------------- |
|     1 |    1 |    1 |                                          |
|     2 |    2 |    1 |                                          |
|     3 |    3 |    1 |                                          |
|     4 |    2 |    2 |                                          |
|     5 |    3 |    2 | rows 1-2: 2 items; row 3: 1 item centred |
|     6 |    3 |    2 |                                          |
|     7 |    4 |    2 | rows 1-3: 2 items; row 4: 1 item centred |
|     8 |    4 |    2 |                                          |
|     9 |    3 |    3 |                                          |
|    10 |    5 |    2 |                                          |

### CSS sketch

Uniform "doubled-column" form for every count keeps the rules regular:

```css
.catbin-circles {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: 1rem;
  place-items: center;
}

.catbin-circles > * {
  grid-column: span 2;
  width: min(100%, calc((100cqb - 1rem * (var(--rows) - 1)) / var(--rows)));
  aspect-ratio: 1 / 1;
}

/* Landscape lookup (default) */
.catbin-circles[data-count='1'] {
  --cols: 2;
  --rows: 1;
}
.catbin-circles[data-count='2'] {
  --cols: 4;
  --rows: 1;
}
.catbin-circles[data-count='3'] {
  --cols: 6;
  --rows: 1;
}
.catbin-circles[data-count='4'] {
  --cols: 4;
  --rows: 2;
}
.catbin-circles[data-count='5'] {
  --cols: 6;
  --rows: 2;
}
.catbin-circles[data-count='5'] > :nth-child(4) {
  grid-column-start: 2;
}
.catbin-circles[data-count='6'] {
  --cols: 6;
  --rows: 2;
}
.catbin-circles[data-count='7'] {
  --cols: 8;
  --rows: 2;
}
.catbin-circles[data-count='7'] > :nth-child(5) {
  grid-column-start: 2;
}
.catbin-circles[data-count='8'] {
  --cols: 8;
  --rows: 2;
}
.catbin-circles[data-count='9'] {
  --cols: 6;
  --rows: 3;
}
.catbin-circles[data-count='10'] {
  --cols: 10;
  --rows: 2;
}

/* Portrait override */
@container catbin (aspect-ratio < 1) {
  .catbin-circles[data-count='2'] {
    --cols: 2;
    --rows: 2;
  }
  .catbin-circles[data-count='3'] {
    --cols: 2;
    --rows: 3;
  }
  .catbin-circles[data-count='5'] {
    --cols: 4;
    --rows: 3;
  }
  .catbin-circles[data-count='5'] > :nth-child(4) {
    grid-column-start: auto;
  }
  .catbin-circles[data-count='5'] > :nth-child(5) {
    grid-column-start: 2;
  }
  .catbin-circles[data-count='6'] {
    --cols: 4;
    --rows: 3;
  }
  .catbin-circles[data-count='7'] {
    --cols: 4;
    --rows: 4;
  }
  .catbin-circles[data-count='7'] > :nth-child(5) {
    grid-column-start: auto;
  }
  .catbin-circles[data-count='7'] > :nth-child(7) {
    grid-column-start: 2;
  }
  .catbin-circles[data-count='8'] {
    --cols: 4;
    --rows: 4;
  }
  .catbin-circles[data-count='10'] {
    --cols: 4;
    --rows: 5;
  }
  /* counts 1, 4, 9 are unchanged */
}
```

Notes on the doubled-column technique:

- `repeat(2N, 1fr)` + every item `grid-column: span 2` is equivalent to `repeat(N, 1fr)` for non-ragged cases — each item occupies `(2/2N) = 1/N` of the container width.
- For ragged cases, the `2N` columns expose a half-conceptual-column granularity, so `grid-column-start: 2` centres the short row.
- Portrait rules that touch ragged counts must reset the landscape `nth-child` shifts (`grid-column-start: auto`) to avoid leaking the landscape offset onto the portrait layout.

### React component changes

`CategoricalBin.tsx`:

- Drop `import { useCircleLayout } from "./useCircleLayout"` and its call.
- Drop the `pb-44` reservation added in commit `2fcadbec`. The drawer returns to inline flow.
- Drop `floating` from the `NodeDrawer` render. It becomes a regular `shrink-0` flex child of the inner column again.
- Replace the inline `style={{ gridTemplateColumns: ..., "--catbin-panel-fraction": panelFraction }}` with `data-count={circleCount}` and an inline `style={{ "--catbin-panel-fraction": panelFraction }}` (the panel-fraction logic stays; it controls the expanded-bin sub-panel, not the main grid).
- Drop the `isReady` gate and the `data-cb-layout-pending={pending || undefined}` attribute. CSS is synchronous; bins render on first commit.
- `containerRef` on `.catbin-outer` is no longer needed and is removed.

`CategoricalBinItem.tsx`:

- Remove the inline `width: \`min(100%, calc((100cqb - 1rem _ ${rows - 1}) / ${rows}))\``and`aspectRatio: "1 / 1"`styles. These move into the CSS rule on`.catbin-circles > _`, where `var(--rows)`substitutes for the JS`rows`.
- Remove the `rows` prop and its consumers.

`useCircleLayout.ts`:

- File deleted. Tests in `__tests__/useCircleLayout.test.ts` (if present) deleted with it.

`e2e/fixtures/interview-fixture.ts`:

- Delete the `data-cb-layout-pending` wait block in `captureFinal` (lines 113-125) and the 100 ms pre-wait. With no JS layout decision, there is nothing to wait for beyond `waitForStageLoad` and font loading, which Playwright's screenshot expectation already handles.

### Why this fixes the original bug

The flip happened because `computeCols` is a discontinuous function of a drift-prone continuous input. The new design:

- **Removes the discontinuous decision from the JS path entirely.** Cols are a pure function of `count`. `count` is a small integer derived from Redux state, identical across runs.
- **Keeps one continuous decision (`aspect-ratio < 1`) in CSS only.** That decision is browser-native, evaluated on the rendered container — no measurement timing, no debouncing required.
- **The remaining threshold (`aspect-ratio = 1`) is far from typical content.** Stage 29 at 1920×1080 sits at AR ≈ 1.93 with drawer closed and AR ≈ 2.5 with drawer open — both well clear of 1.0, so neither drawer state nor any small layout drift flips orientation.
- **If a viewport genuinely lands near AR = 1, either orientation is sensible.** The grid would still be deterministic per render frame; only the visual choice (square content area → portrait or landscape) becomes a matter of taste, not a bug.

### What happens during drawer animation

- Drawer in flex flow, animating `height: auto` ↔ `height: 0`.
- `.catbin-outer`'s height tracks the drawer's height inversely.
- `@container catbin (aspect-ratio < 1)` re-evaluates each frame natively. For Stage 29 it stays `false` throughout. For other viewports it could flip mid-animation, but only between two pre-defined static grids — no in-between flicker.
- Circle diameters resize each frame via `100cqb` — natively. This was the design intent of the existing `100cqb / rows` formula and continues to work.

## Files touched

| Path                                                                                 | Change                                                                                                                                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tooling/tailwind/fresco/themes/interview.css`                                       | Add the `[data-count]` rules + portrait `@container` override block. Existing `.catbin-outer` container declaration is unchanged.                   |
| `packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx`                | Remove `useCircleLayout`, `isReady` gate, `pending` attribute, `gridTemplateColumns` inline style, `pb-44`, `floating` on drawer. Add `data-count`. |
| `packages/interview/src/interfaces/CategoricalBin/components/CategoricalBinItem.tsx` | Remove inline `width`/`aspectRatio`. Remove `rows` prop.                                                                                            |
| `packages/interview/src/interfaces/CategoricalBin/useCircleLayout.ts`                | Delete.                                                                                                                                             |
| `packages/interview/e2e/fixtures/interview-fixture.ts`                               | Delete the `data-cb-layout-pending` wait block in `captureFinal`.                                                                                   |
| `packages/interview/e2e/visual-snapshots/**`                                         | Regenerate baselines. Stage-29 4-bin landscape returns to `2×2` (matches the prior baseline). Other CategoricalBin stages should be re-inspected.   |

## Testing

- Run `pnpm --filter @codaco/interview typecheck` after deletions to confirm no orphan imports of `useCircleLayout` or `rows`.
- Storybook stories under `CategoricalBin.stories.tsx` should be exercised across 1-10 bin counts in both orientations.
- E2E suite: `pnpm --filter @codaco/interview test:e2e:update-snapshots` to regenerate, then `pnpm --filter @codaco/interview test:e2e` to verify determinism across runs (commit 5066d504's verification recipe applies).

## Migration notes

- The "balanced" lookup is a deliberate visual choice, not a behavioural compatibility constraint. If a downstream stakeholder disagrees with a specific count's grid (e.g. wants `1×3` instead of `1×3` for n=3 — currently the only n=3 option), the change is a single CSS rule.
- The `aspect-ratio < 1` boundary is not user-tunable. If we ever need a different threshold (e.g. "go portrait below 1.2:1"), it's a one-character CSS edit.

## Risk

Low. The change is mostly deletion. The remaining decision points (count lookup, orientation query) are static CSS, exercised by the existing E2E suite once snapshots are regenerated. The drawer-in-flow change reverts to the long-standing structure; only the brief floating-drawer interlude introduced in commit `2fcadbec` is rolled back.
