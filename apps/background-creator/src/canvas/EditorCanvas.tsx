import {
  type CSSProperties,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { assignZone, zonesOf } from '~/geometry/zones';
import type { BackgroundDocument, SvgElement, Vec } from '~/model/types';
import {
  type Bounds,
  elementBounds,
  type StageBox,
  translateElement,
} from '~/state/documentGeometry';
import {
  type DragDraftTool,
  type EditorTool,
  type PreviewAspect,
  type Selection,
  useEditorStore,
} from '~/state/editorStore';
import { isZoneElement } from '~/state/labels';
import {
  computeBoundsSnap,
  computeSnap,
  NO_GUIDES,
  type SnapAxes,
  type SnapGuides,
  type SnapLines,
  snapLines,
} from '~/state/snapping';
import { serializeDocument } from '~/svg/serialize';
import { editZoneLabelFlow } from '~/toolbar/textEditDialog';
import { linesToText, textToLines } from '~/toolbar/textLines';

import { hitTestDocument } from './canvasGeometry';
import { InlineTextEditor } from './InlineTextEditor';
import { KeyboardTargets } from './overlay/KeyboardTargets';
import { OverlaySvg } from './overlay/OverlaySvg';
import { ResizeHandles } from './overlay/ResizeHandles';
import { announceSelectionPosition } from './overlay/useItemControls';
import { ZonePills } from './overlay/ZonePills';
import { isOverlayControlTarget } from './overlayTargets';
import { clientToNormalized, startPointerGesture } from './pointerGesture';
import {
  createPreviewImageLoader,
  type PreviewImageLoader,
} from './previewImageLoader';

const RESIZE_HANDLE_ONLY = '[data-resize-handle]';

// Screen-pixel click tolerance, converted to a single normalized value against
// the smaller stage dimension. Approximate under a non-square stage (x and y
// normalize by different pixel extents), which is acceptable for grab targets.
const HIT_TOLERANCE_PX = 8;

const ASPECT_RATIOS: Record<Exclude<PreviewAspect, 'fill'>, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '1:1': 1,
};

const TOOL_LABELS: Record<EditorTool, string> = {
  select: 'Select',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  polygon: 'Polygon',
  text: 'Text',
};

const CHECKER_STYLE: CSSProperties = {
  backgroundColor: 'var(--surface)',
  backgroundImage:
    'linear-gradient(45deg, var(--surface-2) 25%, transparent 25%), linear-gradient(-45deg, var(--surface-2) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--surface-2) 75%), linear-gradient(-45deg, transparent 75%, var(--surface-2) 75%)',
  backgroundSize: '24px 24px',
  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
};

type TextEdit = { id: string; isNew: boolean };

function isDragTool(tool: EditorTool): tool is DragDraftTool {
  return tool === 'rect' || tool === 'ellipse' || tool === 'line';
}

function cursorForTool(tool: EditorTool): string {
  if (tool === 'select') return 'default';
  if (tool === 'text') return 'text';
  return 'crosshair';
}

function moveInDoc(
  doc: BackgroundDocument,
  sel: Selection,
  dx: number,
  dy: number,
): BackgroundDocument {
  return {
    ...doc,
    elements: doc.elements.map((el) =>
      el.id === sel.id ? translateElement(el, dx, dy) : el,
    ),
  };
}

// Measures the fit container and returns the largest box of the requested
// aspect that fits inside it (letterboxed); 'fill' returns the container size.
function useStageSize(
  aspect: PreviewAspect,
  ref: RefObject<HTMLDivElement | null>,
): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      if (aspect === 'fill') {
        setSize({ width, height });
        return;
      }
      const target = ASPECT_RATIOS[aspect];
      if (width / height > target) {
        setSize({ width: height * target, height });
      } else {
        setSize({ width, height: width / target });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspect, ref]);

  return size;
}

