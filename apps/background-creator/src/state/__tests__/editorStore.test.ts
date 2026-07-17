import { beforeEach, describe, expect, it } from 'vitest';

import type {
  BackgroundDocument,
  RectElement,
  SvgElement,
  TextElement,
  Zone,
} from '~/model/types';

import { useEditorStore } from '../editorStore';

const store = useEditorStore;
const state = () => store.getState();

function blankDoc(): BackgroundDocument {
  return {
    version: 1,
    title: 'Test',
    description: 'Test document',
    elements: [],
    zones: [],
  };
}

function rect(id: string, over: Partial<RectElement> = {}): RectElement {
  return {
    id,
    kind: 'rect',
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
    ...over,
  };
}

function rectZone(id: string, label: string): Zone {
  return { id, label, shape: 'rect', x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
}

function reset(doc: BackgroundDocument = blankDoc()): void {
  store.setState({
    doc,
    selection: null,
    activeTool: 'select',
    draft: null,
    zonesVisible: true,
    previewAspect: 'fill',
    previewSurface: 'interview',
    past: [],
    future: [],
    announcement: { message: '', seq: 0 },
    lastCoalesceKey: null,
    gestureSnapshot: null,
  });
}

beforeEach(() => reset());

describe('history', () => {
  it('pushes the previous document and supports undo/redo', () => {
    const first = state().doc;
    const second: BackgroundDocument = { ...first, title: 'Second' };
    state().commitDoc(second);

    expect(state().doc.title).toBe('Second');
    expect(state().past).toHaveLength(1);

    state().undo();
    expect(state().doc).toBe(first);
    expect(state().future).toHaveLength(1);

    state().redo();
    expect(state().doc.title).toBe('Second');
    expect(state().future).toHaveLength(0);
  });

  it('collapses commits that share a coalesce key into one step', () => {
    const base = state().doc;
    state().commitDoc({ ...base, title: 'a' }, { coalesceKey: 'k' });
    state().commitDoc({ ...base, title: 'ab' }, { coalesceKey: 'k' });

    expect(state().past).toHaveLength(1);
    expect(state().doc.title).toBe('ab');

    state().undo();
    expect(state().doc).toBe(base);
  });

  it('resets coalescing when a keyless commit intervenes', () => {
    const base = state().doc;
    state().commitDoc({ ...base, title: 'a' }, { coalesceKey: 'k' });
    state().commitDoc({ ...base, title: 'b' });
    state().commitDoc({ ...base, title: 'c' }, { coalesceKey: 'k' });
    expect(state().past).toHaveLength(3);
  });

  it('caps history at 100 entries', () => {
    for (let i = 0; i < 105; i += 1) {
      state().commitDoc({ ...state().doc, title: String(i) });
    }
    expect(state().past).toHaveLength(100);
  });

  it('undo/redo report availability and clear selection', () => {
    expect(state().canUndo()).toBe(false);
    state().commitDoc({ ...state().doc, title: 'x' });
    store.setState({ selection: { id: 'a', type: 'element' } });
    expect(state().canUndo()).toBe(true);
    state().undo();
    expect(state().selection).toBeNull();
    expect(state().canRedo()).toBe(true);
  });
});

describe('gestures', () => {
  it('commits the whole gesture as a single history step', () => {
    state().beginGesture();
    state().updateGesture((d) => ({ ...d, title: 'x' }));
    state().updateGesture((d) => ({ ...d, title: 'y' }));
    state().endGesture();

    expect(state().past).toHaveLength(1);
    expect(state().doc.title).toBe('y');
  });

  it('cancel restores the pre-gesture snapshot', () => {
    const before = state().doc;
    state().beginGesture();
    state().updateGesture((d) => ({ ...d, title: 'z' }));
    state().cancelGesture();
    expect(state().doc).toBe(before);
    expect(state().past).toHaveLength(0);
  });

  it('does not push history when the gesture changed nothing', () => {
    state().beginGesture();
    state().endGesture();
    expect(state().past).toHaveLength(0);
  });

  it('does not push history when a gesture rebuilds the doc without changing values', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0 })] });
    state().beginGesture();
    // A fully-clamped drag rebuilds every object with identical values.
    state().updateGesture((d) => ({
      ...d,
      elements: d.elements.map((el) => ({ ...el })),
    }));
    state().endGesture();
    expect(state().past).toHaveLength(0);
    expect(state().gestureSnapshot).toBeNull();
  });

  it('keeps undo order when a commit fires mid-gesture', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0.1 })] });
    store.setState({ selection: { id: 'r', type: 'element' } });

    state().beginGesture();
    // Mid-drag the shape moves; then a keyboard Delete commits through history.
    state().updateGesture((d) => ({
      ...d,
      elements: d.elements.map((el) =>
        el.kind === 'rect' ? { ...el, x: 0.3 } : el,
      ),
    }));
    state().deleteSelected();
    state().endGesture();

    expect(state().doc.elements).toHaveLength(0);
    expect(state().past).toHaveLength(1);

    state().undo();
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('rect');
    // Undo restores the deletion only — landing on the mid-gesture position,
    // not the stale pre-gesture snapshot.
    if (el?.kind === 'rect') {
      expect(el.x).toBeCloseTo(0.3);
    }
  });
});

