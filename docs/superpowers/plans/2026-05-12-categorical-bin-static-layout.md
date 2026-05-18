# CategoricalBin static layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `useCircleLayout`'s JS-measured cols optimisation with a static CSS lookup keyed on `data-count`, plus a `@container` query for landscape/portrait. Restore `NodeDrawer` to inline flex flow.

**Architecture:** All grid-shape decisions move into CSS rules under `.catbin-circles[data-count="N"]`. Orientation is handled by `@container catbin (aspect-ratio < 1)`. The React component sets `data-count={n}` and nothing else about layout. `useCircleLayout`, `data-cb-layout-pending`, the `isReady` gate, the `pb-44` reservation, and the floating-drawer wiring are all removed.

**Tech Stack:** Tailwind v4, CSS container queries (`@container`, `cqb`), React, Playwright.

---

## File Structure

- **`tooling/tailwind/fresco/themes/interview.css`** — owns all CategoricalBin grid CSS. Adds the `[data-count]` rules and portrait `@container` override block. Existing `.catbin-outer` container declaration stays.
- **`packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx`** — React entry. After the change, this file only sets `data-count` and renders bins; it no longer measures or gates rendering.
- **`packages/interview/src/interfaces/CategoricalBin/components/CategoricalBinItem.tsx`** — bin item. Loses the `rows` prop and the inline `width`/`aspectRatio` style; both move into the CSS rule on `.catbin-circles > *`.
- **`packages/interview/src/interfaces/CategoricalBin/useCircleLayout.ts`** — deleted.
- **`packages/interview/e2e/fixtures/interview-fixture.ts`** — `captureFinal` loses the `data-cb-layout-pending` wait block.

---

### Task 1: Add the static layout CSS

**Files:**

- Modify: `tooling/tailwind/fresco/themes/interview.css:192-240`

- [ ] **Step 1: Add the static layout block inside `@layer components`**

Insert the rules below immediately after the existing `.catbin-expanded` rule (currently ending around line 217). The existing `.catbin-outer { container-type: size; container-name: catbin; }` block stays untouched — we just append more rules to the same `@layer components` block.

```css
/* Static grid: cols/rows decided by data-count + a container query for orientation.
   Every count uses a doubled-column grid so ragged last rows (counts 5, 7) can be
   centred via grid-column-start without breaking row alignment. */
.catbin-circles {
  display: grid;
  grid-template-columns: repeat(var(--catbin-cols, 2), 1fr);
  grid-template-rows: repeat(var(--catbin-rows, 1), 1fr);
  gap: 1rem;
  place-items: center;
}

.catbin-circles > * {
  grid-column: span 2;
  width: min(
    100%,
    calc((100cqb - 1rem * (var(--catbin-rows, 1) - 1)) / var(--catbin-rows, 1))
  );
  aspect-ratio: 1 / 1;
}

/* Landscape lookup (aspect-ratio >= 1, default). */
.catbin-circles[data-count='1'] {
  --catbin-cols: 2;
  --catbin-rows: 1;
}
.catbin-circles[data-count='2'] {
  --catbin-cols: 4;
  --catbin-rows: 1;
}
.catbin-circles[data-count='3'] {
  --catbin-cols: 6;
  --catbin-rows: 1;
}
.catbin-circles[data-count='4'] {
  --catbin-cols: 4;
  --catbin-rows: 2;
}
.catbin-circles[data-count='5'] {
  --catbin-cols: 6;
  --catbin-rows: 2;
}
.catbin-circles[data-count='5'] > :nth-child(4) {
  grid-column-start: 2;
}
.catbin-circles[data-count='6'] {
  --catbin-cols: 6;
  --catbin-rows: 2;
}
.catbin-circles[data-count='7'] {
  --catbin-cols: 8;
  --catbin-rows: 2;
}
.catbin-circles[data-count='7'] > :nth-child(5) {
  grid-column-start: 2;
}
.catbin-circles[data-count='8'] {
  --catbin-cols: 8;
  --catbin-rows: 2;
}
.catbin-circles[data-count='9'] {
  --catbin-cols: 6;
  --catbin-rows: 3;
}
.catbin-circles[data-count='10'] {
  --catbin-cols: 10;
  --catbin-rows: 2;
}

/* Portrait override (aspect-ratio < 1). Counts 1, 4, 9 keep their landscape values. */
@container catbin (aspect-ratio < 1) {
  .catbin-circles[data-count='2'] {
    --catbin-cols: 2;
    --catbin-rows: 2;
  }
  .catbin-circles[data-count='3'] {
    --catbin-cols: 2;
    --catbin-rows: 3;
  }
  .catbin-circles[data-count='5'] {
    --catbin-cols: 4;
    --catbin-rows: 3;
  }
  .catbin-circles[data-count='5'] > :nth-child(4) {
    grid-column-start: auto;
  }
  .catbin-circles[data-count='5'] > :nth-child(5) {
    grid-column-start: 2;
  }
  .catbin-circles[data-count='6'] {
    --catbin-cols: 4;
    --catbin-rows: 3;
  }
  .catbin-circles[data-count='7'] {
    --catbin-cols: 4;
    --catbin-rows: 4;
  }
  .catbin-circles[data-count='7'] > :nth-child(5) {
    grid-column-start: auto;
  }
  .catbin-circles[data-count='7'] > :nth-child(7) {
    grid-column-start: 2;
  }
  .catbin-circles[data-count='8'] {
    --catbin-cols: 4;
    --catbin-rows: 4;
  }
  .catbin-circles[data-count='10'] {
    --catbin-cols: 4;
    --catbin-rows: 5;
  }
}
```

