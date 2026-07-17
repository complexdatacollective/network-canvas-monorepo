import { type KeyboardEvent as ReactKeyboardEvent, useRef } from 'react';

import {
  boundsCentre,
  elementBounds,
  zoneBounds,
} from '~/state/documentGeometry';
import { useEditorStore } from '~/state/editorStore';

const STEP = 0.01;
const STEP_LARGE = 0.05;

const isArrow = (key: string): boolean =>
  key === 'ArrowUp' ||
  key === 'ArrowDown' ||
  key === 'ArrowLeft' ||
  key === 'ArrowRight';

export function announceSelectionPosition(): void {
  const { doc, selection, announce } = useEditorStore.getState();
  if (!selection) return;
  let centre: { x: number; y: number } | null = null;
  if (selection.type === 'element') {
    const el = doc.elements.find((e) => e.id === selection.id);
    if (el) centre = boundsCentre(elementBounds(el));
  } else {
    const zone = doc.zones.find((z) => z.id === selection.id);
    if (zone) centre = boundsCentre(zoneBounds(zone));
  }
  if (!centre) return;
  announce(
    `Moved to x ${Math.round(centre.x * 100)}%, y ${Math.round(centre.y * 100)}%`,
  );
}

// Keyboard editing shared by the element targets and the zone pills. Acts on the
// currently-selected item (focusing a control selects it), so one set of handlers
// serves every control. Arrow-key nudges coalesce into a single undo step in the
// store; the final position is announced once on key release, not per repeat.
export function useItemControls(): {
  onKeyDown: (e: ReactKeyboardEvent) => void;
  onKeyUp: (e: ReactKeyboardEvent) => void;
} {
  const nudgedRef = useRef(false);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const store = useEditorStore.getState();
    const step = e.shiftKey ? STEP_LARGE : STEP;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        store.moveSelectedBy(0, -step);
        nudgedRef.current = true;
        break;
      case 'ArrowDown':
        e.preventDefault();
        store.moveSelectedBy(0, step);
        nudgedRef.current = true;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        store.moveSelectedBy(-step, 0);
        nudgedRef.current = true;
        break;
      case 'ArrowRight':
        e.preventDefault();
        store.moveSelectedBy(step, 0);
        nudgedRef.current = true;
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        store.deleteSelected();
        break;
      case 'Enter':
      case ' ':
        // Focus already selected the item; the key just confirms it.
        e.preventDefault();
        break;
      default:
        break;
    }
  };

  const onKeyUp = (e: ReactKeyboardEvent) => {
    if (isArrow(e.key) && nudgedRef.current) {
      nudgedRef.current = false;
      announceSelectionPosition();
    }
  };

  return { onKeyDown, onKeyUp };
}
