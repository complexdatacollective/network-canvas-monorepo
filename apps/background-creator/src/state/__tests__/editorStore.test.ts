import { beforeEach, describe, expect, it } from 'vitest';

import { zonesOf } from '~/geometry/zones';
import type {
  BackgroundDocument,
  RectElement,
  SvgElement,
  TextElement,
} from '~/model/types';

import {
  newTextCoalesceKey,
  nextZoneLabel,
  useEditorStore,
} from '../editorStore';

const store = useEditorStore;
const state = () => store.getState();

function blankDoc(): BackgroundDocument {
  return {
    version: 1,
    title: 'Test',
    description: 'Test document',
    elements: [],
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
    zoneLabel: null,
    ...over,
  };
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
    store.setState({ selection: { id: 'a' } });
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
    store.setState({ selection: { id: 'r' } });

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
      expect(el.zoneLabel).toBeNull();
    }
    expect(state().selection).toEqual({ id: el?.id });
    expect(state().draft).toBeNull();
    expect(state().announcement.message).toBe(
      'Rectangle added. Select tool active',
    );
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
      expect(el.zoneLabel).toBeNull();
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
      // Drawn lines default to the theme text colour sentinel.
      expect(el.stroke).toBe('text');
    }
  });

  it('discards a degenerate drag without adding an element', () => {
    state().beginDraft('rect', { x: 0.3, y: 0.3 });
    state().updateDraft({ x: 0.302, y: 0.301 });
    state().commitDraft();
    expect(state().doc.elements).toHaveLength(0);
    expect(state().draft).toBeNull();
  });

  it('reverts the active tool to select after a successful commit', () => {
    state().setTool('rect');
    state().beginDraft('rect', { x: 0.1, y: 0.1 });
    state().updateDraft({ x: 0.5, y: 0.4 });
    state().commitDraft();
    expect(state().activeTool).toBe('select');
  });

  it('keeps the draw tool when a degenerate draft is discarded', () => {
    state().setTool('rect');
    state().beginDraft('rect', { x: 0.3, y: 0.3 });
    state().updateDraft({ x: 0.302, y: 0.301 });
    state().commitDraft();
    expect(state().activeTool).toBe('rect');
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

describe('shift-constrained draws', () => {
  it('constrains an ellipse to a visual circle at the stage aspect', () => {
    state().beginDraft('ellipse', { x: 0.2, y: 0.2 });
    // Stage 200×100 (aspect 2): dx=0.2 → constrained dy=0.4, so rx·200 == ry·100.
    state().updateDraft({ x: 0.4, y: 0.9 }, { width: 200, height: 100 });
    state().commitDraft();
    const el = state().doc.elements[0];
    if (el?.kind === 'ellipse') {
      expect(el.rx).toBeCloseTo(0.1);
      expect(el.ry).toBeCloseTo(0.2);
      expect(el.rx * 200).toBeCloseTo(el.ry * 100);
    }
  });

  it('constrains a rect to a visual square at the stage aspect', () => {
    state().beginDraft('rect', { x: 0.2, y: 0.2 });
    state().updateDraft({ x: 0.4, y: 0.9 }, { width: 200, height: 100 });
    state().commitDraft();
    const el = state().doc.elements[0];
    if (el?.kind === 'rect') {
      expect(el.width * 200).toBeCloseTo(el.height * 100);
    }
  });

  it('snaps a shift-drawn line to a 45° increment', () => {
    state().beginDraft('line', { x: 0.3, y: 0.5 });
    // A shallow drag on a square stage snaps to horizontal.
    state().updateDraft({ x: 0.8, y: 0.56 }, { width: 100, height: 100 });
    state().commitDraft();
    const el = state().doc.elements[0];
    if (el?.kind === 'line') {
      expect(el.y2).toBeCloseTo(el.y1);
      expect(el.x2).toBeGreaterThan(el.x1);
    }
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
      expect(el.zoneLabel).toBeNull();
    }
    expect(state().draft).toBeNull();
  });

  it('reverts the active tool to select after closing a polygon', () => {
    state().setTool('polygon');
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().closeDraftPolygon();
    expect(state().activeTool).toBe('select');
  });

  it('refuses to close with fewer than three points and announces why', () => {
    state().setTool('polygon');
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().closeDraftPolygon();
    expect(state().doc.elements).toHaveLength(0);
    expect(state().draft).not.toBeNull();
    expect(state().activeTool).toBe('polygon');
    expect(state().announcement.message).toBe(
      'A shape needs at least three points.',
    );
  });

  it('refuses a close on the first vertex with only two distinct points', () => {
    state().setTool('polygon');
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    // Double-click lands on the FIRST vertex: [start, other, start].
    state().addDraftPoint({ x: 0.2, y: 0.2 });
    state().closeDraftPolygon();
    expect(state().doc.elements).toHaveLength(0);
    expect(state().activeTool).toBe('polygon');
  });

  it('drops a closing press on the first vertex from a valid polygon', () => {
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().addDraftPoint({ x: 0.2, y: 0.2 });
    state().closeDraftPolygon();
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('polygon');
    if (el?.kind === 'polygon') {
      expect(el.points).toHaveLength(3);
    }
  });

  it('persists the trimmed draft when a double-click close is refused', () => {
    state().setTool('polygon');
    state().beginDraft('polygon', { x: 0.2, y: 0.2 });
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    // The refused double-click leaves its duplicate press behind.
    state().addDraftPoint({ x: 0.6, y: 0.3 });
    state().closeDraftPolygon();
    const draft = state().draft;
    expect(draft?.mode === 'polygon' && draft.points).toHaveLength(2);

    // Continuing after the refusal must not bake a zero-length edge into the
    // eventually-committed polygon.
    state().addDraftPoint({ x: 0.4, y: 0.7 });
    state().closeDraftPolygon();
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('polygon');
    if (el?.kind === 'polygon') {
      expect(el.points).toHaveLength(3);
    }
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

describe('nextZoneLabel', () => {
  it('starts at zone-1 and fills the lowest unused index', () => {
    expect(nextZoneLabel([])).toBe('zone-1');
    expect(
      nextZoneLabel([
        rect('a', { zoneLabel: 'zone-1' }),
        rect('b', { zoneLabel: 'zone-3' }),
      ]),
    ).toBe('zone-2');
  });
});

describe('zone marking via updateElement', () => {
  it('marks and unmarks an element as a zone', () => {
    reset({ ...blankDoc(), elements: [rect('r')] });
    state().updateElement('r', { zoneLabel: 'inner' });
    const marked = state().doc.elements[0];
    if (marked?.kind === 'rect') expect(marked.zoneLabel).toBe('inner');
    expect(zonesOf(state().doc)).toHaveLength(1);

    state().updateElement('r', { zoneLabel: null });
    const unmarked = state().doc.elements[0];
    if (unmarked?.kind === 'rect') expect(unmarked.zoneLabel).toBeNull();
    expect(zonesOf(state().doc)).toHaveLength(0);
  });

  it('coalesces zone-label edits into one history step', () => {
    reset({ ...blankDoc(), elements: [rect('r', { zoneLabel: 'a' })] });
    state().updateElement(
      'r',
      { zoneLabel: 'ab' },
      { coalesceKey: 'zone-label:r' },
    );
    state().updateElement(
      'r',
      { zoneLabel: 'abc' },
      { coalesceKey: 'zone-label:r' },
    );
    expect(state().past).toHaveLength(1);
    const el = state().doc.elements[0];
    if (el?.kind === 'rect') expect(el.zoneLabel).toBe('abc');
  });
});

describe('moveSelectedBy', () => {
  it('clamps so the shape cannot leave the top-left', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0, y: 0 })] });
    store.setState({ selection: { id: 'r' } });
    state().moveSelectedBy(-0.5, -0.5);
    const el = state().doc.elements[0];
    if (el?.kind === 'rect') {
      expect(el.x).toBeCloseTo(0);
      expect(el.y).toBeCloseTo(0);
    }
  });

  it('clamps so the shape cannot leave the bottom-right', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0.7, y: 0.7 })] });
    store.setState({ selection: { id: 'r' } });
    state().moveSelectedBy(0.9, 0.9);
    const el = state().doc.elements[0];
    if (el?.kind === 'rect') {
      expect(el.x).toBeCloseTo(0.8);
      expect(el.y).toBeCloseTo(0.8);
    }
  });

  it('does not push history for a fully-clamped no-op nudge', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0, y: 0 })] });
    store.setState({ selection: { id: 'r' } });
    state().moveSelectedBy(-0.1, 0);
    expect(state().past).toHaveLength(0);
  });

  it('coalesces a burst of nudges into one history step', () => {
    reset({ ...blankDoc(), elements: [rect('r', { x: 0.4, y: 0.4 })] });
    store.setState({ selection: { id: 'r' } });
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
    zoneLabel: null,
  };
}

