import { create } from 'zustand';

import {
  createBlankDocument,
  createConcentricCirclesTemplate,
  createPoliticalCompassDocument,
  createQuadrantsTemplate,
} from '~/model/templates';
import type {
  BackgroundDocument,
  EllipseElement,
  LineElement,
  PolygonElement,
  RectElement,
  SvgElement,
  TextElement,
  Vec,
  ZoneElement,
} from '~/model/types';

import { assertNever } from './assertNever';
import {
  constrainLine45,
  constrainRegular,
  nearlyEqual,
  type StageBox,
  translateElement,
} from './documentGeometry';
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
// Default centred extent for a keyboard-inserted shape (see insertDefaultShape).
const DEFAULT_EXTENT = 0.2;

// Elements only — zones are ordinary elements carrying a zoneLabel, so a single
// selection shape covers both.
export type Selection = { id: string };

export type EditorTool =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'text';

export type DragDraftTool = 'rect' | 'ellipse' | 'line';

export type Draft =
  | { mode: 'drag'; tool: DragDraftTool; start: Vec; current: Vec }
  | { mode: 'polygon'; tool: 'polygon'; points: Vec[]; current: Vec };

export type PreviewAspect =
  | 'fill'
  | '16:10'
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '1:1';
export type PreviewSurface = 'interview' | 'light' | 'checker';

type Announcement = { message: string; seq: number };

// Flat optional record: every element field, all optional. The union of per-kind
// partials would collapse to shared keys only, so the patch is applied through
// an explicit per-kind switch that only reads fields valid for the kind.
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
  fontSize?: TextElement['fontSize'];
  fontWeight?: TextElement['fontWeight'];
  opacity?: number;
  // null unmarks the element as a zone; a string marks/renames it.
  zoneLabel?: string | null;
};

type CommitOptions = { coalesceKey?: string };

// Shared by createTextAt and the inline editor's first commit, so replacing a
// new element's placeholder text folds into the creation's history entry and a
// single Undo removes the element rather than resurrecting the placeholder.
export function newTextCoalesceKey(id: string): string {
  return `new-text:${id}`;
}

type NewTemplate = 'blank' | 'quadrants' | 'concentric' | 'compass';

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
  resetCoalescing: () => void;
  announce: (message: string) => void;

  commitDoc: (next: BackgroundDocument, opts?: CommitOptions) => void;
  updateElement: (
    id: string,
    patch: ElementPatch,
    opts?: CommitOptions,
  ) => void;
  moveSelectedBy: (dx: number, dy: number, stage?: StageBox | null) => void;
  deleteSelected: () => void;
  reorderSelected: (direction: 'forward' | 'backward') => void;

  beginGesture: () => void;
  updateGesture: (
    mutate: (doc: BackgroundDocument) => BackgroundDocument,
  ) => void;
  endGesture: () => void;
  cancelGesture: () => void;

  beginDraft: (tool: DragDraftTool | 'polygon', at: Vec) => void;
  updateDraft: (at: Vec, constrain?: StageBox | null) => void;
  commitDraft: () => void;
  addDraftPoint: (at: Vec) => void;
  closeDraftPolygon: () => void;
  cancelDraft: () => void;
  createTextAt: (at: Vec) => string;
  insertDefaultShape: (tool: Exclude<EditorTool, 'select' | 'text'>) => void;
  discardNewText: (id: string) => void;

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

// The lowest unused `zone-N` label, used to prefill a freshly-marked zone.
export function nextZoneLabel(zones: ZoneElement[]): string {
  const used = new Set(zones.map((zone) => zone.zoneLabel));
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
        ...(p.zoneLabel !== undefined ? { zoneLabel: p.zoneLabel } : null),
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
        ...(p.zoneLabel !== undefined ? { zoneLabel: p.zoneLabel } : null),
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
        ...(p.zoneLabel !== undefined ? { zoneLabel: p.zoneLabel } : null),
      };
    case 'text':
      return {
        ...el,
        ...(p.x !== undefined ? { x: p.x } : null),
        ...(p.y !== undefined ? { y: p.y } : null),
        ...(p.lines !== undefined ? { lines: p.lines } : null),
        ...(p.fill !== undefined ? { fill: p.fill } : null),
        ...(p.fontSize !== undefined ? { fontSize: p.fontSize } : null),
        ...(p.fontWeight !== undefined ? { fontWeight: p.fontWeight } : null),
        ...(p.opacity !== undefined ? { opacity: p.opacity } : null),
      };
    default:
      return assertNever(el);
  }
}