Why `--catbin-cols`/`--catbin-rows` (prefixed) instead of `--cols`/`--rows`: keeps CSS variables namespaced to this feature so they don't collide with anything else in the global cascade.

The fallback values in the `var(--catbin-cols, 2)` / `var(--catbin-rows, 1)` calls are defensive — they keep the grid renderable if a count outside 1-10 sneaks in.

- [ ] **Step 2: Visually sanity-check via Storybook (optional but cheap)**

Run: `pnpm --filter @codaco/interview storybook`
Open the CategoricalBin stories and click through bin counts 1-10. Resize the window to flip aspect ratio; verify the grid switches between landscape and portrait layouts deterministically.

This step does not block the next task — it just catches typos in the CSS before downstream code is changed.

- [ ] **Step 3: Commit**

```bash
git add tooling/tailwind/fresco/themes/interview.css
git commit -m "feat(tailwind-config/interview): static CategoricalBin grid via data-count + @container

Adds [data-count] lookup rules and a portrait @container override for the
catbin-circles grid. The .catbin-outer named-container declaration is unchanged;
this just adds the rules that read from it."
```

---

### Task 2: Strip JS layout from CategoricalBin.tsx

**Files:**

- Modify: `packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx`

- [ ] **Step 1: Remove the `useCircleLayout` import and call**

Find:

```ts
import { useCircleLayout } from './useCircleLayout';
```

Delete the import line.

Find:

```ts
const hasExpanded = expandedBinIndex !== null;

const circleCount = hasExpanded ? bins.length - 1 : bins.length;
const { containerRef, cols, rows, isReady, pending } = useCircleLayout({
  count: circleCount,
});
```

Replace with:

```ts
const hasExpanded = expandedBinIndex !== null;

const circleCount = hasExpanded ? bins.length - 1 : bins.length;
```

- [ ] **Step 2: Restore the drawer to inline flow and remove the bottom reservation**

Find the return statement (currently around line 211-263):

```tsx
return (
  <div
    data-testid="categorical-bin-interface"
    className="interface overflow-hidden pb-0"
  >
    <Prompts />
    {/*
     * Reserve fixed bottom space so the bins area stays the same
     * height regardless of NodeDrawer state. The drawer floats over this
     * reserved area, so its expand/collapse never resizes catbin-outer and
     * never triggers a cols recompute mid-stage.
     */}
    <div className="flex w-full min-h-0 flex-1 flex-col items-center pb-44">
      <div
        className="catbin-outer min-h-0 w-full flex-1"
        ref={containerRef}
        data-cb-layout-pending={pending || undefined}
      >
        {isReady && (
          <AnimatePresence mode="wait">
            <motion.div
              key={id}
              className="catbin-circles grid size-full content-center justify-center justify-items-center gap-4 data-expanded:content-start"
              data-expanded={hasExpanded || undefined}
              style={
                {
                  '--catbin-panel-fraction': panelFraction,
                  'gridTemplateColumns': `repeat(${cols}, minmax(0, 1fr))`,
                } as React.CSSProperties
              }
              variants={binsContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {bins.map((bin, index) => (
                <CategoricalBinItem
                  key={index}
                  label={bin.label}
                  isExpanded={index === expandedBinIndex}
                  onToggleExpand={() => setExpandedBinIndex(index)}
                  catColor={getCatColor(index)}
                  onDropNode={(node) => handleDropNode(node, index)}
                  nodes={bin.nodes}
                  rows={rows}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
    <NodeDrawer nodes={uncategorisedNodes} itemType="NODE" floating />
  </div>
);
```

