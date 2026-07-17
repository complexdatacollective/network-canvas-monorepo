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
import type { BackgroundDocument, SvgElement } from '~/model/types';
import {
  type Bounds,
  elementBounds,
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
import { clientToNormalized, startPointerGesture } from './pointerGesture';

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
  // serialized preview, so the live textarea is the only rendering of it.
  const svg = useMemo(() => {
    const source = editing
      ? {
          ...doc,
          elements: doc.elements.filter((el) => el.id !== editing.id),
        }
      : doc;
    return serializeDocument(source);
  }, [doc, editing]);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [svg]);

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

  // The stage's pointer/keyboard handlers are attached imperatively (below)
  // rather than as JSX props. The surface carries role="application"; a literal
  // tabIndex or an onKeyDown/pointer prop there trips jsx-a11y's
  // non-interactive-element heuristics. Native listeners scoped to the stage
  // element are equivalent and only fire while the pointer/focus is on it.
  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
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
        let last = pt;
        let began = false;
        startPointerGesture(e, el, getStageRect, {
          onDrag: (current) => {
            if (!began) {
              store.beginGesture();
              began = true;
            }
            const dx = current.x - last.x;
            const dy = current.y - last.y;
            store.updateGesture((d) => moveInDoc(d, hit, dx, dy));
            last = current;
          },
          onEnd: ({ moved, cancelled }) => {
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
        store.beginDraft(tool, pt);
        startPointerGesture(e, el, getStageRect, {
          onDrag: (currentPt, _start, shiftKey) => {
            const r = getStageRect();
            store.updateDraft(
              currentPt,
              shiftKey && r ? { width: r.width, height: r.height } : null,
            );
          },
          onEnd: ({ cancelled }) => {
            if (cancelled) store.cancelDraft();
            else store.commitDraft();
          },
        });
      }
    },
    [getStageRect, beginTextEdit],
  );

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const store = useEditorStore.getState();
    const pt = clientToNormalized(rect, e.clientX, e.clientY);

    if (store.draft?.mode === 'polygon') {
      store.updateDraft(pt);
    }

    if (store.zonesVisible) {
      const zones = zonesOf(store.doc);
      if (zones.length === 0) return;
      // rAF-throttled so the hover readout updates at most once per frame.
      if (hoverRafRef.current !== null) return;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const label = assignZone(pt, zonesOf(useEditorStore.getState().doc));
        setHoverLabel(label ?? 'no zone');
      });
    }
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
      <div
        ref={stageRef}
        role="application"
        aria-label={stageLabel}
        className="focusable border-outline relative overflow-hidden rounded-sm border"
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
        />
        <ZonePills />
        <ResizeHandles getRect={getStageRect} />
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