describe('translation of an oversized shape', () => {
  it('does not teleport when nudged further into the overflow', () => {
    reset({ ...blankDoc(), elements: [oversizedEllipse()] });
    store.setState({ selection: { id: 'e' } });
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
    store.setState({ selection: { id: 'e' } });
    state().moveSelectedBy(-0.01, 0);
    const el = state().doc.elements[0];
    if (el?.kind === 'ellipse') {
      expect(el.cx).toBeCloseTo(0.89);
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
    store.setState({ selection: { id: 'a' } });
    state().reorderSelected('backward');
    expect(state().doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(state().announcement.message).toBe('Already at the back');
  });

  it('refuses to move the front element further forward', () => {
    store.setState({ selection: { id: 'c' } });
    state().reorderSelected('forward');
    expect(state().doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(state().announcement.message).toBe('Already at the front');
  });

  it('moves a middle element forward', () => {
    store.setState({ selection: { id: 'b' } });
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
    store.setState({ selection: { id: 'r' } });
    state().setTool('rect');
    expect(state().selection).toBeNull();
  });

  it('keeps selection when the tool stays select', () => {
    store.setState({ selection: { id: 'r' } });
    state().setTool('select');
    expect(state().selection).toEqual({ id: 'r' });
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

  it('patches a text element to a new size token and sentinel fill', () => {
    reset();
    const id = state().createTextAt({ x: 0.5, y: 0.5 });
    state().updateElement(id, { fontSize: 'extra-large', fill: 'background' });
    const el = state().doc.elements[0];
    if (el?.kind === 'text') {
      expect(el.fontSize).toBe('extra-large');
      expect(el.fill).toBe('background');
    }
  });
});

describe('createTextAt and deleteSelected', () => {
  it('places a text element, selects it, and returns its id', () => {
    const id = state().createTextAt({ x: 0.5, y: 0.5 });
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('text');
    expect(el?.id).toBe(id);
    const text = el?.kind === 'text' ? el : null;
    expect(text?.lines).toEqual<TextElement['lines']>(['Text']);
    // New text defaults to the theme text colour at the medium size token.
    expect(text?.fill).toBe('text');
    expect(text?.fontSize).toBe('medium');
    expect(state().selection).toEqual({ id });
    expect(state().announcement.message).toBe('Text added');
  });

  it('deletes the selected element and clears selection', () => {
    reset({ ...blankDoc(), elements: [rect('r')] });
    store.setState({ selection: { id: 'r' } });
    state().deleteSelected();
    expect(state().doc.elements).toHaveLength(0);
    expect(state().selection).toBeNull();
    expect(state().announcement.message).toBe('Rectangle deleted');
  });
});

describe('discardNewText', () => {
  it('reverts a just-created placeholder cleanly', () => {
    const id = state().createTextAt({ x: 0.5, y: 0.5 });
    expect(state().past).toHaveLength(1);
    state().discardNewText(id);
    expect(state().doc.elements).toHaveLength(0);
    expect(state().past).toHaveLength(0);
    expect(state().selection).toBeNull();
  });
});

describe('nudge coalescing boundaries', () => {
  it('separates nudge bursts once resetCoalescing runs between them', () => {
    reset({ ...blankDoc(), elements: [rect('r')] });
    store.setState({ selection: { id: 'r' } });
    state().moveSelectedBy(0.01, 0);
    state().moveSelectedBy(0.01, 0);
    expect(state().past).toHaveLength(1);
    // Arrow-key release ends the burst.
    state().resetCoalescing();
    state().moveSelectedBy(0.01, 0);
    expect(state().past).toHaveLength(2);
    state().undo();
    const el = state().doc.elements[0];
    // Undo reverts only the second burst.
    if (el?.kind === 'rect') expect(el.x).toBeCloseTo(0.12);
  });
});

describe('new-text creation coalescing', () => {
  it('folds the first label edit into the creation entry so one undo removes the element', () => {
    const id = state().createTextAt({ x: 0.5, y: 0.5 });
    state().updateElement(
      id,
      { lines: ['Hello'] },
      { coalesceKey: newTextCoalesceKey(id) },
    );
    expect(state().past).toHaveLength(1);
    const el = state().doc.elements[0];
    expect(el?.kind === 'text' && el.lines).toEqual(['Hello']);
    state().undo();
    expect(state().doc.elements).toHaveLength(0);
  });

  it('keeps a later re-edit of the same element as its own undo step', () => {
    const id = state().createTextAt({ x: 0.5, y: 0.5 });
    state().updateElement(
      id,
      { lines: ['Hello'] },
      { coalesceKey: newTextCoalesceKey(id) },
    );
    state().updateElement(id, { lines: ['Hello again'] });
    expect(state().past).toHaveLength(2);
    state().undo();
    const el = state().doc.elements[0];
    expect(el?.kind === 'text' && el.lines).toEqual(['Hello']);
  });

  it('does not fold the edit in once another action resets coalescing', () => {
    const id = state().createTextAt({ x: 0.5, y: 0.5 });
    state().select({ id });
    state().updateElement(
      id,
      { lines: ['Hello'] },
      { coalesceKey: newTextCoalesceKey(id) },
    );
    expect(state().past).toHaveLength(2);
    state().undo();
    const el = state().doc.elements[0];
    expect(el?.kind === 'text' && el.lines).toEqual(['Text']);
  });
});

describe('insertDefaultShape', () => {
  it('inserts a centred rectangle, selects it, and announces', () => {
    state().insertDefaultShape('rect');
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('rect');
    if (el?.kind === 'rect') {
      expect(el.x).toBeCloseTo(0.4);
      expect(el.y).toBeCloseTo(0.4);
      expect(el.width).toBeCloseTo(0.2);
      expect(el.height).toBeCloseTo(0.2);
    }
    expect(state().selection).toEqual({ id: el?.id });
    expect(state().announcement.message).toBe(
      'Rectangle added. Select tool active',
    );
  });

  it('inserts a default triangle for the polygon tool', () => {
    state().insertDefaultShape('polygon');
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('polygon');
    if (el?.kind === 'polygon') {
      expect(el.points).toHaveLength(3);
    }
  });

  it('inserts a default line stroked with the text sentinel', () => {
    state().insertDefaultShape('line');
    const el = state().doc.elements[0];
    expect(el?.kind).toBe('line');
    if (el?.kind === 'line') {
      expect(el.stroke).toBe('text');
    }
  });

  it('reverts the active tool to select after inserting', () => {
    state().setTool('ellipse');
    state().insertDefaultShape('ellipse');
    expect(state().activeTool).toBe('select');
  });
});

describe('new / load reset history', () => {
  it('newDocument resets history and selection', () => {
    state().commitDoc({ ...state().doc, title: 'dirty' });
    store.setState({ selection: { id: 'x' } });
    state().newDocument('quadrants');
    expect(state().past).toHaveLength(0);
    expect(state().future).toHaveLength(0);
    expect(state().selection).toBeNull();
    expect(zonesOf(state().doc)).toHaveLength(4);
  });

  it('newDocument builds the political compass with five zones', () => {
    state().newDocument('compass');
    expect(zonesOf(state().doc)).toHaveLength(5);
  });

  it('loadDocument replaces the document and resets history', () => {
    state().commitDoc({ ...state().doc, title: 'dirty' });
    const loaded: BackgroundDocument = { ...blankDoc(), title: 'Loaded' };
    state().loadDocument(loaded);
    expect(state().doc).toBe(loaded);
    expect(state().past).toHaveLength(0);
  });
});
