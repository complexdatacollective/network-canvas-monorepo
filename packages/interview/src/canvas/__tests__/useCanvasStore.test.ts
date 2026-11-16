import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { edgeInsetForNode, FALLBACK_NODE_RADIUS } from '../layoutGeometry';
import { createCanvasStore } from '../useCanvasStore';

vi.mock('../../store/modules/session', () => ({
  updateNode: (patch: unknown) => patch,
}));

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

describe('useCanvasStore syncFromNodes', () => {
  const nodeWith = (id: string, layout: VariableValue | undefined): NcNode => ({
    [entityPrimaryKeyProperty]: id,
    [entityAttributesProperty]: layout === undefined ? {} : { layout },
    type: 'person',
    promptIDs: [],
    stageId: '',
  });

  it('places only the nodes whose layout value is a position', () => {
    const store = createCanvasStore();
    store.getState().setCanvasDimensions(DIMS);
    store.getState().syncFromNodes(
      [
        nodeWith('placed', { x: 0.5, y: 0.5 }),
        nodeWith('text', 'x'),
        nodeWith('list', [0.5, 0.5]),
        nodeWith('number', 0.5),
        nodeWith('half', { x: 0.5 } as unknown as VariableValue),
        nodeWith('wrong-type', {
          x: '0.5',
          y: 0.5,
        } as unknown as VariableValue),
        nodeWith('none', undefined),
      ],
      'layout',
    );

    expect([...store.getState().positions.keys()]).toEqual(['placed']);
  });

  it('adds a position for a new node only when its layout value is a position', () => {
    const store = createCanvasStore();
    store.getState().setCanvasDimensions(DIMS);
    store
      .getState()
      .syncNewFromNodes(
        [
          nodeWith('placed', { x: 0.5, y: 0.5 }),
          nodeWith('text', 'x'),
          nodeWith('half', { x: 0.5 } as unknown as VariableValue),
        ],
        'layout',
      );

    expect([...store.getState().positions.keys()]).toEqual(['placed']);
  });
});

describe('useCanvasStore syncToRedux', () => {
  it('clamps the positions it saves to the canvas inset', () => {
    const store = createCanvasStore();
    store.getState().setCanvasDimensions(DIMS);
    const dispatch = vi.fn();

    store
      .getState()
      .syncToRedux(
        dispatch,
        'layout',
        0,
        new Map([['a', { x: 1.2, y: -0.1 }]]),
      );

    const inset = edgeInsetForNode(FALLBACK_NODE_RADIUS);
    expect(dispatch).toHaveBeenCalledWith({
      nodeId: 'a',
      attributePatch: {
        set: {
          layout: { x: 1 - inset / DIMS.width, y: inset / DIMS.height },
        },
        unset: [],
      },
      currentStep: 0,
    });
  });
});
