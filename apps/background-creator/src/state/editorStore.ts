import { create } from 'zustand';

import {
  createBlankDocument,
  createConcentricCirclesTemplate,
  createPoliticalCompassDocument,
  createQuadrantsTemplate,
} from '~/model/templates';
import type {
  BackgroundDocument,
  LineElement,
  PolygonElement,
  RectElement,
  SvgElement,
  TextElement,
  Vec,
  Zone,
} from '~/model/types';

import { assertNever } from './assertNever';
import { translateElement, translateZone } from './documentGeometry';
import { elementKindLabel } from './labels';

// Single module-level store via zustand `create()`. The interview package uses
// per-instance factory stores (`createStore()` + a passed-in store handle)
// because several stage instances coexist; the Background Creator edits exactly
// one document at a time, so a module singleton is simpler and lets overlay
// components reach the same store without prop-drilling a handle.

const HISTORY_CAP = 100;
// Discarded as degenerate below this normalized extent (both drawn drags and
// created shapes); matches the resize minimum enforced by the canvas.
const MIN_EXTENT = 0.01;

export type Selection = { id: string; type: 'element' | 'zone' };

export type EditorTool =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'text'
  | 'zone-rect'
  | 'zone-circle'
  | 'zone-polygon';

export type DragDraftTool =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'zone-rect'
  | 'zone-circle';
type PolygonDraftTool = 'polygon' | 'zone-polygon';

export type Draft =
  | { mode: 'drag'; tool: DragDraftTool; start: Vec; current: Vec }
  | { mode: 'polygon'; tool: PolygonDraftTool; points: Vec[]; current: Vec };

export type PreviewAspect = 'fill' | '16:9' | '9:16' | '4:3' | '3:4' | '1:1';
export type PreviewSurface = 'interview' | 'light' | 'checker';

type Announcement = { message: string; seq: number };

// Flat optional records: every element/zone field, all optional. The union of
// per-kind partials would collapse to shared keys only, so the patch is applied
// through an explicit per-kind switch that only reads fields valid for the kind.
type ElementPatch = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: Vec[];
  fill?: string;
  fillOpacity?: number;
  stroke?: string | null;
  strokeWidth?: number;
  startArrow?: boolean;
  endArrow?: boolean;
  lines?: string[];
  fontMinPx?: number;
  fontVmin?: number;
  fontMaxPx?: number;
  fontWeight?: TextElement['fontWeight'];
  anchor?: TextElement['anchor'];
  opacity?: number;
};

type ZonePatch = {
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  r?: number;
  points?: Vec[];
};

type CommitOptions = { coalesceKey?: string };

type NewTemplate = 'blank' | 'quadrants' | 'concentric';

type EditorState = {
  doc: BackgroundDocument;
  selection: Selection | null;
  activeTool: EditorTool;
  draft: Draft | null;
  zonesVisible: boolean;
  previewAspect: PreviewAspect;
  previewSurface: PreviewSurface;
  past: BackgroundDocument[];
  future: BackgroundDocument[];
  announcement: Announcement;
  // Bookkeeping (not part of the acted-on surface).
  lastCoalesceKey: string | null;
  gestureSnapshot: BackgroundDocument | null;

  setTool: (tool: EditorTool) => void;
  select: (selection: Selection | null) => void;
  announce: (message: string) => void;

  commitDoc: (next: BackgroundDocument, opts?: CommitOptions) => void;
  updateElement: (
    id: string,
    patch: ElementPatch,
    opts?: CommitOptions,
  ) => void;
  updateZone: (id: string, patch: ZonePatch, opts?: CommitOptions) => void;
  moveSelectedBy: (dx: number, dy: number) => void;
  deleteSelected: () => void;
  reorderSelected: (direction: 'forward' | 'backward') => void;

  beginGesture: () => void;
  updateGesture: (
    mutate: (doc: BackgroundDocument) => BackgroundDocument,
  ) => void;
  endGesture: () => void;
  cancelGesture: () => void;

  beginDraft: (tool: DragDraftTool | PolygonDraftTool, at: Vec) => void;
  updateDraft: (at: Vec) => void;
  commitDraft: () => void;
  addDraftPoint: (at: Vec) => void;
  closeDraftPolygon: () => void;
  cancelDraft: () => void;
  createTextAt: (at: Vec) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  newDocument: (template: NewTemplate) => void;
  loadDocument: (doc: BackgroundDocument) => void;

  setPreviewAspect: (aspect: PreviewAspect) => void;
  setPreviewSurface: (surface: PreviewSurface) => void;
  toggleZonesVisible: () => void;
};