describe('draft commit', () => {
  it('creates a rectangle from a corner drag', () => {
    state().beginDraft('rect', { x: 0.1, y: 0.1 });
    state().updateDraft({ x: 0.5, y: 0.4 });
    state().commitDraft();

    const el = state().doc.elements[0];
    expect(el?.kind).toBe('rect');
    if (el?.kind === 'rect') {
      expect(el.x).toBeCloseTo(0.1);
      expect(el.y).toBeCloseTo(0.1);
      expect(el.width).toBeCloseTo(0.4);
      expect(el.height).toBeCloseTo(0.3);
      expect(el.fillOpacity).toBeCloseTo(0.25);
      expect(el.strokeWidth).toBe(3);
    }
    expect(state().selection).toEqual({ id: el?.id, type: 'element' });
    expect(state().draft).toBeNull();
    expect(state().announcement.message).toBe('Rectangle added');
  });

  it('normalizes a drag drawn up-and-left', () => {
    state().beginDraft('rect', { x: 0.6, y: 0.6 });
    state().updateDraft({ x: 0.2, y: 0.3 });
    state().commitDraft();
    const el = state().doc.elements[0];
    if (el?.kind === 'rect') {
      expect(el.x).toBeCloseTo(0.2);
      expect(el.y).toBeCloseTo(0.3);
      expect(el.width).toBeCloseTo(0.4);
      expect(el.height).toBeCloseTo(0.3);
    }
  });

  it('creates an ellipse from the drag bounding box', () => {
    state().beginDraft('ellipse', { x: 0.1, y: 0.1 });
    state().updateDraft({ x: 0.5, y: 0.4 });
    state().commitDraft();
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('ellipse');
    if (el?.kind === 'ellipse') {
      expect(el.cx).toBeCloseTo(0.3);
      expect(el.cy).toBeCloseTo(0.25);
      expect(el.rx).toBeCloseTo(0.2);
      expect(el.ry).toBeCloseTo(0.15);
    }
  });

  it('creates a line from start to current', () => {
    state().beginDraft('line', { x: 0.2, y: 0.3 });
    state().updateDraft({ x: 0.7, y: 0.8 });
    state().commitDraft();
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('line');
    if (el?.kind === 'line') {
      expect(el.x1).toBeCloseTo(0.2);
      expect(el.y1).toBeCloseTo(0.3);
      expect(el.x2).toBeCloseTo(0.7);
      expect(el.y2).toBeCloseTo(0.8);
      expect(el.startArrow).toBe(false);
      expect(el.endArrow).toBe(false);
    }
  });

  it('creates a circle zone centred at the drag start with radius = distance', () => {
    state().beginDraft('zone-circle', { x: 0.5, y: 0.5 });
    state().updateDraft({ x: 0.7, y: 0.5 });
    state().commitDraft();
    const zone = state().doc.zones[0];
    expect(zone?.shape).toBe('circle');
    if (zone?.shape === 'circle') {
      expect(zone.cx).toBeCloseTo(0.5);
      expect(zone.cy).toBeCloseTo(0.5);
      expect(zone.r).toBeCloseTo(0.2);
      expect(zone.label).toBe('zone-1');
    }
  });

  it('creates a rect zone with an auto label', () => {
    state().beginDraft('zone-rect', { x: 0.1, y: 0.1 });
    state().updateDraft({ x: 0.4, y: 0.4 });
    state().commitDraft();
    const zone = state().doc.zones[0];
    expect(zone?.shape).toBe('rect');
    expect(zone?.label).toBe('zone-1');
    expect(state().announcement.message).toBe('Zone "zone-1" added');
  });

  it('discards a degenerate drag without adding an element', () => {
    state().beginDraft('rect', { x: 0.3, y: 0.3 });
    state().updateDraft({ x: 0.302, y: 0.301 });
    state().commitDraft();
    expect(state().doc.elements).toHaveLength(0);
    expect(state().draft).toBeNull();
  });

  it('records exactly one history step per created shape', () => {
    state().beginDraft('rect', { x: 0.1, y: 0.1 });
    state().updateDraft({ x: 0.5, y: 0.4 });
    state().commitDraft();
    expect(state().past).toHaveLength(1);
    state().undo();
    expect(state().doc.elements).toHaveLength(0);
  });
});

