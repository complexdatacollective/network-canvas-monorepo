# NarrativePedigree Zoom Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add zoom in / zoom out / reset controls to the read-only NarrativePedigree interface, exposed as buttons in a floating `SegmentedToolbar` pinned bottom-right.

**Architecture:** Zoom is a `transform: scale(z)` on the pedigree content inside the existing `overflow-auto` scroll viewport. Because CSS transforms don't change layout box size, the content is nested in three layers — scroll viewport → sizer (reserves `naturalW·z × naturalH·z` so scrollbars are correct) → scaled content (transform, origin top-left). Pure zoom arithmetic lives in a `zoom.ts` helper (unit-tested); the DOM orchestration and toolbar live in a new `ZoomableViewport` component that `NarrativePedigreeView` wraps its `PedigreeLayout` in.

**Tech Stack:** React, TypeScript, Vitest, Storybook (`@storybook/addon-vitest` interaction tests), `@codaco/fresco-ui` `SegmentedToolbar`, `lucide-react` icons, Tailwind CSS.

## Global Constraints

- Package: `@codaco/interview` (`packages/interview/`), a published library (v2.0.1, not private).
- NO `any` types; no type assertions (`as T`) to silence errors — fix the cause.
- No barrel files (no `index.ts` re-exports). Import each symbol from its source.
- Only export what another module actually uses (`pnpm knip` is a quality gate).
- Comment only unusual/complex code.
- Run the formatter/linter on touched files (the repo's `lint-staged` hook runs `oxlint --fix` + `oxfmt` on commit; do not run root `lint:fix`).
- Scope is NarrativePedigree only — do NOT touch the editable FamilyPedigree interface, the protocol schema, codebook, or migrations. No wheel/pinch/keyboard zoom. No change to the initial (on-load) view.
- SegmentedToolbar import: `import { SegmentedToolbar, type ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';`
- Preserve the `data-narrative-pedigree-view` attribute, `role="presentation"`, the background-click (clear focal) and Escape (clear focal) handlers, and the `items-start justify-center-safe pt-6` layout classes on the scroll container — existing tests query `[data-narrative-pedigree-view]`.

---

### Task 1: Pure zoom arithmetic (`zoom.ts`)

**Files:**

- Create: `packages/interview/src/interfaces/NarrativePedigree/zoom.ts`
- Test: `packages/interview/src/interfaces/NarrativePedigree/__tests__/zoom.test.ts`

**Interfaces:**

- Produces (all consumed by Task 2's `ZoomableViewport`):
  - `DEFAULT_ZOOM: number` (= 1)
  - `zoomIn(zoom: number): number` — multiply by step, clamp to max
  - `zoomOut(zoom: number): number` — divide by step, clamp to min
  - `canZoomIn(zoom: number): boolean`
  - `canZoomOut(zoom: number): boolean`
  - `scaleAroundCenter(scroll: number, viewport: number, ratio: number): number` — new scroll offset keeping the viewport-centre point fixed
  - `clampScroll(offset: number, scrollSize: number, viewport: number): number`
  - `centeredScrollLeft(scrollSize: number, viewport: number): number`
- Internal only (NOT exported — used solely inside this module): `MIN_ZOOM` (0.5), `MAX_ZOOM` (2), `ZOOM_STEP` (1.25), `EPSILON` (1e-6), `clampZoom`.

- [ ] **Step 1: Write the failing test**

Create `packages/interview/src/interfaces/NarrativePedigree/__tests__/zoom.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  canZoomIn,
  canZoomOut,
  centeredScrollLeft,
  clampScroll,
  DEFAULT_ZOOM,
  scaleAroundCenter,
  zoomIn,
  zoomOut,
} from '../zoom';

describe('zoom arithmetic', () => {
  it('starts at 100%', () => {
    expect(DEFAULT_ZOOM).toBe(1);
  });

  it('zooms in by a multiplicative step and clamps at 2x', () => {
    expect(zoomIn(1)).toBeCloseTo(1.25);
    expect(zoomIn(1.953125)).toBe(2); // 1.953125 * 1.25 = 2.44 -> clamped
    expect(zoomIn(2)).toBe(2);
  });

  it('zooms out by a multiplicative step and clamps at 0.5x', () => {
    expect(zoomOut(1)).toBeCloseTo(0.8);
    expect(zoomOut(0.512)).toBe(0.5); // 0.512 / 1.25 = 0.4096 -> clamped
    expect(zoomOut(0.5)).toBe(0.5);
  });

  it('reports whether further zoom is possible', () => {
    expect(canZoomIn(1)).toBe(true);
    expect(canZoomIn(2)).toBe(false);
    expect(canZoomOut(1)).toBe(true);
    expect(canZoomOut(0.5)).toBe(false);
  });

  it('anchors scroll so the viewport centre stays fixed', () => {
    // scroll 0, viewport 100, doubling -> centre (50) maps to 100 -> scroll 50
    expect(scaleAroundCenter(0, 100, 2)).toBe(50);
    // halving keeps 0 at 0's neighbourhood: (0+50)*0.5 - 50 = -25
    expect(scaleAroundCenter(0, 100, 0.5)).toBe(-25);
  });

  it('clamps scroll offsets into range', () => {
    expect(clampScroll(-25, 300, 100)).toBe(0); // below 0
    expect(clampScroll(500, 300, 100)).toBe(200); // above max (300-100)
    expect(clampScroll(120, 300, 100)).toBe(120); // in range
    expect(clampScroll(50, 80, 100)).toBe(0); // content fits: max is 0
  });

  it('centres content wider than the viewport', () => {
    expect(centeredScrollLeft(300, 100)).toBe(100); // (300-100)/2
    expect(centeredScrollLeft(80, 100)).toBe(0); // fits -> 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/interview test -- --project units zoom.test`
Expected: FAIL — `Cannot find module '../zoom'`.

- [ ] **Step 3: Write the implementation**

Create `packages/interview/src/interfaces/NarrativePedigree/zoom.ts`:

```ts
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.25;
const EPSILON = 1e-6;

export const DEFAULT_ZOOM = 1;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function zoomIn(zoom: number): number {
  return clampZoom(zoom * ZOOM_STEP);
}

export function zoomOut(zoom: number): number {
  return clampZoom(zoom / ZOOM_STEP);
}

export function canZoomIn(zoom: number): boolean {
  return zoom < MAX_ZOOM - EPSILON;
}

export function canZoomOut(zoom: number): boolean {
  return zoom > MIN_ZOOM + EPSILON;
}

// New scroll offset that keeps the viewport-centre point fixed when the content
// is scaled by `ratio` (= newZoom / oldZoom). Caller clamps to the valid range.
export function scaleAroundCenter(
  scroll: number,
  viewport: number,
  ratio: number,
): number {
  return (scroll + viewport / 2) * ratio - viewport / 2;
}

export function clampScroll(
  offset: number,
  scrollSize: number,
  viewport: number,
): number {
  return Math.min(Math.max(offset, 0), Math.max(0, scrollSize - viewport));
}

// Scroll offset that horizontally centres content wider than the viewport, or 0
// when it fits — matches the default centred layout used on reset.
export function centeredScrollLeft(
  scrollSize: number,
  viewport: number,
): number {
  return Math.max(0, (scrollSize - viewport) / 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/interview test -- --project units zoom.test`
Expected: PASS (all 7 assertions green).

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NarrativePedigree/zoom.ts packages/interview/src/interfaces/NarrativePedigree/__tests__/zoom.test.ts
git commit -m "feat(narrative-pedigree): add pure zoom arithmetic helpers"
```

---

### Task 2: `ZoomableViewport` component

**Files:**

- Create: `packages/interview/src/interfaces/NarrativePedigree/components/ZoomableViewport.tsx`
- Test: `packages/interview/src/interfaces/NarrativePedigree/components/__tests__/ZoomableViewport.test.tsx`

**Interfaces:**

- Consumes: everything exported from `../zoom` (Task 1).
- Produces (consumed by Task 3's `NarrativePedigreeView`):
  - `export default function ZoomableViewport(props: ZoomableViewportProps)`
  - `type ZoomableViewportProps = { children: ReactNode; toolbarLabel: string; onBackgroundClick?: () => void; onEscape?: () => void; }`
  - Renders a scroll container carrying `data-narrative-pedigree-view` and the scaled content carrying `data-testid="np-zoom-content"` + `data-zoom-level={zoom}`.

**Notes for the implementer:**

- `offsetWidth`/`offsetHeight` are unaffected by CSS transforms, so measuring `contentRef` reads the natural (100%) size at any zoom.
- The scroll adjustment must run _after_ the new zoom commits (so `scrollWidth`/`scrollHeight` reflect the new sizer) — hence a `useLayoutEffect` keyed on a nonce that bumps on every zoom/reset action (a reset at an already-100% zoom must still recentre, so we can't key on the zoom value alone).
- Zoom is applied instantly (no CSS scale transition): this keeps the sizer size and the transform in perfect lockstep (no transient gap) and trivially satisfies the reduced-motion requirement. The `SegmentedToolbar` already handles its own reduced-motion for segment animations.
- `ResizeObserver` is guarded (`typeof ResizeObserver === 'undefined'`) so the component is safe under jsdom, which lacks it.

- [ ] **Step 1: Write the failing test**

Create `packages/interview/src/interfaces/NarrativePedigree/components/__tests__/ZoomableViewport.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ZoomableViewport from '../ZoomableViewport';

function renderViewport(
  overrides: Partial<Parameters<typeof ZoomableViewport>[0]> = {},
) {
  return render(
    <ZoomableViewport toolbarLabel="Zoom controls" {...overrides}>
      <div style={{ width: 400, height: 300 }}>pedigree content</div>
    </ZoomableViewport>,
  );
}

function zoomLevel(): string | null {
  return screen.getByTestId('np-zoom-content').getAttribute('data-zoom-level');
}

describe('ZoomableViewport', () => {
  it('renders zoom in, zoom out and reset controls at 100%', () => {
    renderViewport();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Zoom out' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset zoom' }),
    ).toBeInTheDocument();
    expect(zoomLevel()).toBe('1');
  });

  it('increases the zoom level when zooming in', async () => {
    const user = userEvent.setup();
    renderViewport();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(Number(zoomLevel())).toBeGreaterThan(1);
  });

  it('returns to 100% on reset', async () => {
    const user = userEvent.setup();
    renderViewport();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(zoomLevel()).toBe('1');
  });

  it('disables zoom out at the minimum', async () => {
    const user = userEvent.setup();
    renderViewport();
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    // 1 -> 0.8 -> 0.64 -> 0.5 (clamped); the fourth click reaches the floor.
    await user.click(zoomOut);
    await user.click(zoomOut);
    await user.click(zoomOut);
    await user.click(zoomOut);
    expect(zoomOut).toBeDisabled();
  });

  it('does not clear the focal person when a toolbar button is clicked', async () => {
    const user = userEvent.setup();
    const onBackgroundClick = vi.fn();
    renderViewport({ onBackgroundClick });
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/interview test -- --project units ZoomableViewport.test`
Expected: FAIL — `Cannot find module '../ZoomableViewport'`.

- [ ] **Step 3: Write the implementation**

Create `packages/interview/src/interfaces/NarrativePedigree/components/ZoomableViewport.tsx`:

```tsx
'use client';

import { LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';

import {
  canZoomIn,
  canZoomOut,
  centeredScrollLeft,
  clampScroll,
  DEFAULT_ZOOM,
  scaleAroundCenter,
  zoomIn,
  zoomOut,
} from '../zoom';

type PendingScroll =
  | {
      type: 'anchor';
      oldZoom: number;
      scrollLeft: number;
      scrollTop: number;
      clientWidth: number;
      clientHeight: number;
    }
  | { type: 'reset' };

type ZoomableViewportProps = {
  children: ReactNode;
  /** Accessible name for the zoom toolbar. */
  toolbarLabel: string;
  /** Fired when the scroll background (not the toolbar) is clicked. */
  onBackgroundClick?: () => void;
  /** Fired on Escape within the viewport. */
  onEscape?: () => void;
};

export default function ZoomableViewport({
  children,
  toolbarLabel,
  onBackgroundClick,
  onEscape,
}: ZoomableViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<PendingScroll | null>(null);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [scrollNonce, setScrollNonce] = useState(0);
  const [natural, setNatural] = useState({ width: 0, height: 0 });

  // Measure the un-transformed content. offsetWidth/Height ignore CSS
  // transforms, so this is the natural (100%) size at any zoom. Measured in a
  // layout effect (before paint) to avoid a mis-sized first frame; a
  // ResizeObserver keeps it current as the pedigree changes.
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () =>
      setNatural((previous) =>
        previous.width === element.offsetWidth &&
        previous.height === element.offsetHeight
          ? previous
          : { width: element.offsetWidth, height: element.offsetHeight },
      );
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Apply the pending scroll adjustment once the new zoom has committed (so
  // scrollWidth/Height reflect the resized sizer). Keyed on the nonce so a reset
  // at an unchanged zoom still recentres.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const pending = pendingScroll.current;
    if (!element || !pending) return;
    pendingScroll.current = null;
    if (pending.type === 'reset') {
      element.scrollTop = 0;
      element.scrollLeft = centeredScrollLeft(
        element.scrollWidth,
        element.clientWidth,
      );
      return;
    }
    const ratio = zoom / pending.oldZoom;
    element.scrollLeft = clampScroll(
      scaleAroundCenter(pending.scrollLeft, pending.clientWidth, ratio),
      element.scrollWidth,
      element.clientWidth,
    );
    element.scrollTop = clampScroll(
      scaleAroundCenter(pending.scrollTop, pending.clientHeight, ratio),
      element.scrollHeight,
      element.clientHeight,
    );
  }, [scrollNonce, zoom]);

  const changeZoom = (next: number) => {
    const element = scrollRef.current;
    if (element) {
      pendingScroll.current = {
        type: 'anchor',
        oldZoom: zoom,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
      };
    }
    setZoom(next);
    setScrollNonce((nonce) => nonce + 1);
  };

  const handleReset = () => {
    pendingScroll.current = { type: 'reset' };
    setZoom(DEFAULT_ZOOM);
    setScrollNonce((nonce) => nonce + 1);
  };

  const items: ToolbarSegment[] = [
    {
      type: 'button',
      id: 'zoom-out',
      label: 'Zoom out',
      icon: <ZoomOut />,
      disabled: !canZoomOut(zoom),
      onClick: () => changeZoom(zoomOut(zoom)),
    },
    {
      type: 'button',
      id: 'zoom-in',
      label: 'Zoom in',
      icon: <ZoomIn />,
      disabled: !canZoomIn(zoom),
      onClick: () => changeZoom(zoomIn(zoom)),
    },
    { type: 'separator', id: 'zoom-separator' },
    {
      type: 'button',
      id: 'reset-zoom',
      label: 'Reset zoom',
      icon: <LocateFixed />,
      onClick: handleReset,
    },
  ];

  return (
    <>
      <div
        ref={scrollRef}
        data-narrative-pedigree-view
        role="presentation"
        className="relative flex min-h-0 w-full min-w-0 grow items-start justify-center-safe overflow-auto pt-6 pr-6 pb-24"
        onClick={onBackgroundClick}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onEscape?.();
        }}
      >
        <div
          className="relative flex-none"
          style={{ width: natural.width * zoom, height: natural.height * zoom }}
        >
          <div
            ref={contentRef}
            data-testid="np-zoom-content"
            data-zoom-level={zoom}
            className="absolute top-0 left-0 origin-top-left"
            style={{ transform: `scale(${zoom})` }}
          >
            {children}
          </div>
        </div>
      </div>
      <SegmentedToolbar
        label={toolbarLabel}
        size="lg"
        items={items}
        className="absolute right-4 bottom-4 z-10"
      />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/interview test -- --project units ZoomableViewport.test`
Expected: PASS (5 tests). Base UI may log React `act()` warnings from menu/tooltip rAF — these are harmless and expected under jsdom (see the "Base UI act() warnings under jsdom" note); they do not fail the run.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NarrativePedigree/components/ZoomableViewport.tsx packages/interview/src/interfaces/NarrativePedigree/components/__tests__/ZoomableViewport.test.tsx
git commit -m "feat(narrative-pedigree): add ZoomableViewport with floating zoom toolbar"
```

---

### Task 3: Wire `ZoomableViewport` into `NarrativePedigreeView`

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx`
- Test (existing, must stay green): `packages/interview/src/interfaces/NarrativePedigree/__tests__/NarrativePedigreeView.test.tsx`

**Interfaces:**

- Consumes: `ZoomableViewport` (Task 2 default export).

**Notes:** `ZoomableViewport` now owns the scroll container that used to be the `viewRef` div (lines 667-693). The `viewRef` ref (declared at line 153, only ever attached — never read) becomes unused and must be removed. The `data-narrative-pedigree-view` attribute, `role="presentation"`, background-click and Escape handlers, and layout classes now live inside `ZoomableViewport`, so the view passes only the two callbacks.

- [ ] **Step 1: Add the import**

In `NarrativePedigreeView.tsx`, add to the local-imports group (near the `./ConditionPanel` / `./Sticker` imports at the bottom of the import block):

```tsx
import ZoomableViewport from './ZoomableViewport';
```

- [ ] **Step 2: Remove the now-unused `viewRef`**

Delete this line (currently line 153):

```tsx
const viewRef = useRef<HTMLDivElement>(null);
```

If `useRef` is no longer used anywhere else in the file, remove it from the `react` import; if `snapshotRef` (also a `useRef`) remains, leave the import. (`snapshotRef` at line 154 still uses `useRef`, so keep the import.)

- [ ] **Step 3: Replace the scroll container with `ZoomableViewport`**

Replace the inner scroll `<div ref={viewRef} …>…</div>` block (currently lines 667-693) — the one wrapping `<PedigreeLayout … />` — with:

```tsx
<ZoomableViewport
  toolbarLabel="Zoom controls"
  onBackgroundClick={() => setFocalId(null)}
  onEscape={() => setFocalId(null)}
>
  <PedigreeLayout
    nodes={nodesMap}
    edges={edgesMap}
    variableConfig={variableConfig}
    nodeWidth={nodeWidth}
    nodeHeight={nodeHeight}
    renderNode={renderNode}
    highlightedNodeIds={focalId !== null ? highlight.nodes : undefined}
    highlightedEdgeKeys={focalId !== null ? highlight.edges : undefined}
  />
</ZoomableViewport>
```

Leave the outer pane wrapper (`<div className="relative flex min-h-0 min-w-0 grow flex-col overflow-hidden">`) and the `focalId !== null` "Clear focus" block untouched — they remain siblings of the viewport's toolbar within the same `relative` wrapper.

- [ ] **Step 4: Run the existing view tests to verify no regression**

Run: `pnpm --filter @codaco/interview test -- --project units NarrativePedigreeView.test`
Expected: PASS — the suite still finds `[data-narrative-pedigree-view]` and the in-view status markers, and background-click / Escape still clear the focal person.

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.tsx
git commit -m "feat(narrative-pedigree): render pedigree inside ZoomableViewport"
```

---

### Task 4: Storybook interaction test + changeset + full verification

**Files:**

- Modify: `packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.stories.tsx`
- Create: `.changeset/narrative-pedigree-zoom.md`

**Interfaces:**

- Consumes: the rendered `NarrativePedigreeView` (which now includes the toolbar and `data-testid="np-zoom-content"`).

- [ ] **Step 1: Add the interaction-test story**

In `NarrativePedigreeView.stories.tsx`, add the import at the top of the import block:

```tsx
import { expect, userEvent, within } from 'storybook/test';
```

Then append a new story after `Default` (at the end of the file):

```tsx
export const Zoom: Story = {
  args: { stage: narrativeStage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const content = canvasElement.querySelector<HTMLElement>(
      '[data-testid="np-zoom-content"]',
    );

    expect(content?.getAttribute('data-zoom-level')).toBe('1');

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Zoom in' }),
    );
    expect(Number(content?.getAttribute('data-zoom-level'))).toBeGreaterThan(1);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Reset zoom' }),
    );
    expect(content?.getAttribute('data-zoom-level')).toBe('1');
  },
};
```

- [ ] **Step 2: Verify the story renders and the interaction passes**

The Storybook (chromium) vitest project is CI-only and can flake locally (see the "interview vitest: units vs storybook" note). Verify the story visually instead: start Storybook and confirm the toolbar renders bottom-right and the buttons zoom the pedigree.

Run: `pnpm --filter @codaco/interview storybook`
Then open `NarrativePedigree/NarrativePedigreeView → Zoom`, click Zoom in/out/Reset, and confirm the pedigree scales and recenters. Stop Storybook when done.

(If you choose to run the interaction test headless: `pnpm --filter @codaco/interview test -- --project storybook NarrativePedigreeView` — treat a first-run flake as non-blocking and re-run once.)

- [ ] **Step 3: Add the changeset**

Create `.changeset/narrative-pedigree-zoom.md`:

```md
---
'@codaco/interview': minor
---

Add zoom in, zoom out and reset controls to the NarrativePedigree interface via a floating toolbar.
```

- [ ] **Step 4: Full verification pass**

Run, in order, and confirm each is clean:

```bash
pnpm --filter @codaco/interview test -- --project units
pnpm --filter @codaco/interview typecheck
pnpm knip
```

Expected: units green; no type errors; knip reports no new unused exports/dependencies (every `zoom.ts` export is consumed by `ZoomableViewport`).

- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/interfaces/NarrativePedigree/components/NarrativePedigreeView.stories.tsx .changeset/narrative-pedigree-zoom.md
git commit -m "test(narrative-pedigree): interaction test + changeset for zoom controls"
```

---

## Self-Review

**Spec coverage:**

- Mechanism (scale + 3-layer sizer) → Task 2 ✓
- Controls (in/out/separator/reset, 0.5–2.0, ×1.25, disabled at bounds) → Task 1 (arithmetic) + Task 2 (toolbar) ✓
- Reset → 1.0 + recenter → Task 1 `centeredScrollLeft` + Task 2 reset branch ✓
- Zoom-to-centre → Task 1 `scaleAroundCenter` + Task 2 anchor branch ✓
- No-overlap padding → Task 2 scroll-container `pr-6 pb-24` ✓
- Isolation (`ZoomableViewport` extracted; view stays lean) → Task 2 + Task 3 ✓
- View-local, ephemeral, no schema change → Task 2 (state), Task 3 (no schema touched) ✓
- A11y (aria-labels, disabled, toolbar roving focus) → Task 2 (SegmentedToolbar labels) ✓
- Motion: instant zoom satisfies reduced-motion → Task 2 note ✓
- Out of scope respected (buttons only, initial view unchanged, FamilyPedigree untouched) → Global Constraints ✓
- Testing (pure helper unit tests + story interaction) → Task 1 + Task 4 ✓
- Changeset → Task 4 ✓

**Type consistency:** `zoomIn`/`zoomOut`/`canZoomIn`/`canZoomOut`/`scaleAroundCenter`/`clampScroll`/`centeredScrollLeft`/`DEFAULT_ZOOM` names match between `zoom.ts` (Task 1) and `ZoomableViewport.tsx` (Task 2). `ZoomableViewportProps` (`children`, `toolbarLabel`, `onBackgroundClick`, `onEscape`) match between Task 2 and Task 3. `data-testid="np-zoom-content"` + `data-zoom-level` match between Task 2 and the Task 4 play test.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has an expected result.