function findElement(
  doc: BackgroundDocument,
  id: string,
): SvgElement | undefined {
  return doc.elements.find((el) => el.id === id);
}

function findZone(doc: BackgroundDocument, id: string): Zone | undefined {
  return doc.zones.find((zone) => zone.id === id);
}

function nextZoneLabel(zones: Zone[]): string {
  const used = new Set(zones.map((zone) => zone.label));
  let n = 1;
  while (used.has(`zone-${n}`)) n += 1;
  return `zone-${n}`;
}

function bump(state: EditorState, message: string): Announcement {
  return { message, seq: state.announcement.seq + 1 };
}

// Snapshot-based history push. Consecutive commits sharing a `coalesceKey`
// collapse into one step (the pre-run snapshot is kept), so a run of live edits
// — typing a label, a keyboard-nudge burst — is a single undo. Any commit
// without a matching key resets the coalescing.
function pushed(
  state: EditorState,
  nextDoc: BackgroundDocument,
  opts?: CommitOptions,
): Pick<
  EditorState,
  'doc' | 'past' | 'future' | 'lastCoalesceKey' | 'gestureSnapshot'
> {
  const key = opts?.coalesceKey;
  const coalesce =
    key !== undefined && key === state.lastCoalesceKey && state.past.length > 0;
  return {
    doc: nextDoc,
    past: coalesce
      ? state.past
      : [...state.past, state.doc].slice(-HISTORY_CAP),
    future: [],
    lastCoalesceKey: key ?? null,
    // A real history commit supersedes any in-flight gesture: its pre-gesture
    // snapshot is now stale, so drop it. Otherwise a later endGesture would
    // append that snapshot after this commit's entry, scrambling undo order.
    gestureSnapshot: null,
  };
}

function applyElementPatch(el: SvgElement, p: ElementPatch): SvgElement {
  switch (el.kind) {
    case 'rect':
      return {
        ...el,
        ...(p.x !== undefined ? { x: p.x } : null),
        ...(p.y !== undefined ? { y: p.y } : null),
        ...(p.width !== undefined ? { width: p.width } : null),
        ...(p.height !== undefined ? { height: p.height } : null),
        ...(p.fill !== undefined ? { fill: p.fill } : null),
        ...(p.fillOpacity !== undefined
          ? { fillOpacity: p.fillOpacity }
          : null),
        ...(p.stroke !== undefined ? { stroke: p.stroke } : null),
        ...(p.strokeWidth !== undefined
          ? { strokeWidth: p.strokeWidth }
          : null),
      };
    case 'ellipse':
      return {
        ...el,
        ...(p.cx !== undefined ? { cx: p.cx } : null),
        ...(p.cy !== undefined ? { cy: p.cy } : null),
        ...(p.rx !== undefined ? { rx: p.rx } : null),
        ...(p.ry !== undefined ? { ry: p.ry } : null),
        ...(p.fill !== undefined ? { fill: p.fill } : null),
        ...(p.fillOpacity !== undefined
          ? { fillOpacity: p.fillOpacity }
          : null),
        ...(p.stroke !== undefined ? { stroke: p.stroke } : null),
        ...(p.strokeWidth !== undefined
          ? { strokeWidth: p.strokeWidth }
          : null),
      };
    case 'line':
      return {
        ...el,
        ...(p.x1 !== undefined ? { x1: p.x1 } : null),
        ...(p.y1 !== undefined ? { y1: p.y1 } : null),
        ...(p.x2 !== undefined ? { x2: p.x2 } : null),
        ...(p.y2 !== undefined ? { y2: p.y2 } : null),
        ...(p.stroke !== undefined && p.stroke !== null
          ? { stroke: p.stroke }
          : null),
        ...(p.strokeWidth !== undefined
          ? { strokeWidth: p.strokeWidth }
          : null),
        ...(p.startArrow !== undefined ? { startArrow: p.startArrow } : null),
        ...(p.endArrow !== undefined ? { endArrow: p.endArrow } : null),
      };
    case 'polygon':
      return {
        ...el,
        ...(p.points !== undefined ? { points: p.points } : null),
        ...(p.fill !== undefined ? { fill: p.fill } : null),
        ...(p.fillOpacity !== undefined
          ? { fillOpacity: p.fillOpacity }
          : null),
        ...(p.stroke !== undefined ? { stroke: p.stroke } : null),
        ...(p.strokeWidth !== undefined
          ? { strokeWidth: p.strokeWidth }
          : null),
      };
    case 'text':
      return {
        ...el,
        ...(p.x !== undefined ? { x: p.x } : null),
        ...(p.y !== undefined ? { y: p.y } : null),
        ...(p.lines !== undefined ? { lines: p.lines } : null),
        ...(p.fill !== undefined ? { fill: p.fill } : null),
        ...(p.fontMinPx !== undefined ? { fontMinPx: p.fontMinPx } : null),
        ...(p.fontVmin !== undefined ? { fontVmin: p.fontVmin } : null),
        ...(p.fontMaxPx !== undefined ? { fontMaxPx: p.fontMaxPx } : null),
        ...(p.fontWeight !== undefined ? { fontWeight: p.fontWeight } : null),
        ...(p.anchor !== undefined ? { anchor: p.anchor } : null),
        ...(p.opacity !== undefined ? { opacity: p.opacity } : null),
      };
    default:
      return assertNever(el);
  }
}