describe('polygon draft', () => {
  it('creates a polygon element from three points', () => {
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().closeDraftPolygon();
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('polygon');
    if (el?.kind === 'polygon') {
      expect(el.points).toHaveLength(3);
    }
    expect(state().draft).toBeNull();
  });

  it('creates a polygon zone from three points', () => {
    state().beginDraft('zone-polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().closeDraftPolygon();
    const zone = state().doc.zones[0];
    expect(zone?.shape).toBe('polygon');
    expect(zone?.label).toBe('zone-1');
  });

  it('refuses to close with fewer than three points and announces why', () => {
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().closeDraftPolygon();
    expect(state().doc.elements).toHaveLength(0);
    expect(state().draft).not.toBeNull();
    expect(state().announcement.message).toBe(
      'A shape needs at least three points.',
    );
  });

  it('drops a trailing duplicate vertex from a double-click close', () => {
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().closeDraftPolygon();
    const el = state().doc.elements[0];
    if (el?.kind === 'polygon') {
      expect(el.points).toHaveLength(3);
    }
  });

  it('drops every trailing duplicate from a double-click on the last vertex', () => {
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    // A double-click on the last vertex fires two extra near-duplicate points.
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().closeDraftPolygon();
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('polygon');
    if (el?.kind === 'polygon') {
      expect(el.points).toEqual([
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.3 },
        { x: 0.4, y: 0.7 },
      ]);
    }
  });
});

describe('zone auto-labelling', () => {
  it('fills the lowest unused positive index', () => {
    reset({ ...blankDoc(), zones: [rectZone('a', 'zone-2')] });
    state().beginDraft('zone-rect', { x: 0.1, y: 0.1 });
    state().updateDraft({ x: 0.4, y: 0.4 });
    state().commitDraft();
    expect(state().doc.zones[1]?.label).toBe('zone-1');
  });

  it('skips existing labels', () => {
    reset({
      ...blankDoc(),
      zones: [rectZone('a', 'zone-1'), rectZone('b', 'zone-2')],
    });
    state().beginDraft('zone-rect', { x: 0.1, y: 0.1 });
    state().updateDraft({ x: 0.4, y: 0.4 });
    state().commitDraft();
    expect(state().doc.zones[2]?.label).toBe('zone-3');
  });
});

describe('moveSelectedBy', () => {
  it('clamps so the shape cannot leave the top-left', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0, y: 0 })] });
    store.setState({ selection: { id: 'r', type: 'element' } });
    state().moveSelectedBy(-0.5, -0.5);
    const el = state().doc.elements[0];
    if (el?.kind === 'rect') {
      expect(el.x).toBeCloseTo(0);
      expect(el.y).toBeCloseTo(0);
    }
  });

  it('clamps so the shape cannot leave the bottom-right', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0.7, y: 0.7 })] });
    store.setState({ selection: { id: 'r', type: 'element' } });
    state().moveSelectedBy(0.9, 0.9);
    const el = state().doc.elements[0];
    if (el?.kind === 'rect') {
      expect(el.x).toBeCloseTo(0.8);
      expect(el.y).toBeCloseTo(0.8);
    }
  });

  it('does not push history for a fully-clamped no-op nudge', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0, y: 0 })] });
    store.setState({ selection: { id: 'r', type: 'element' } });
    state().moveSelectedBy(-0.1, 0);
    expect(state().past).toHaveLength(0);
  });

  it('coalesces a burst of nudges into one history step', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0.4, y: 0.4 })] });
    store.setState({ selection: { id: 'r', type: 'element' } });
    state().moveSelectedBy(0.01, 0);
    state().moveSelectedBy(0.01, 0);
    state().moveSelectedBy(0.01, 0);
    expect(state().past).toHaveLength(1);
  });
});

// An ellipse wider than the canvas on the x-axis: minX = 0.1, maxX = 1.7. Its
// box can never fit, so the raw clamp range would invert. cy/ry keep y in range.
function oversizedEllipse(): SvgElement {
  return {
    id: 'e',
    kind: 'ellipse',
    cx: 0.9,
    cy: 0.5,
    rx: 0.8,
    ry: 0.2,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
  };
}