function translateSelected(
  doc: BackgroundDocument,
  selection: Selection,
  dx: number,
  dy: number,
  stage: StageBox | null,
): BackgroundDocument {
  return {
    ...doc,
    elements: doc.elements.map((el) =>
      el.id === selection.id ? translateElement(el, dx, dy, stage) : el,
    ),
  };
}

const sortedPair = (a: number, b: number): [number, number] =>
  a <= b ? [a, b] : [b, a];

function buildDragItem(
  draft: Extract<Draft, { mode: 'drag' }>,
): SvgElement | null {
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
      stroke: 'text',
      strokeWidth: 3,
      startArrow: false,
      endArrow: false,
    };
    return element;
  }

  // rect / ellipse: corner drag → normalized, sorted bounding box.
  const [x0, x1] = sortedPair(start.x, current.x);
  const [y0, y1] = sortedPair(start.y, current.y);
  const width = x1 - x0;
  const height = y1 - y0;
  if (width < MIN_EXTENT || height < MIN_EXTENT) return null;

  if (tool === 'ellipse') {
    const element: EllipseElement = {
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
      zoneLabel: null,
    };
    return element;
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
    zoneLabel: null,
  };
  return element;
}

// The default centred shape a keyboard insert (Enter with a draw tool) creates.
function buildDefaultShape(
  tool: Exclude<EditorTool, 'select' | 'text'>,
): SvgElement {
  const half = DEFAULT_EXTENT / 2;
  switch (tool) {
    case 'rect':
      return {
        id: crypto.randomUUID(),
        kind: 'rect',
        x: 0.5 - half,
        y: 0.5 - half,
        width: DEFAULT_EXTENT,
        height: DEFAULT_EXTENT,
        fill: '#ffffff',
        fillOpacity: 0.25,
        stroke: null,
        strokeWidth: 3,
        zoneLabel: null,
      };
    case 'ellipse':
      return {
        id: crypto.randomUUID(),
        kind: 'ellipse',
        cx: 0.5,
        cy: 0.5,
        rx: half,
        ry: half,
        fill: '#ffffff',
        fillOpacity: 0.25,
        stroke: null,
        strokeWidth: 3,
        zoneLabel: null,
      };
    case 'line':
      return {
        id: crypto.randomUUID(),
        kind: 'line',
        x1: 0.5 - half,
        y1: 0.5,
        x2: 0.5 + half,
        y2: 0.5,
        stroke: 'text',
        strokeWidth: 3,
        startArrow: false,
        endArrow: false,
      };
    case 'polygon':
      return {
        id: crypto.randomUUID(),
        kind: 'polygon',
        points: [
          { x: 0.5, y: 0.5 - half },
          { x: 0.5 + half, y: 0.5 + half },
          { x: 0.5 - half, y: 0.5 + half },
        ],
        fill: '#ffffff',
        fillOpacity: 0.25,
        stroke: null,
        strokeWidth: 3,
        zoneLabel: null,
      };
    default:
      return assertNever(tool);
  }
}

function templateFor(template: NewTemplate): BackgroundDocument {
  switch (template) {
    case 'blank':
      return createBlankDocument();
    case 'quadrants':
      return createQuadrantsTemplate();
    case 'concentric':
      return createConcentricCirclesTemplate();
    case 'compass':
      return createPoliticalCompassDocument();
    default:
      return assertNever(template);
  }
}