function applyZonePatch(zone: Zone, p: ZonePatch): Zone {
  const base = p.label !== undefined ? { ...zone, label: p.label } : zone;
  switch (base.shape) {
    case 'rect':
      return {
        ...base,
        ...(p.x !== undefined ? { x: p.x } : null),
        ...(p.y !== undefined ? { y: p.y } : null),
        ...(p.width !== undefined ? { width: p.width } : null),
        ...(p.height !== undefined ? { height: p.height } : null),
      };
    case 'circle':
      return {
        ...base,
        ...(p.cx !== undefined ? { cx: p.cx } : null),
        ...(p.cy !== undefined ? { cy: p.cy } : null),
        ...(p.r !== undefined ? { r: p.r } : null),
      };
    case 'polygon':
      return {
        ...base,
        ...(p.points !== undefined ? { points: p.points } : null),
      };
    default:
      return assertNever(base);
  }
}

function translateSelected(
  doc: BackgroundDocument,
  selection: Selection,
  dx: number,
  dy: number,
): BackgroundDocument {
  if (selection.type === 'element') {
    return {
      ...doc,
      elements: doc.elements.map((el) =>
        el.id === selection.id ? translateElement(el, dx, dy) : el,
      ),
    };
  }
  return {
    ...doc,
    zones: doc.zones.map((zone) =>
      zone.id === selection.id ? translateZone(zone, dx, dy) : zone,
    ),
  };
}

const sortedPair = (a: number, b: number): [number, number] =>
  a <= b ? [a, b] : [b, a];

type BuiltItem =
  | { target: 'element'; element: SvgElement }
  | { target: 'zone'; zone: Zone };