export function EditorCanvas(): ReactElement {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const draft = useEditorStore((s) => s.draft);
  const activeTool = useEditorStore((s) => s.activeTool);
  const zonesVisible = useEditorStore((s) => s.zonesVisible);
  const previewAspect = useEditorStore((s) => s.previewAspect);
  const previewSurface = useEditorStore((s) => s.previewSurface);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  // Per-gesture snap-guide chrome. Local, not in the store, because it is purely
  // transient visual feedback that lives and dies with a single drag.
  const [guides, setGuides] = useState<SnapGuides>(NO_GUIDES);

  // In-place text editing state. `editingRef` mirrors it for the imperative
  // stage listeners (see below), which are attached once and must read the
  // latest value without re-binding.
  const [editing, setEditing] = useState<TextEdit | null>(null);
  const editingRef = useRef<TextEdit | null>(null);
  editingRef.current = editing;

  // The stage's pointer/dblclick handlers are stable (attached imperatively
  // below); keep the dialog context in a ref so they can open the zone-label
  // editor without re-binding the listeners each time the dialog store renders.
  const dialogs = useDialog();
  const dialogsRef = useRef(dialogs);
  dialogsRef.current = dialogs;

  const stageSize = useStageSize(previewAspect, containerRef);

  // While a text element is being edited in place it is omitted from the
  // preview source, so the live textarea is the only rendering of it.
  const previewSource = useMemo<BackgroundDocument>(() => {
    if (!editing) return doc;
    return {
      ...doc,
      elements: doc.elements.filter((el) => el.id !== editing.id),
    };
  }, [doc, editing]);

  // Preview frames flow through a decode-before-swap loader so the visible <img>
  // never blanks between frames during a move/resize drag (see previewImageLoader).
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const loaderRef = useRef<PreviewImageLoader<BackgroundDocument> | null>(null);
  useEffect(() => {
    const loader = createPreviewImageLoader<BackgroundDocument>({
      serialize: serializeDocument,
      onSwap: setBlobUrl,
    });
    loaderRef.current = loader;
    return () => {
      loader.dispose();
      loaderRef.current = null;
    };
  }, []);
  useEffect(() => {
    loaderRef.current?.update(previewSource);
  }, [previewSource]);

  const getStageRect = useCallback(
    () => stageRef.current?.getBoundingClientRect() ?? null,
    [],
  );

  const beginTextEdit = useCallback((id: string, isNew: boolean) => {
    setEditing({ id, isNew });
  }, []);

  const commitTextEdit = useCallback((value: string) => {
    const current = editingRef.current;
    setEditing(null);
    stageRef.current?.focus();
    if (!current) return;
    const store = useEditorStore.getState();
    const el = store.doc.elements.find(
      (candidate) => candidate.id === current.id,
    );
    if (!el || el.kind !== 'text') return;

    const lines = textToLines(value);
    const isEmpty = lines.every((line) => line.trim() === '');
    if (current.isNew && isEmpty) {
      store.discardNewText(current.id);
      return;
    }
    if (linesToText(el.lines) !== value) {
      store.updateElement(current.id, { lines });
      store.announce('Text updated');
    }
  }, []);

  const activateElement = useCallback(
    (el: SvgElement) => {
      if (el.kind === 'text') {
        beginTextEdit(el.id, false);
        return;
      }
      if (isZoneElement(el)) {
        void editZoneLabelFlow(dialogsRef.current, el.id);
      }
    },
    [beginTextEdit],
  );

  const selectionBounds = useMemo<Bounds | null>(() => {
    if (!selection) return null;
    const el = doc.elements.find((e) => e.id === selection.id);
    return el ? elementBounds(el) : null;
  }, [selection, doc]);

  // Snaps a gesture's pointer to alignment candidates and publishes the active
  // guides, unless Alt is held or the stage has no measurable size. Stable, so
  // it can sit in the imperatively-attached handler's dependency list.
  const snapPoint = useCallback(
    (
      pt: Vec,
      candidates: SnapLines,
      stage: StageBox | null,
      altKey: boolean,
      axes?: SnapAxes,
    ): Vec => {
      if (altKey || !stage) {
        setGuides(NO_GUIDES);
        return pt;
      }
      const snap = computeSnap(pt, candidates, stage, { axes });
      setGuides(snap.guides);
      return snap.point;
    },
    [],
  );

  // The stage's pointer/keyboard handlers are attached imperatively (below)
  // rather than as JSX props. The surface carries role="application"; a literal
  // tabIndex or an onKeyDown/pointer prop there trips jsx-a11y's
  // non-interactive-element heuristics. Native listeners scoped to the stage
  // element are equivalent and only fire while the pointer/focus is on it.
  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      // Ignore non-primary presses (right/middle click) before any state change:
      // startPointerGesture also bails on them, so mutating here first would drop
      // an uncommitted text element or leave a draft with no pointerup to finish it.
      if (e.button !== 0) return;
      // Overlay controls (resize handles, zone pills, the inline editor) own
      // their own pointer handling. This native listener fires before their
      // React handlers reach the document root, so the stage must yield here
      // explicitly rather than rely on their stopPropagation (see overlayTargets).
      if (isOverlayControlTarget(e.target)) return;

      const el = stageRef.current;
      if (!el) return;
      const store = useEditorStore.getState();
      const tool = store.activeTool;
      const rect = el.getBoundingClientRect();
      const pt = clientToNormalized(rect, e.clientX, e.clientY);

      if (tool === 'select') {
        const tol = HIT_TOLERANCE_PX / Math.min(rect.width, rect.height);
        const hit = hitTestDocument(pt, store.doc, tol);
        if (!hit) {
          startPointerGesture(e, el, getStageRect, {
            onEnd: ({ moved }) => {
              if (!moved) store.select(null);
            },
          });
          return;
        }
        store.select(hit);
        // Move applies an absolute translation from the pre-gesture document, so
        // the snap never accumulates drift. Snapping is shape-relative: the
        // moving bounds (min/centre/max per axis) are tested against the
        // candidate lines, so the shape's own edges and centre catch the
        // canvas centre and other shapes — not wherever the pointer grabbed it.
        // Other elements hold still, so their candidate lines are computed once.
        const originalDoc = store.doc;
        const movingEl = originalDoc.elements.find(
          (item) => item.id === hit.id,
        );
        const originalBounds = movingEl ? elementBounds(movingEl) : null;
        const candidates = snapLines(originalDoc, hit.id);
        const startPt = pt;
        let began = false;
        startPointerGesture(e, el, getStageRect, {
          onDrag: (current, _start, _shiftKey, altKey) => {
            if (!began) {
              store.beginGesture();
              began = true;
            }
            const rawDx = current.x - startPt.x;
            const rawDy = current.y - startPt.y;
            const r = getStageRect();
            const stage = r ? { width: r.width, height: r.height } : null;
            let dx = rawDx;
            let dy = rawDy;
            if (altKey || !stage || !originalBounds) {
              setGuides(NO_GUIDES);
            } else {
              const probe: Bounds = {
                minX: originalBounds.minX + rawDx,
                maxX: originalBounds.maxX + rawDx,
                minY: originalBounds.minY + rawDy,
                maxY: originalBounds.maxY + rawDy,
              };
              const snap = computeBoundsSnap(probe, candidates, stage);
              setGuides(snap.guides);
              dx = rawDx + snap.delta.x;
              dy = rawDy + snap.delta.y;
            }
            store.updateGesture(() => moveInDoc(originalDoc, hit, dx, dy));
          },
          onEnd: ({ moved, cancelled }) => {
            setGuides(NO_GUIDES);
            if (cancelled) {
              if (began) store.cancelGesture();
              return;
            }
            if (!moved) {
              // A clean click-selection (no drag) auto-opens Properties.
              store.requestProperties();
              return;
            }
            store.endGesture();
            announceSelectionPosition();
          },
        });
        return;
      }

      if (tool === 'text') {
        // Clicking an existing text element with the Text tool edits it, rather
        // than dropping a new placeholder on top; any other hit or empty space
        // creates one.
        const tol = HIT_TOLERANCE_PX / Math.min(rect.width, rect.height);
        const hit = hitTestDocument(pt, store.doc, tol);
        const hitEl = hit
          ? store.doc.elements.find((candidate) => candidate.id === hit.id)
          : undefined;
        if (hit && hitEl?.kind === 'text') {
          store.select(hit);
          beginTextEdit(hitEl.id, false);
          return;
        }
        const id = store.createTextAt(pt);
        beginTextEdit(id, true);
        return;
      }

      if (tool === 'polygon') {
        const current = store.draft;
        if (!current || current.mode !== 'polygon') {
          store.beginDraft(tool, pt);
        } else {
          store.addDraftPoint(pt);
        }
        return;
      }

      if (isDragTool(tool)) {
        const candidates = snapLines(store.doc, null);
        store.beginDraft(tool, pt);
        startPointerGesture(e, el, getStageRect, {
          onDrag: (currentPt, _start, shiftKey, altKey) => {
            const r = getStageRect();
            const stage = r ? { width: r.width, height: r.height } : null;
            const constrainStage = shiftKey ? stage : null;
            // A 45° line has no free axis; a shift square/circle derives its y
            // from x. So skip a shift-line's snapping entirely, and snap only x
            // for a shift rect/ellipse — the store's constraint places the rest.
            let snapped = currentPt;
            if (shiftKey && tool === 'line') {
              setGuides(NO_GUIDES);
            } else {
              const axes: SnapAxes | undefined = shiftKey
                ? { x: true, y: false }
                : undefined;
              snapped = snapPoint(currentPt, candidates, stage, altKey, axes);
            }
            store.updateDraft(snapped, constrainStage);
          },
          onEnd: ({ cancelled }) => {
            setGuides(NO_GUIDES);
            if (cancelled) store.cancelDraft();
            else store.commitDraft();
          },
        });
      }
    },
    [getStageRect, beginTextEdit, snapPoint],
  );

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const store = useEditorStore.getState();
    const pt = clientToNormalized(rect, e.clientX, e.clientY);

    if (store.draft?.mode === 'polygon') {
      store.updateDraft(pt);
    }

    // Clear a stale readout when zone feedback is unavailable — zones hidden, or
    // the last zone removed — so a previous label can't linger or reappear.
    if (!store.zonesVisible) {
      setHoverLabel(null);
      return;
    }
    const zones = zonesOf(store.doc);
    if (zones.length === 0) {
      setHoverLabel(null);
      return;
    }
    // rAF-throttled so the hover readout updates at most once per frame.
    if (hoverRafRef.current !== null) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = null;
      const label = assignZone(pt, zonesOf(useEditorStore.getState().doc));
      setHoverLabel(label ?? 'no zone');
    });
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (hoverRafRef.current !== null) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    setHoverLabel(null);
  }, []);

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      // The in-place editor owns clicks on itself while open.
      if (editingRef.current) return;
      // A double-click on a resize handle is not a text-edit gesture.
      if (
        e.target instanceof Element &&
        e.target.closest(RESIZE_HANDLE_ONLY) !== null
      ) {
        return;
      }
      const store = useEditorStore.getState();
      if (store.draft?.mode === 'polygon') {
        store.closeDraftPolygon();
        return;
      }
      // A zone pill sits over its zone's top edge and often over a text label,
      // so decide by the topmost painted element at the cursor rather than the
      // hit-test. `elementFromPoint` returns the pill button when one is under
      // the cursor; that zone element's label editor wins.
      const overlay = document.elementFromPoint(e.clientX, e.clientY);
      const pill = overlay?.closest('[data-zone-id]');
      if (pill instanceof HTMLElement && pill.dataset.zoneId) {
        const zoneId = pill.dataset.zoneId;
        store.select({ id: zoneId });
        void editZoneLabelFlow(dialogsRef.current, zoneId);
        return;
      }
      // Otherwise, double-clicking a text element opens its in-place editor.
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pt = clientToNormalized(rect, e.clientX, e.clientY);
      const tol = HIT_TOLERANCE_PX / Math.min(rect.width, rect.height);
      const hit = hitTestDocument(pt, store.doc, tol);
      if (!hit) return;
      const el = store.doc.elements.find(
        (candidate) => candidate.id === hit.id,
      );
      if (el?.kind !== 'text') return;
      store.select(hit);
      beginTextEdit(el.id, false);
    },
    [beginTextEdit],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // The in-place editor owns the keyboard while it is open.
      if (editingRef.current) return;
      const store = useEditorStore.getState();
      if (e.key === 'Escape') {
        if (store.draft) {
          store.cancelDraft();
          e.preventDefault();
        } else if (store.selection) {
          store.select(null);
          e.preventDefault();
        }
        return;
      }
      if (e.key !== 'Enter') return;
      if (store.draft?.mode === 'polygon') {
        store.closeDraftPolygon();
        e.preventDefault();
        return;
      }
      // Keyboard shape creation only when the stage itself is focused, so an
      // Enter on a focused element control (handled by useItemControls) is not
      // duplicated here.
      if (e.target !== stageRef.current) return;
      const tool = store.activeTool;
      if (tool === 'select') return;
      e.preventDefault();
      if (tool === 'text') {
        const id = store.createTextAt({ x: 0.5, y: 0.5 });
        beginTextEdit(id, true);
      } else {
        store.insertDefaultShape(tool);
      }
    },
    [beginTextEdit],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    el.tabIndex = 0;
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerleave', handlePointerLeave);
    el.addEventListener('dblclick', handleDoubleClick);
    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerleave', handlePointerLeave);
      el.removeEventListener('dblclick', handleDoubleClick);
      el.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    handlePointerDown,
    handlePointerMove,
    handlePointerLeave,
    handleDoubleClick,
    handleKeyDown,
  ]);

  const editingElement =
    editing &&
    doc.elements.find(
      (el): el is Extract<SvgElement, { kind: 'text' }> =>
        el.id === editing.id && el.kind === 'text',
    );

  const stageStyle: CSSProperties = {
    width: stageSize?.width ?? '100%',
    height: stageSize?.height ?? '100%',
    cursor: cursorForTool(activeTool),
    touchAction: 'none',
  };

  const stageLabel = `Background canvas. Active tool: ${TOOL_LABELS[activeTool]}. Draw with the pointer, or press Enter to add a shape at the centre. Hold Shift while drawing to keep ellipses and rectangles regular. Select an item and press Delete to remove it, or double-click text to edit it.`;

  return (
    <div
      ref={containerRef}
      className="bg-background relative flex size-full items-center justify-center overflow-hidden"
    >
      {/* The stage must NOT clip (no overflow-hidden): resize handles and other
          overlay chrome extend ~10px past full-bleed shapes' edges, and an
          overflow-hidden padding box would exclude edge handles from
          hit-testing (the outer letterbox container clips instead). */}
      <div
        ref={stageRef}
        role="application"
        aria-label={stageLabel}
        className="focusable border-outline relative rounded-sm border"
        style={stageStyle}
      >
        {previewSurface === 'interview' && (
          <ThemedRegion
            theme="interview"
            className="bg-background pointer-events-none absolute inset-0"
          >
            {null}
          </ThemedRegion>
        )}
        {previewSurface === 'light' && (
          <div className="pointer-events-none absolute inset-0 bg-white" />
        )}
        {previewSurface === 'checker' && (
          <div
            className="pointer-events-none absolute inset-0"
            style={CHECKER_STYLE}
          />
        )}

        {blobUrl && (
          <img
            src={blobUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-contain"
          />
        )}

        <OverlaySvg
          doc={doc}
          selectionBounds={selectionBounds}
          draft={draft}
          zonesVisible={zonesVisible}
          guides={guides}
        />
        <ZonePills />
        <ResizeHandles getRect={getStageRect} onGuidesChange={setGuides} />
        <KeyboardTargets onActivate={activateElement} />

        {editingElement && stageSize && (
          <InlineTextEditor
            key={editingElement.id}
            element={editingElement}
            stage={stageSize}
            isNew={editing?.isNew ?? false}
            onCommit={commitTextEdit}
          />
        )}

        {zonesVisible && hoverLabel !== null && (
          <div
            aria-hidden="true"
            className="bg-surface/90 text-surface-contrast elevation-low pointer-events-none absolute bottom-2 left-2 rounded px-2 py-1 text-xs"
          >
            Zone: {hoverLabel}
          </div>
        )}
      </div>
    </div>
  );
}
