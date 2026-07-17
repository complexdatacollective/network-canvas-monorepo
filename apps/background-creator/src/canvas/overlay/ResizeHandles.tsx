import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react';

import type { BackgroundDocument } from '~/model/types';
import { useEditorStore } from '~/state/editorStore';

import {
  cursorForHandle,
  elementHandles,
  type Handle,
  type HandlePlacement,
  resizeElement,
  resizeZone,
  zoneHandles,
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

  let placements: HandlePlacement[] = [];
  if (selection.type === 'element') {
    const el = doc.elements.find((e) => e.id === selection.id);
    if (el) placements = elementHandles(el);
  } else {
    const zone = doc.zones.find((z) => z.id === selection.id);
    if (zone) placements = zoneHandles(zone);
  }
  if (placements.length === 0) return null;

  const applyResize = (
    d: BackgroundDocument,
    handle: Handle,
    pt: { x: number; y: number },
  ): BackgroundDocument => {
    if (selection.type === 'element') {
      return {
        ...d,
        elements: d.elements.map((el) =>
          el.id === selection.id ? resizeElement(el, handle, pt) : el,
        ),
      };
    }
    return {
      ...d,
      zones: d.zones.map((z) =>
        z.id === selection.id ? resizeZone(z, handle, pt) : z,
      ),
    };
  };

  const startResize = (e: ReactPointerEvent, handle: Handle) => {
    e.stopPropagation();
    const store = useEditorStore.getState();
    startPointerGesture(e, e.currentTarget, getRect, {
      onStart: () => store.beginGesture(),
      onDrag: (pt) => store.updateGesture((d) => applyResize(d, handle, pt)),
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
