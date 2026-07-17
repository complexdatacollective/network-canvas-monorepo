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
import { assignZone } from '~/geometry/zones';
import type { BackgroundDocument } from '~/model/types';
import {
  type Bounds,
  elementBounds,
  translateElement,
  translateZone,
  zoneBounds,
} from '~/state/documentGeometry';
import {
  type DragDraftTool,
  type EditorTool,
  type PreviewAspect,
  type Selection,
  useEditorStore,
} from '~/state/editorStore';
import { serializeDocument } from '~/svg/serialize';
import {
  editTextElementFlow,
  editZoneLabelFlow,
} from '~/toolbar/textEditDialog';

import { hitTestDocument } from './canvasGeometry';
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
  'select': 'Select',
  'rect': 'Rectangle',
  'ellipse': 'Ellipse',
  'line': 'Line',
  'polygon': 'Polygon',
  'text': 'Text',
  'zone-rect': 'Rectangle zone',
  'zone-circle': 'Circle zone',
  'zone-polygon': 'Polygon zone',
};

const CHECKER_STYLE: CSSProperties = {
  backgroundColor: 'var(--surface)',
  backgroundImage:
    'linear-gradient(45deg, var(--surface-2) 25%, transparent 25%), linear-gradient(-45deg, var(--surface-2) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--surface-2) 75%), linear-gradient(-45deg, transparent 75%, var(--surface-2) 75%)',
  backgroundSize: '24px 24px',
  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
};

function isDragTool(tool: EditorTool): tool is DragDraftTool {
  return (
    tool === 'rect' ||
    tool === 'ellipse' ||
    tool === 'line' ||
    tool === 'zone-rect' ||
    tool === 'zone-circle'
  );
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
  if (sel.type === 'element') {
    return {
      ...doc,
      elements: doc.elements.map((el) =>
        el.id === sel.id ? translateElement(el, dx, dy) : el,
      ),
    };
  }
  return {
    ...doc,
    zones: doc.zones.map((zone) =>
      zone.id === sel.id ? translateZone(zone, dx, dy) : zone,
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

  // The stage's pointer/dblclick handlers are stable (attached imperatively
  // below); keep the dialog context in a ref so they can open the text editor
  // without re-binding the listeners each time the dialog store re-renders.
  const dialogs = useDialog();
  const dialogsRef = useRef(dialogs);
  dialogsRef.current = dialogs;

  const stageSize = useStageSize(previewAspect, containerRef);

  const svg = useMemo(() => serializeDocument(doc), [doc]);
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

  const selectionBounds = useMemo<Bounds | null>(() => {
    if (!selection) return null;
    if (selection.type === 'element') {
      const el = doc.elements.find((e) => e.id === selection.id);
      return el ? elementBounds(el) : null;
    }
    const zone = doc.zones.find((z) => z.id === selection.id);
    return zone ? zoneBounds(zone) : null;
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
        const hit = hitTestDocument(pt, store.doc, tol, store.zonesVisible);
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
            if (!began) return;
            if (cancelled) {
              store.cancelGesture();
              return;
            }
            store.endGesture();
            if (moved) announceSelectionPosition();
          },
        });
        return;
      }

      if (tool === 'text') {
        store.createTextAt(pt);
        // Prompt for content right away so the user isn't left hunting for where
        // to type; cancelling keeps the placeholder the store just placed.
        const created = useEditorStore.getState().selection;
        if (created?.type === 'element') {
          void editTextElementFlow(dialogsRef.current, created.id);
        }
        return;
      }

      if (tool === 'polygon' || tool === 'zone-polygon') {
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
          onDrag: (currentPt) => store.updateDraft(currentPt),
          onEnd: ({ cancelled }) => {
            if (cancelled) store.cancelDraft();
            else store.commitDraft();
          },
        });
      }
    },
    [getStageRect],
  );

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const store = useEditorStore.getState();
    const pt = clientToNormalized(rect, e.clientX, e.clientY);

    if (store.draft?.mode === 'polygon') {
      store.updateDraft(pt);
    }

    if (store.zonesVisible && store.doc.zones.length > 0) {
      // rAF-throttled so the hover readout updates at most once per frame.
      if (hoverRafRef.current !== null) return;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const label = assignZone(pt, useEditorStore.getState().doc.zones);
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

  const handleDoubleClick = useCallback((e: MouseEvent) => {
    const store = useEditorStore.getState();
    if (store.draft?.mode === 'polygon') {
      store.closeDraftPolygon();
      return;
    }
    // A zone label pill sits over its zone centroid and often over a text label,
    // so decide by the topmost painted element at the cursor rather than the
    // hit-test (which ranks elements above zones). `elementFromPoint` returns the
    // pill button when one is under the cursor; that zone's label editor wins.
    const overlay = document.elementFromPoint(e.clientX, e.clientY);
    const pill = overlay?.closest('[data-zone-id]');
    if (pill instanceof HTMLElement && pill.dataset.zoneId) {
      const zoneId = pill.dataset.zoneId;
      store.select({ id: zoneId, type: 'zone' });
      void editZoneLabelFlow(dialogsRef.current, zoneId);
      return;
    }
    // Otherwise, double-clicking a text element opens its editor (any tool),
    // using the selection hit-test so a shape stacked over the text wins.
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pt = clientToNormalized(rect, e.clientX, e.clientY);
    const tol = HIT_TOLERANCE_PX / Math.min(rect.width, rect.height);
    const hit = hitTestDocument(pt, store.doc, tol, store.zonesVisible);
    if (hit?.type !== 'element') return;
    const el = store.doc.elements.find((candidate) => candidate.id === hit.id);
    if (el?.kind !== 'text') return;
    store.select(hit);
    void editTextElementFlow(dialogsRef.current, el.id);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const store = useEditorStore.getState();
    if (e.key === 'Escape') {
      if (store.draft) {
        store.cancelDraft();
        e.preventDefault();
      } else if (store.selection) {
        store.select(null);
        e.preventDefault();
      }
    } else if (e.key === 'Enter' && store.draft?.mode === 'polygon') {
      store.closeDraftPolygon();
      e.preventDefault();
    }
  }, []);

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

  const stageStyle: CSSProperties = {
    width: stageSize?.width ?? '100%',
    height: stageSize?.height ?? '100%',
    cursor: cursorForTool(activeTool),
    touchAction: 'none',
  };

  const stageLabel = `Background canvas. Active tool: ${TOOL_LABELS[activeTool]}. Draw with the pointer; select an item and press Delete to remove it, or double-click text to edit it.`;

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
        <KeyboardTargets />

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