const templateName: Record<NewTemplate, string> = {
  blank: 'blank',
  quadrants: 'quadrants',
  concentric: 'concentric circles',
  compass: 'political compass',
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

  // Changing tool or selection ends the current edit session, so the coalescing
  // key is cleared: two separate edit bursts that happen to share a key (e.g.
  // nudging element A, selecting away, then nudging A again) must not merge into
  // a single undo step.
  setTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      draft: null,
      selection: tool === 'select' ? state.selection : null,
      lastCoalesceKey: null,
    })),

  select: (selection) => set({ selection, lastCoalesceKey: null }),

  // Ends a coalescing run (e.g. a keyboard-nudge burst on arrow-key release)
  // so the next run with the same key becomes its own undo step.
  resetCoalescing: () => set({ lastCoalesceKey: null }),

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

  moveSelectedBy: (dx, dy, stage = null) => {
    const { selection, doc } = get();
    if (!selection) return;
    const current = findElement(doc, selection.id);
    if (!current) return;
    const next = translateSelected(doc, selection, dx, dy, stage);
    const moved = findElement(next, selection.id);
    // Skip a fully-clamped edge nudge so it doesn't push a no-op history step.
    if (moved && JSON.stringify(moved) === JSON.stringify(current)) return;
    set((state) =>
      pushed(state, next, { coalesceKey: `nudge:${selection.id}` }),
    );
  },

  deleteSelected: () => {
    const { selection, doc } = get();
    if (!selection) return;
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
  },

  reorderSelected: (direction) => {
    const { selection, doc } = get();
    if (!selection) return;
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
      tool === 'polygon'
        ? { draft: { mode: 'polygon', tool, points: [at], current: at } }
        : { draft: { mode: 'drag', tool, start: at, current: at } },
    ),

  updateDraft: (at, constrain) =>
    set((state) => {
      const { draft } = state;
      if (!draft) return {};
      // Shift-constrain only the drag draws (never polygon vertex placement).
      if (constrain && draft.mode === 'drag') {
        const current =
          draft.tool === 'line'
            ? constrainLine45(draft.start, at, constrain)
            : constrainRegular(draft.start, at, constrain);
        return { draft: { ...draft, current } };
      }
      return { draft: { ...draft, current: at } };
    }),

  commitDraft: () => {
    const { draft, doc } = get();
    if (!draft || draft.mode !== 'drag') return;
    const element = buildDragItem(draft);
    if (!element) {
      set({ draft: null });
      return;
    }
    const next: BackgroundDocument = {
      ...doc,
      elements: [...doc.elements, element],
    };
    // A successful creation hands back to the select tool (a discarded
    // degenerate draft above keeps the draw tool so the user can retry). The
    // announcement carries the mode change: aria-label updates on the focused
    // stage are not reliably re-announced, so without it another Enter/draw
    // attempt fails silently for screen-reader users.
    set((state) => ({
      ...pushed(state, next),
      selection: { id: element.id },
      activeTool: 'select',
      draft: null,
      announcement: bump(
        state,
        `${elementKindLabel(element)} added. Select tool active`,
      ),
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
    // A close ON the first vertex leaves its duplicate at the END of the list
    // (not adjacent to it), which the trailing trim above cannot see — without
    // this, [start, other, start] commits a zero-area two-vertex polygon.
    while (points.length >= 2) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first && last && nearlyEqual(first, last)) {
        points = points.slice(0, -1);
      } else {
        break;
      }
    }
    if (points.length < 3) {
      // Keep the trimmed vertices: the failed double-click's duplicate would
      // otherwise linger mid-list once more points are added, and a later
      // successful close (which only trims trailing duplicates) would commit a
      // polygon with a zero-length edge.
      set((state) => ({
        draft: { ...draft, points },
        announcement: bump(state, 'A shape needs at least three points.'),
      }));
      return;
    }
    const element: PolygonElement = {
      id: crypto.randomUUID(),
      kind: 'polygon',
      points,
      fill: '#ffffff',
      fillOpacity: 0.25,
      stroke: null,
      strokeWidth: 3,
      zoneLabel: null,
    };
    const next: BackgroundDocument = {
      ...doc,
      elements: [...doc.elements, element],
    };
    set((state) => ({
      ...pushed(state, next),
      selection: { id: element.id },
      activeTool: 'select',
      draft: null,
      announcement: bump(state, 'Polygon added. Select tool active'),
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
      fill: 'text',
      fontSize: 'medium',
      fontWeight: 600,
      opacity: 1,
    };
    const next: BackgroundDocument = {
      ...doc,
      elements: [...doc.elements, element],
    };
    set((state) => ({
      ...pushed(state, next, { coalesceKey: newTextCoalesceKey(element.id) }),
      selection: { id: element.id },
      draft: null,
      announcement: bump(state, 'Text added'),
    }));
    return element.id;
  },

  insertDefaultShape: (tool) => {
    const { doc } = get();
    const element = buildDefaultShape(tool);
    const next: BackgroundDocument = {
      ...doc,
      elements: [...doc.elements, element],
    };
    set((state) => ({
      ...pushed(state, next),
      selection: { id: element.id },
      activeTool: 'select',
      draft: null,
      announcement: bump(
        state,
        `${elementKindLabel(element)} added. Select tool active`,
      ),
    }));
  },

  // Cancel-like removal of a just-created text placeholder committed empty.
  // Inline editing pushes no history, so the placeholder's create is the last
  // entry — reverting to it drops the placeholder without leaving a dangling
  // create/delete pair. Falls back to a plain filter if there is no snapshot.
  discardNewText: (id) =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (previous && !previous.elements.some((el) => el.id === id)) {
        return {
          doc: previous,
          past: state.past.slice(0, -1),
          selection: null,
          lastCoalesceKey: null,
        };
      }
      return {
        doc: {
          ...state.doc,
          elements: state.doc.elements.filter((el) => el.id !== id),
        },
        selection: null,
      };
    }),

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