describe('translation of an oversized shape', () => {
  it('does not teleport when nudged further into the overflow', () => {
    reset({ ...blankDoc(), elements: [oversizedEllipse()] });
    store.setState({ selection: { id: 'e', type: 'element' } });
    state().moveSelectedBy(0.01, 0);
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('ellipse');
    if (el?.kind === 'ellipse') {
      // Moving right would push the box further off-canvas, so it holds still —
      // no forced jump to a clamped position.
      expect(el.cx).toBeCloseTo(0.9);
    }
    // A no-op move must not record history.
    expect(state().past).toHaveLength(0);
  });

  it('moves toward fitting when nudged the other way', () => {
    reset({ ...blankDoc(), elements: [oversizedEllipse()] });
    store.setState({ selection: { id: 'e', type: 'element' } });
    state().moveSelectedBy(-0.01, 0);
    const el = state().doc.elements[0];
    if (el?.kind === 'ellipse') {
      expect(el.cx).toBeCloseTo(0.89);
    }
  });

  it('holds a circle zone still when nudged into its overflow', () => {
    reset({
      ...blankDoc(),
      zones: [
        { id: 'z', label: 'zone-1', shape: 'circle', cx: 0.9, cy: 0.5, r: 0.8 },
      ],
    });
    store.setState({ selection: { id: 'z', type: 'zone' } });
    state().moveSelectedBy(0.01, 0);
    const zone = state().doc.zones[0];
    if (zone?.shape === 'circle') {
      expect(zone.cx).toBeCloseTo(0.9);
    }
  });
});

describe('reorderSelected', () => {
  beforeEach(() => {
    reset({
      ...blankDoc(),
      elements: [rect('a'), rect('b'), rect('c')],
    });
  });

  it('refuses to move the back element further back', () => {
    store.setState({ selection: { id: 'a', type: 'element' } });
    state().reorderSelected('backward');
    expect(state().doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(state().announcement.message).toBe('Already at the back');
  });

  it('refuses to move the front element further forward', () => {
    store.setState({ selection: { id: 'c', type: 'element' } });
    state().reorderSelected('forward');
    expect(state().doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(state().announcement.message).toBe('Already at the front');
  });

  it('moves a middle element forward', () => {
    store.setState({ selection: { id: 'b', type: 'element' } });
    state().reorderSelected('forward');
    expect(state().doc.elements.map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('tool switching', () => {
  it('cancels an in-progress draft', () => {
    state().beginDraft('rect', { x: 0.1, y: 0.1 });
    state().setTool('ellipse');
    expect(state().draft).toBeNull();
    expect(state().activeTool).toBe('ellipse');
  });

  it('clears selection when leaving the select tool', () => {
    store.setState({ selection: { id: 'r', type: 'element' } });
    state().setTool('rect');
    expect(state().selection).toBeNull();
  });

  it('keeps selection when the tool stays select', () => {
    store.setState({ selection: { id: 'r', type: 'element' } });
    state().setTool('select');
    expect(state().selection).toEqual({ id: 'r', type: 'element' });
  });
});

describe('patches', () => {
  it('updates an element field', () => {
    reset({ ...blankDoc(), elements: [rect('r')] });
    state().updateElement('r', { fill: '#123456', fillOpacity: 0.5 });
    const el = state().doc.elements[0];
    if (el?.kind === 'rect') {
      expect(el.fill).toBe('#123456');
      expect(el.fillOpacity).toBe(0.5);
    }
  });

  it('coalesces label edits on a zone', () => {
    reset({ ...blankDoc(), zones: [rectZone('z', 'zone-1')] });
    state().updateZone('z', { label: 'a' }, { coalesceKey: 'label:z' });
    state().updateZone('z', { label: 'ab' }, { coalesceKey: 'label:z' });
    expect(state().past).toHaveLength(1);
    expect(state().doc.zones[0]?.label).toBe('ab');
  });
});

describe('createTextAt and deleteSelected', () => {
  it('places a text element and selects it', () => {
    state().createTextAt({ x: 0.5, y: 0.5 });
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('text');
    const text = el?.kind === 'text' ? el : null;
    expect(text?.lines).toEqual<TextElement['lines']>(['Text']);
    expect(state().selection).toEqual({ id: el?.id, type: 'element' });
    expect(state().announcement.message).toBe('Text added');
  });

  it('deletes the selected element and clears selection', () => {
    reset({ ...blankDoc(), elements: [rect('r')] });
    store.setState({ selection: { id: 'r', type: 'element' } });
    state().deleteSelected();
    expect(state().doc.elements).toHaveLength(0);
    expect(state().selection).toBeNull();
    expect(state().announcement.message).toBe('Rectangle deleted');
  });
});

describe('new / load reset history', () => {
  it('newDocument resets history and selection', () => {
    state().commitDoc({ ...state().doc, title: 'dirty' });
    store.setState({ selection: { id: 'x', type: 'element' } });
    state().newDocument('quadrants');
    expect(state().past).toHaveLength(0);
    expect(state().future).toHaveLength(0);
    expect(state().selection).toBeNull();
    expect(state().doc.zones).toHaveLength(4);
  });

  it('loadDocument replaces the document and resets history', () => {
    state().commitDoc({ ...state().doc, title: 'dirty' });
    const loaded: BackgroundDocument = { ...blankDoc(), title: 'Loaded' };
    state().loadDocument(loaded);
    expect(state().doc).toBe(loaded);
    expect(state().past).toHaveLength(0);
  });
});