Replace with:

```tsx
return (
  <div
    data-testid="categorical-bin-interface"
    className="interface overflow-hidden pb-0"
  >
    <Prompts />
    <div className="flex w-full min-h-0 flex-1 flex-col items-center gap-2">
      <div className="catbin-outer min-h-0 w-full flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={id}
            className="catbin-circles size-full content-center data-expanded:content-start"
            data-count={circleCount}
            data-expanded={hasExpanded || undefined}
            style={
              {
                '--catbin-panel-fraction': panelFraction,
              } as React.CSSProperties
            }
            variants={binsContainerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {bins.map((bin, index) => (
              <CategoricalBinItem
                key={index}
                label={bin.label}
                isExpanded={index === expandedBinIndex}
                onToggleExpand={() => setExpandedBinIndex(index)}
                catColor={getCatColor(index)}
                onDropNode={(node) => handleDropNode(node, index)}
                nodes={bin.nodes}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <NodeDrawer nodes={uncategorisedNodes} itemType="NODE" />
    </div>
  </div>
);
```

What changed in this block:

- Reserved-bottom-space wrapper comment removed.
- `pb-44` removed; `gap-2` reintroduced (drawer is a flex sibling again).
- `containerRef` and `data-cb-layout-pending` attributes removed from `.catbin-outer`.
- `isReady &&` gate removed (CSS is synchronous; render bins immediately).
- `grid`, `justify-center`, `justify-items-center`, `gap-4` Tailwind utilities removed from `.catbin-circles` className — these are now handled by the `.catbin-circles` rule in CSS (Task 1).
- `gridTemplateColumns` inline style removed; `data-count={circleCount}` added.
- `--catbin-panel-fraction` inline style retained (still drives the expanded-bin sub-panel).
- `rows={rows}` prop on `CategoricalBinItem` removed.
- `NodeDrawer` moved back inside the inner flex column; `floating` prop removed.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: clean exit. If you get `Cannot find module './useCircleLayout'` or unused-import errors, return to Step 1 and finish the deletion.

- [ ] **Step 4: Run biome on the file**

Run: `pnpm exec biome check --write packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx`
Expected: any auto-fixable issues are fixed; remaining warnings are pre-existing (lines 56, 147, 172 — non-null assertions unrelated to this work).

- [ ] **Step 5: Do not commit yet** — `CategoricalBinItem` still has the `rows` prop in its type; Task 3 fixes that.

---

### Task 3: Drop `rows` and inline styles from `CategoricalBinItem`

**Files:**

- Modify: `packages/interview/src/interfaces/CategoricalBin/components/CategoricalBinItem.tsx`

- [ ] **Step 1: Read the current sizing block**

Run: `grep -n "rows\|width:\|aspectRatio" packages/interview/src/interfaces/CategoricalBin/components/CategoricalBinItem.tsx`

You should see the `rows` prop in the component's TypeScript props, plus the inline `style={{ width: ..., aspectRatio: ... }}` block on the rendered element (around line 150-162 per the earlier read).

- [ ] **Step 2: Remove the `rows` prop from the component's props type**

Find the props type and delete the `rows: number;` line.

- [ ] **Step 3: Remove `rows` from the destructured function arguments**

Find the function signature and remove `rows` from the destructured props.

- [ ] **Step 4: Remove the inline `width`/`aspectRatio` style**

Find:

```ts
				// Width = min(grid track width, available height per row).
				// 100cqb / rows = bin height if it filled vertically; the parent
				// .catbin-outer is the named container so 100cqb resolves to its
				// block size. min() picks the binding constraint, then aspect-ratio
				// gives a square. rendered diameter is stable across runs even if
				// container measurement drifts.
				width: `min(100%, calc((100cqb - 1rem * ${rows - 1}) / ${rows}))`,
				aspectRatio: "1 / 1",
```