function buildDragItem(
  draft: Extract<Draft, { mode: 'drag' }>,
  zones: Zone[],
): BuiltItem | null {
  const { start, current, tool } = draft;
  if (tool === 'line') {
    const length = Math.hypot(current.x - start.x, current.y - start.y);
    if (length < MIN_EXTENT) return null;
    const element: LineElement = {
      id: crypto.randomUUID(),
      kind: 'line',
      x1: start.x,
      y1: start.y,
      x2: current.x,
      y2: current.y,
      stroke: '#ffffff',
      strokeWidth: 3,
      startArrow: false,
      endArrow: false,
    };
    return { target: 'element', element };
  }

  if (tool === 'zone-circle') {
    // Circle centred at the drag start; radius = normalized drag distance, so
    // the user drags outward from the centre. Clamped to a valid [0, 1] radius.
    const r = Math.min(Math.hypot(current.x - start.x, current.y - start.y), 1);
    if (r < MIN_EXTENT / 2) return null;
    const zone: Zone = {
      id: crypto.randomUUID(),
      label: nextZoneLabel(zones),
      shape: 'circle',
      cx: start.x,
      cy: start.y,
      r,
    };
    return { target: 'zone', zone };
  }

  // rect / ellipse / zone-rect: corner drag → normalized, sorted bounding box.
  const [x0, x1] = sortedPair(start.x, current.x);
  const [y0, y1] = sortedPair(start.y, current.y);
  const width = x1 - x0;
  const height = y1 - y0;

  if (tool === 'ellipse') {
    if (width < MIN_EXTENT || height < MIN_EXTENT) return null;
    return {
      target: 'element',
      element: {
        id: crypto.randomUUID(),
        kind: 'ellipse',
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        rx: width / 2,
        ry: height / 2,
        fill: '#ffffff',
        fillOpacity: 0.25,
        stroke: null,
        strokeWidth: 3,
      },
    };
  }

  if (width < MIN_EXTENT || height < MIN_EXTENT) return null;

  if (tool === 'zone-rect') {
    return {
      target: 'zone',
      zone: {
        id: crypto.randomUUID(),
        label: nextZoneLabel(zones),
        shape: 'rect',
        x: x0,
        y: y0,
        width,
        height,
      },
    };
  }

  const element: RectElement = {
    id: crypto.randomUUID(),
    kind: 'rect',
    x: x0,
    y: y0,
    width,
    height,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
  };
  return { target: 'element', element };
}

const NEAR = 1e-4;
const nearlyEqual = (a: Vec, b: Vec): boolean =>
  Math.abs(a.x - b.x) < NEAR && Math.abs(a.y - b.y) < NEAR;

function templateFor(template: NewTemplate): BackgroundDocument {
  switch (template) {
    case 'blank':
      return createBlankDocument();
    case 'quadrants':
      return createQuadrantsTemplate();
    case 'concentric':
      return createConcentricCirclesTemplate();
    default:
      return assertNever(template);
  }
}

const templateName: Record<NewTemplate, string> = {
  blank: 'blank',
  quadrants: 'quadrants',
  concentric: 'concentric circles',
};

