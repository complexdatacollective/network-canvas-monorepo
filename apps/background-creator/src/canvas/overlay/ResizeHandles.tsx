import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react';

import type { BackgroundDocument } from '~/model/types';
import type { StageBox } from '~/state/documentGeometry';
import { useEditorStore } from '~/state/editorStore';

import {
  cursorForHandle,
  elementHandles,
  type Handle,
  type HandlePlacement,
  resizeElement,
} from '../canvasGeometry';
import { startPointerGesture } from '../pointerGesture';

// Pointer-only resize affordances for the selected item under the select tool.
// Keyboard editing covers move + delete (see useItemControls); resize is a
// pointer enhancement, so the dots are aria-hidden and not in the tab order.
export function ResizeHandles({
  getRect,
}: {
  getRect: () => DOMRect | null;
}): ReactElement | null {
  const selection = useEditorStore((s) => s.selection);
  const activeTool = useEditorStore((s) => s.activeTool);
  const doc = useEditorStore((s) => s.doc);

  if (activeTool !== 'select' || !selection) return null;

  const el = doc.elements.find((e) => e.id === selection.id);
  const placements: HandlePlacement[] = el ? elementHandles(el) : [];
  if (placements.length === 0) return null;

  const applyResize = (
    d: BackgroundDocument,
    handle: Handle,
    pt: { x: number; y: number },
    stage: StageBox | null,
  ): BackgroundDocument => ({
    ...d,
    elements: d.elements.map((element) =>
      element.id === selection.id
        ? resizeElement(element, handle, pt, stage)
        : element,
    ),
  });

  const startResize = (e: ReactPointerEvent, handle: Handle) => {
    e.stopPropagation();
    const store = useEditorStore.getState();
    startPointerGesture(e, e.currentTarget, getRect, {
      onStart: () => store.beginGesture(),
      onDrag: (pt, _start, shiftKey) => {
        const rect = getRect();
        const stage =
          shiftKey && rect ? { width: rect.width, height: rect.height } : null;
        store.updateGesture((d) => applyResize(d, handle, pt, stage));
      },
      onEnd: ({ moved, cancelled }) => {
        if (cancelled) {
          store.cancelGesture();
          return;
        }
        store.endGesture();
        if (moved) store.announce('Resized');
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
          <button
            key={index}
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="border-surface bg-selected pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow"
            style={style}
            onPointerDown={(e) => startResize(e, handle)}
          />
        );
      })}
    </div>
  );
}