Delete both properties and their preceding comment. If `style={{ ... }}` had only these two properties, remove the whole `style` prop. If it had other entries, leave them in place.

The sizing is now applied via the CSS rule on `.catbin-circles > *` from Task 1.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: clean. Both CategoricalBin.tsx (Task 2) and CategoricalBinItem.tsx are now consistent.

- [ ] **Step 6: Run biome auto-fix on both files**

Run: `pnpm exec biome check --write packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx packages/interview/src/interfaces/CategoricalBin/components/CategoricalBinItem.tsx`
Expected: clean (modulo pre-existing warnings).

- [ ] **Step 7: Commit Tasks 2 + 3 together**

```bash
git add packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx \
        packages/interview/src/interfaces/CategoricalBin/components/CategoricalBinItem.tsx
git commit -m "refactor(interview/CategoricalBin): drive grid layout from data-count + CSS

Removes useCircleLayout's JS-measured cols optimisation. The .catbin-circles
wrapper now exposes data-count={n}; CSS rules in interview.css translate that
into --catbin-cols/--catbin-rows, and a @container catbin (aspect-ratio < 1)
query flips landscape <-> portrait. CategoricalBinItem loses its rows prop and
inline width/aspectRatio style — both move into .catbin-circles > * in CSS.

Also reverts the floating NodeDrawer + pb-44 reservation from 2fcadbec; the
drawer is back to inline flex flow. Drawer expand/collapse changes the catbin
container's block size, which is handled natively by the @container query and
the 100cqb-derived circle sizing — no JS measurement remains."
```

---

### Task 4: Delete `useCircleLayout.ts`

**Files:**

- Delete: `packages/interview/src/interfaces/CategoricalBin/useCircleLayout.ts`

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `grep -rn "useCircleLayout" packages/interview/src --include="*.ts" --include="*.tsx"`
Expected: empty output (Task 2 already removed the CategoricalBin.tsx import).

- [ ] **Step 2: Delete the file**

Run: `rm packages/interview/src/interfaces/CategoricalBin/useCircleLayout.ts`

- [ ] **Step 3: Check for a unit test that would also be orphaned**

Run: `ls packages/interview/src/interfaces/CategoricalBin/__tests__/`
Expected: only `useCategoricalBins.test.ts`. If `useCircleLayout.test.ts` exists, delete it too with `rm packages/interview/src/interfaces/CategoricalBin/__tests__/useCircleLayout.test.ts`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A packages/interview/src/interfaces/CategoricalBin/
git commit -m "chore(interview/CategoricalBin): delete useCircleLayout

No more consumers after the move to static CSS layout. The settle debounce,
isReady gate, pending flag, and 50px-snapping heuristic are no longer needed."
```

---

### Task 5: Remove the `data-cb-layout-pending` wait from `captureFinal`

**Files:**

- Modify: `packages/interview/e2e/fixtures/interview-fixture.ts:98-130`

- [ ] **Step 1: Find the current `captureFinal` implementation**

Run: `grep -n "captureFinal\|data-cb-layout-pending" packages/interview/e2e/fixtures/interview-fixture.ts`

Expected lines (numbers approximate): 98 `async captureFinal()`, 113-125 the wait block, 128 the actual capture.

- [ ] **Step 2: Delete the 100ms buffer + waitForFunction**

Find:

```ts
// Buffer for the post-interaction ResizeObserver/React commit cycle
// to propagate to the DOM (in particular, for `data-cb-layout-pending`
// to flip to `true` if a CategoricalBin layout debounce was just armed).
await this.page.waitForTimeout(100);
// Wait for any in-flight CategoricalBin layout debounce to commit.
// The hook surfaces `data-cb-layout-pending` on `.catbin-outer` while
// its 120ms ResizeObserver-settle timer is armed; once cleared, the
// committed dimensions are reflected in `cols`/`rows`. No-op for any
// stage that doesn't render a categorical bin.
await this.page.waitForFunction(
  () => !document.querySelector('[data-cb-layout-pending]'),
  null,
  {
    timeout: 5_000,
  },
);
```

Delete the entire block. The lines that follow it (`const prefix = ...` and `await this.capture(...)`) stay in place.

- [ ] **Step 3: Confirm the surrounding `scrollables.forEach` block stays**

The block immediately above the deletion (the `scrollables.forEach` that scrolls everything to the bottom) is unrelated and must stay.

- [ ] **Step 4: Run typecheck on the e2e tsconfig**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/e2e/fixtures/interview-fixture.ts
git commit -m "chore(interview/e2e): drop data-cb-layout-pending wait

Now that CategoricalBin layout is pure CSS, there is no JS settle debounce to
wait for. captureFinal returns to relying on Playwright's built-in stable-frame
detection on the screenshot expectation."
```