export const useEditorStore = create<EditorState>((set, get) => ({
  // The editor opens on a model of the sample protocol's compass background so
  // the first thing a researcher sees is a real, complete example.
  doc: createPoliticalCompassDocument(),
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

  setTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      draft: null,
      selection: tool === 'select' ? state.selection : null,
    })),

  select: (selection) => set({ selection }),

  announce: (message) =>
    set((state) => ({ announcement: bump(state, message) })),

  commitDoc: (next, opts) => set((state) => pushed(state, next, opts)),

  updateElement: (id, patch, opts) => {
    const { doc } = get();
    if (!findElement(doc, id)) return;
    const next: BackgroundDocument = {
      ...doc,
      elements: doc.elements.map((el) =>
        el.id === id ? applyElementPatch(el, patch) : el,
      ),
    };
    set((state) => pushed(state, next, opts));
  },

  updateZone: (id, patch, opts) => {
    const { doc } = get();
    if (!findZone(doc, id)) return;
    const next: BackgroundDocument = {
      ...doc,
      zones: doc.zones.map((zone) =>
        zone.id === id ? applyZonePatch(zone, patch) : zone,
      ),
    };
    set((state) => pushed(state, next, opts));
  },

  moveSelectedBy: (dx, dy) => {
    const { selection, doc } = get();
    if (!selection) return;
    const current =
      selection.type === 'element'
        ? findElement(doc, selection.id)
        : findZone(doc, selection.id);
    if (!current) return;
    const next = translateSelected(doc, selection, dx, dy);
    const moved =
      selection.type === 'element'
        ? findElement(next, selection.id)
        : findZone(next, selection.id);
    // Skip a fully-clamped edge nudge so it doesn't push a no-op history step.
    if (moved && JSON.stringify(moved) === JSON.stringify(current)) return;
    set((state) =>
      pushed(state, next, { coalesceKey: `nudge:${selection.id}` }),
    );
  },

  deleteSelected: () => {
    const { selection, doc } = get();
    if (!selection) return;
    if (selection.type === 'element') {
      const el = findElement(doc, selection.id);
      if (!el) return;
      const next: BackgroundDocument = {
        ...doc,
        elements: doc.elements.filter((e) => e.id !== selection.id),
      };
      set((state) => ({
        ...pushed(state, next),
        selection: null,
        announcement: bump(state, `${elementKindLabel(el)} deleted`),
      }));
      return;
    }
    const zone = findZone(doc, selection.id);
    if (!zone) return;
    const next: BackgroundDocument = {
      ...doc,
      zones: doc.zones.filter((z) => z.id !== selection.id),
    };
    set((state) => ({
      ...pushed(state, next),
      selection: null,
      announcement: bump(state, `Zone "${zone.label}" deleted`),
    }));
  },

  reorderSelected: (direction) => {
    const { selection, doc } = get();
    if (!selection || selection.type !== 'element') return;
    const index = doc.elements.findIndex((el) => el.id === selection.id);
    if (index === -1) return;
    const target = direction === 'forward' ? index + 1 : index - 1;
    if (target < 0) {
      set((state) => ({ announcement: bump(state, 'Already at the back') }));
      return;
    }
    if (target >= doc.elements.length) {
      set((state) => ({ announcement: bump(state, 'Already at the front') }));
      return;
    }
    const elements = [...doc.elements];
    const [moved] = elements.splice(index, 1);
    if (!moved) return;
    elements.splice(target, 0, moved);
    const next: BackgroundDocument = { ...doc, elements };
    set((state) => ({
      ...pushed(state, next),
      announcement: bump(
        state,
        direction === 'forward' ? 'Moved forward' : 'Moved backward',
      ),
    }));
  },

  beginGesture: () => set((state) => ({ gestureSnapshot: state.doc })),

  updateGesture: (mutate) => set((state) => ({ doc: mutate(state.doc) })),

  endGesture: () =>
    set((state) => {
      const snapshot = state.gestureSnapshot;
      // A fully-clamped drag rebuilds the doc object without changing any value,
      // so compare by value (not reference) to skip a no-op history entry.
      if (!snapshot || JSON.stringify(snapshot) === JSON.stringify(state.doc)) {
        return { gestureSnapshot: null };
      }
      return {
        past: [...state.past, snapshot].slice(-HISTORY_CAP),
        future: [],
        lastCoalesceKey: null,
        gestureSnapshot: null,
      };
    }),

  cancelGesture: () =>
    set((state) =>
      state.gestureSnapshot
        ? { doc: state.gestureSnapshot, gestureSnapshot: null }
        : { gestureSnapshot: null },
    ),

  beginDraft: (tool, at) =>
    set(() =>
      tool === 'polygon' || tool === 'zone-polygon'
        ? { draft: { mode: 'polygon', tool, points: [at], current: at } }
        : { draft: { mode: 'drag', tool, start: at, current: at } },
    ),

  updateDraft: (at) =>
    set((state) => {
      const { draft } = state;
      if (!draft) return {};
      return { draft: { ...draft, current: at } };
    }),

  commitDraft: () => {
    const { draft, doc } = get();
    if (!draft || draft.mode !== 'drag') return;
    const built = buildDragItem(draft, doc.zones);
    if (!built) {
      set({ draft: null });
      return;
    }
    if (built.target === 'element') {
      const next: BackgroundDocument = {
        ...doc,
        elements: [...doc.elements, built.element],
      };
      const selection: Selection = { id: built.element.id, type: 'element' };
      set((state) => ({
        ...pushed(state, next),
        selection,
        draft: null,
        announcement: bump(state, `${elementKindLabel(built.element)} added`),
      }));
      return;
    }
    const next: BackgroundDocument = {
      ...doc,
      zones: [...doc.zones, built.zone],
    };
    const selection: Selection = { id: built.zone.id, type: 'zone' };
    set((state) => ({
      ...pushed(state, next),
      selection,
      draft: null,
      announcement: bump(state, `Zone "${built.zone.label}" added`),
    }));
  },

  addDraftPoint: (at) =>
    set((state) => {
      if (!state.draft || state.draft.mode !== 'polygon') return {};
      return {
        draft: {
          ...state.draft,
          points: [...state.draft.points, at],
          current: at,
        },
      };
    }),

  closeDraftPolygon: () => {
    const { draft, doc } = get();
    if (!draft || draft.mode !== 'polygon') return;
    // A double-click closes the polygon, but each of its presses already added a
    // near-duplicate vertex; drop every trailing point that coincides with the
    // one before it so the closing gesture doesn't leave a zero-length edge.
    let points = draft.points;
    while (points.length >= 2) {
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      if (last && prev && nearlyEqual(last, prev)) {
        points = points.slice(0, -1);
      } else {
        break;
      }
    }
    if (points.length < 3) {
      set((state) => ({
        announcement: bump(state, 'A shape needs at least three points.'),
      }));
      return;
    }
    if (draft.tool === 'polygon') {
      const element: PolygonElement = {
        id: crypto.randomUUID(),
        kind: 'polygon',
        points,
        fill: '#ffffff',
        fillOpacity: 0.25,
        stroke: null,
        strokeWidth: 3,
      };
      const next: BackgroundDocument = {
        ...doc,
        elements: [...doc.elements, element],
      };
      const selection: Selection = { id: element.id, type: 'element' };
      set((state) => ({
        ...pushed(state, next),
        selection,
        draft: null,
        announcement: bump(state, 'Polygon added'),
      }));
      return;
    }
    const zone: Zone = {
      id: crypto.randomUUID(),
      label: nextZoneLabel(doc.zones),
      shape: 'polygon',
      points,
    };
    const next: BackgroundDocument = { ...doc, zones: [...doc.zones, zone] };
    const selection: Selection = { id: zone.id, type: 'zone' };
    set((state) => ({
      ...pushed(state, next),
      selection,
      draft: null,
      announcement: bump(state, `Zone "${zone.label}" added`),
    }));
  },

  cancelDraft: () => set({ draft: null }),

  createTextAt: (at) => {
    const { doc } = get();
    const element: TextElement = {
      id: crypto.randomUUID(),
      kind: 'text',
      x: at.x,
      y: at.y,
      lines: ['Text'],
      fill: '#ffffff',
      fontMinPx: 14,
      fontVmin: 2.6,
      fontMaxPx: 32,
      fontWeight: 600,
      anchor: 'middle',
      opacity: 1,
    };
    const next: BackgroundDocument = {
      ...doc,
      elements: [...doc.elements, element],
    };
    const selection: Selection = { id: element.id, type: 'element' };
    set((state) => ({
      ...pushed(state, next),
      selection,
      draft: null,
      announcement: bump(state, 'Text added'),
    }));
  },

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return { announcement: bump(state, 'Nothing to undo') };
      return {
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_CAP),
        selection: null,
        draft: null,
        lastCoalesceKey: null,
        gestureSnapshot: null,
        announcement: bump(state, 'Undo'),
      };
    }),

  redo: () =>
    set((state) => {
      const [nextDoc] = state.future;
      if (!nextDoc) return { announcement: bump(state, 'Nothing to redo') };
      return {
        doc: nextDoc,
        past: [...state.past, state.doc].slice(-HISTORY_CAP),
        future: state.future.slice(1),
        selection: null,
        draft: null,
        lastCoalesceKey: null,
        gestureSnapshot: null,
        announcement: bump(state, 'Redo'),
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  newDocument: (template) =>
    set((state) => ({
      doc: templateFor(template),
      selection: null,
      draft: null,
      past: [],
      future: [],
      lastCoalesceKey: null,
      gestureSnapshot: null,
      announcement: bump(
        state,
        `Started a new ${templateName[template]} background`,
      ),
    })),

  loadDocument: (doc) =>
    set((state) => ({
      doc,
      selection: null,
      draft: null,
      past: [],
      future: [],
      lastCoalesceKey: null,
      gestureSnapshot: null,
      announcement: bump(state, `Opened “${doc.title}”`),
    })),

  setPreviewAspect: (previewAspect) => set({ previewAspect }),
  setPreviewSurface: (previewSurface) => set({ previewSurface }),
  toggleZonesVisible: () =>
    set((state) => ({ zonesVisible: !state.zonesVisible })),
}));
