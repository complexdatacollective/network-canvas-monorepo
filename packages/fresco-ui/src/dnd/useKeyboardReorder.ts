'use client';

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

export type KeyboardReorderOptions = {
  /** This item's position in the list. */
  index: number;
  /** How many items the list currently holds. */
  itemCount: number;
  /**
   * Move the item to `targetIndex`.
   *
   * Return `false` when the move is REFUSED — a list with ordering rules of its
   * own (Architect's timeline refuses a reorder that would strand a skip
   * destination) leaves the item where it was, and the control must then not go
   * on waiting to reclaim focus. Returning nothing means the move happened,
   * which is what every caller without ordering rules does.
   */
  onMove: (targetIndex: number) => void | boolean;
};

export type KeyboardReorder<E extends HTMLElement> = {
  /** Attach to the control that holds focus while reordering. */
  'ref': RefObject<E | null>;
  'onKeyDown': (event: KeyboardEvent<E>) => void;
  /** Spread onto the control so the shortcut is announced. */
  'aria-keyshortcuts': string;
};

/**
 * Arrow-key reordering for one item of a reorderable list.
 *
 * The whole mechanism lives here — the bounds check, the refusal channel, and
 * the refocus that a keyboard move otherwise loses — so that no list has to
 * re-derive it. `ArrayFieldDragHandle` consumes it; so should any other list
 * that offers a keyboard equivalent to dragging, rather than hand-rolling a
 * copy that drifts (Architect's stage timeline is the outstanding one).
 */
export function useKeyboardReorder<E extends HTMLElement = HTMLButtonElement>({
  index,
  itemCount,
  onMove,
}: KeyboardReorderOptions): KeyboardReorder<E> {
  const ref = useRef<E>(null);
  const refocusAfterMoveRef = useRef(false);

  // Committing a keyboard reorder repositions this control in the DOM, which
  // blurs it in browsers and drops focus to <body>. Restore focus on the next
  // frame (after the reposition settles) so repeated arrow presses keep working
  // without tabbing back to the control each step.
  useEffect(() => {
    if (!refocusAfterMoveRef.current) return undefined;
    refocusAfterMoveRef.current = false;
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [index]);

  const onKeyDown = (event: KeyboardEvent<E>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();
    event.stopPropagation();

    const targetIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
    // Ignore presses that would run off either end: no move happens, so focus
    // is never lost and no refocus should be scheduled.
    if (targetIndex < 0 || targetIndex > itemCount - 1) return;

    // Armed BEFORE the call, because `onMove` may commit synchronously and the
    // effect above has to see the flag; disarmed again the moment the list says
    // it refused. Leaving it armed after a refusal is not harmless: `index`
    // never changes, so the flag survives until some UNRELATED reorder or
    // deletion shifts this item — and focus is then yanked onto this control
    // out of nowhere, long after the arrow press that armed it.
    refocusAfterMoveRef.current = true;
    if (onMove(targetIndex) === false) {
      refocusAfterMoveRef.current = false;
    }
  };

  return { ref, onKeyDown, 'aria-keyshortcuts': 'ArrowUp ArrowDown' };
}
