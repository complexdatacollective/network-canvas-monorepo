import { type KeyboardEvent as ReactKeyboardEvent, useRef } from 'react';

import { boundsCentre, elementBounds } from '~/state/documentGeometry';
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
  const el = doc.elements.find((e) => e.id === selection.id);
  if (!el) return;
  const centre = boundsCentre(elementBounds(el));
  announce(
    `Moved to x ${Math.round(centre.x * 100)}%, y ${Math.round(centre.y * 100)}%`,
  );
}

// Keyboard editing shared by every element's focusable control. Acts on the
// currently-selected item (focusing a control selects it), so one set of
// handlers serves every control. Arrow-key nudges coalesce into a single undo
// step in the store; the final position is announced once on key release, not
// per repeat. `onActivate` fires on Enter/Space so the caller can open the
// relevant editor (inline text, zone-label dialog) for the focused element.
export function useItemControls(onActivate?: () => void): {
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
        // Focus already selected the item; activate opens its editor (text →
        // inline editor, zone → label dialog) or is a no-op for plain shapes.
        e.preventDefault();
        onActivate?.();
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
