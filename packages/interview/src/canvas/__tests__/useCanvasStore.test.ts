import { describe, expect, it } from 'vitest';

import { edgeInsetForNode, FALLBACK_NODE_RADIUS } from '../layoutGeometry';
import { createCanvasStore } from '../useCanvasStore';

const DIMS = { width: 1000, height: 500 };

// The measured radius at the largest type scale (viewport ramp cap x the
// participant text-size control) exceeds the fallback — the case the
// radius-aware clamp exists for.
const MEASURED_RADIUS = 78;

describe('useCanvasStore boundary clamp', () => {
  it('insets by the fallback radius until a measurement arrives', () => {
    const store = createCanvasStore();
    store.getState().setCanvasDimensions(DIMS);
    store.getState().setPosition('a', { x: 1, y: 1 });

    const inset = edgeInsetForNode(FALLBACK_NODE_RADIUS);
    const pos = store.getState().positions.get('a')!;
    expect(pos.x).toBeCloseTo(1 - inset / DIMS.width, 10);
    expect(pos.y).toBeCloseTo(1 - inset / DIMS.height, 10);
  });

  it('clamps placements by the measured radius once set', () => {
    const store = createCanvasStore();
    store.getState().setCanvasDimensions(DIMS);
    store.getState().setNodeRadius(MEASURED_RADIUS);
    store.getState().setPosition('a', { x: 0, y: 0 });

    const inset = edgeInsetForNode(MEASURED_RADIUS);
    const pos = store.getState().positions.get('a')!;
    expect(pos.x).toBeCloseTo(inset / DIMS.width, 10);
    expect(pos.y).toBeCloseTo(inset / DIMS.height, 10);
  });

  it('re-clamps existing positions when the measured radius grows', () => {
    const store = createCanvasStore();
    store.getState().setCanvasDimensions(DIMS);
    // Placed while only the fallback radius was known: sits at the old edge.
    store.getState().setPosition('a', { x: 1, y: 1 });

    store.getState().setNodeRadius(MEASURED_RADIUS);

    const inset = edgeInsetForNode(MEASURED_RADIUS);
    const pos = store.getState().positions.get('a')!;
    expect(pos.x).toBeCloseTo(1 - inset / DIMS.width, 10);
    expect(pos.y).toBeCloseTo(1 - inset / DIMS.height, 10);
  });

  it('falls back for a non-positive (unmeasured) radius', () => {
    const store = createCanvasStore();
    store.getState().setNodeRadius(MEASURED_RADIUS);
    store.getState().setNodeRadius(0);
    expect(store.getState().nodeRadius).toBe(FALLBACK_NODE_RADIUS);
  });

  it('does not rebuild positions when the radius is unchanged', () => {
    const store = createCanvasStore();
    store.getState().setCanvasDimensions(DIMS);
    store.getState().setPosition('a', { x: 0.5, y: 0.5 });

    const before = store.getState().positions;
    store.getState().setNodeRadius(FALLBACK_NODE_RADIUS);
    expect(store.getState().positions).toBe(before);
  });
});
