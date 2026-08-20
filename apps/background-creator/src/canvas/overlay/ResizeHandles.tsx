import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react';

import type { BackgroundDocument } from '~/model/types';
import { useEditorStore } from '~/state/editorStore';
import {
  computeSnap,
  NO_GUIDES,
  type SnapGuides,
  type SnapLines,
  snapLines,
} from '~/state/snapping';

import {
  cursorForHandle,
  elementHandles,
  type Handle,
  type HandlePlacement,
} from '../canvasGeometry';
import { flushFocusedField } from '../focusedField';
import { RESIZE_HANDLE_ATTR } from '../overlayTargets';
import { startPointerGesture } from '../pointerGesture';
import { resizeDocumentFromSnapshot } from '../resizeGesture';

// Pointer-only resize affordances for the selected item under the select tool.
// Keyboard editing covers move + delete (see useItemControls); resize is a
// pointer enhancement, so the dots are aria-hidden and not in the tab order.
export function ResizeHandles({
  getRect,
  onGuidesChange,
}: {
  getRect: () => DOMRect | null;
  onGuidesChange: (guides: SnapGuides) => void;
}): ReactElement | null {
  const selection = useEditorStore((s) => s.selection);
  const activeTool = useEditorStore((s) => s.activeTool);
  const doc = useEditorStore((s) => s.doc);

  if (activeTool !== 'select' || !selection) return null;

  const el = doc.elements.find((e) => e.id === selection.id);
  const placements: HandlePlacement[] = el ? elementHandles(el) : [];
  if (!el || placements.length === 0) return null;

  // With Shift, a rect/ellipse corner-resize derives its y extent from x
  // (constrainRegular), so snapping y would fight the constraint — snap only x
  // and let the constraint place y. Lines carry no such constraint.
  const shiftConstrains = el.kind === 'rect' || el.kind === 'ellipse';

  const startResize = (e: ReactPointerEvent, handle: Handle) => {
    const startRect = getRect();
    let originalDoc: BackgroundDocument | null = null;
    let candidates: SnapLines | null = null;
    startPointerGesture(e, e.currentTarget, getRect, {
      onStart: () => {
        // A property control commits on blur. Flush it before taking the
        // gesture snapshot so its history entry cannot clear this resize's
        // snapshot on the browser's later pointerdown-driven focus change.
        flushFocusedField();
        const store = useEditorStore.getState();
        originalDoc = store.doc;
        // Other elements don't move during a resize, so the snap candidates
        // are fixed for the gesture and derive from the same original snapshot.
        candidates = snapLines(
          originalDoc,
          selection.id,
          startRect
            ? { width: startRect.width, height: startRect.height }
            : null,
        );
        store.beginGesture();
      },
      onDrag: (pt, _start, shiftKey, altKey) => {
        if (!originalDoc || !candidates) return;
        const rect = getRect();
        const fullStage = rect
          ? { width: rect.width, height: rect.height }
          : null;
        // `constrainStage` (only under Shift) drives the visual square/circle.
        const constrainStage = shiftKey ? fullStage : null;
        let moving = pt;
        if (!altKey && fullStage) {
          const axes =
            shiftKey && shiftConstrains ? { x: true, y: false } : undefined;
          const snap = computeSnap(pt, candidates, fullStage, { axes });
          onGuidesChange(snap.guides);
          moving = snap.point;
        } else {
          onGuidesChange(NO_GUIDES);
        }
        const snapshot = originalDoc;
        useEditorStore
          .getState()
          .updateGesture(() =>
            resizeDocumentFromSnapshot(
              snapshot,
              selection.id,
              handle,
              moving,
              constrainStage,
            ),
          );
      },
      onEnd: ({ cancelled }) => {
        const store = useEditorStore.getState();
        onGuidesChange(NO_GUIDES);
        if (cancelled) {
          store.cancelGesture();
          return;
        }
        store.endGesture();
      },
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {placements.map(({ handle, pos }, index) => {
        const style: CSSProperties = {
          left: `${pos.x * 100}%`,
          top: `${pos.y * 100}%`,
          cursor: cursorForHandle(handle),
          touchAction: 'none',
        };
        return (
          // The button is a generous ~20px transparent hit target so grabbing
          // "the corner" is easy; the visible 12px dot inside is inert. The stage
          // yields to `[data-resize-handle]` (see overlayTargets) so this
          // button's own pointerdown wins the gesture.
          <button
            key={index}
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            {...{ [RESIZE_HANDLE_ATTR]: '' }}
            className="pointer-events-auto absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-transparent"
            style={style}
            onPointerDown={(e) => startResize(e, handle)}
          >
            <span
              aria-hidden="true"
              className="border-surface bg-selected size-3 rounded-full border-2 shadow"
            />
          </button>
        );
      })}
    </div>
  );
}