---

### Task 6: Verify the package builds and lints clean

**Files:** none — verification only.

- [ ] **Step 1: Full typecheck across the package**

Run: `pnpm --filter @codaco/interview typecheck`
Expected: clean exit. If anything fails, stop and investigate before regenerating snapshots — typecheck failures usually point to a leftover reference from one of the prior tasks.

- [ ] **Step 2: Repo-wide biome check on the touched files**

Run:

```bash
pnpm exec biome check \
  packages/interview/src/interfaces/CategoricalBin/CategoricalBin.tsx \
  packages/interview/src/interfaces/CategoricalBin/components/CategoricalBinItem.tsx \
  packages/interview/e2e/fixtures/interview-fixture.ts
```

Expected: only pre-existing warnings (`noNonNullAssertion` on lines unrelated to this work).

- [ ] **Step 3: Unit tests for CategoricalBin internals**

Run: `pnpm --filter @codaco/interview test`
Expected: `useCategoricalBins.test.ts` still passes (its target was never `useCircleLayout`). If you find a stray `useCircleLayout.test.ts` here that wasn't caught in Task 4, delete it now.

---

### Task 7: Regenerate e2e snapshots and verify determinism

**Files:** `packages/interview/e2e/visual-snapshots/**` (regenerated by tooling).

- [ ] **Step 1: Update snapshots**

Run: `pnpm --filter @codaco/interview test:e2e:update-snapshots`
Expected: 168/168 pass (per commit 5066d504's verification recipe). All CategoricalBin snapshots are regenerated. The Stage 29 `final` baseline returns to a `2×2` grid (1920×1080 viewport, drawer-closed AR ≈ 1.93, landscape lookup for n=4 → 2×2).

- [ ] **Step 2: Run the suite without `--update-snapshots`**

Run: `pnpm --filter @codaco/interview test:e2e`
Expected: 168/168 pass on the freshly committed baselines — confirms the new layout is deterministic across runs (no flips on rerun).

- [ ] **Step 3: Inspect the regenerated snapshots before committing**

The diff includes ~330 PNGs (56 tests × 3 browsers). Open a few CategoricalBin baselines manually and confirm:

- 4-bin stages render `2×2` at the 1920×1080 viewport.
- Counts 5 and 7 (if any test exercises them) render with the centred ragged last row, not a left-aligned one.
- Drawer-collapsed `final` snapshots look reasonable (the bins now expand into the larger area, scaled via `100cqb / rows`).

If any layout looks wrong, the fix is a single CSS rule edit in `interview.css` — return to Task 1, adjust, then re-run Step 1.

- [ ] **Step 4: Commit the regenerated snapshots**

```bash
git add packages/interview/e2e/visual-snapshots/
git commit -m "test(interview/e2e): regenerate CategoricalBin baselines for static layout

Static data-count-driven layout produces deterministic grids per (count,
orientation); regenerating against the new CSS. Stage 29 4-bin final returns
to 2x2 (matches the original baseline; the threshold flip is no longer
possible)."
```

---

## Done definition

- `pnpm --filter @codaco/interview typecheck` clean.
- `pnpm --filter @codaco/interview test:e2e` passes 168/168 on the freshly committed baselines (i.e. no `--update-snapshots` flag needed for it to be green).
- `useCircleLayout.ts` and the `data-cb-layout-pending` attribute are gone from the working tree.
- `git log --oneline` shows 4 commits: CSS, component refactor, deletion, fixture cleanup, snapshot refresh.

## If a CategoricalBin stage has count > 10

The lookup deliberately covers 1-10 only. Counts outside that range fall back to the `var(--catbin-cols, 2)` / `var(--catbin-rows, 1)` defaults, which produces a 1×2 grid that will visually overflow. That's a deliberate signal — surfacing the constraint loudly so a follow-up either adds the missing breakpoint or rejects the protocol upstream. Not in scope here.
