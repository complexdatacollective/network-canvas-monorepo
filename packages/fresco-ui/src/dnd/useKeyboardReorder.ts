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
   *
   * A list that only learns later whether the move landed (one that asks a
   * server) returns a promise of that answer instead. Until it settles the
   * control waits to reclaim focus as for any move; `false`, or a rejection,
   * withdraws that claim exactly as an immediate refusal does.
   */
  onMove: (targetIndex: number) => void | boolean | Promise<boolean>;
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
/**
 * Whether focus is somewhere only a reorder could have put it: on the page
 * body, where a repositioned control's focus falls, or still on the control.
 * Exported for a list that gives focus back to a control of its own after the
 * same kind of move.
 */
export function focusWasLost(control: HTMLElement): boolean {
  const active = control.ownerDocument.activeElement;
  return (
    active === null ||
    active === control.ownerDocument.body ||
    active === control
  );
}

export function useKeyboardReorder<E extends HTMLElement = HTMLButtonElement>({
  index,
  itemCount,
  onMove,
}: KeyboardReorderOptions): KeyboardReorder<E> {
  const ref = useRef<E>(null);
  // Where a keyboard move started, while one is waiting to land. An object
  // rather than the bare index, so an answer that arrives late withdraws only
  // the claim its own press made, never a newer one.
  const movedFromIndexRef = useRef<{ fromIndex: number } | null>(null);

  // Committing a keyboard reorder repositions this control in the DOM, which
  // blurs it in browsers and drops focus to <body>. Restore focus on the next
  // frame (after the reposition settles) so repeated arrow presses keep working
  // without tabbing back to the control each step. Only focus the reorder took
  // away is given back: a user who moved focus somewhere else while the move
  // was landing meant to, and keeps it.
  useEffect(() => {
    const movedFrom = movedFromIndexRef.current;
    if (movedFrom === null || movedFrom.fromIndex === index) return undefined;
    movedFromIndexRef.current = null;
    const frame = requestAnimationFrame(() => {
      if (ref.current !== null && focusWasLost(ref.current)) {
        ref.current.focus();
      }
    });
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
    // effect above has to see where it started; disarmed again the moment the list says
    // it refused. Leaving it armed after a refusal is not harmless: `index`
    // never changes, so it survives until some UNRELATED reorder or
    // deletion shifts this item — and focus is then yanked onto this control
    // out of nowhere, long after the arrow press that armed it.
    //
    // A move whose answer comes later is the same hazard, later: a server
    // that refuses or loses the move leaves `index` where it was just as a
    // synchronous refusal does.
    const claim = { fromIndex: index };
    movedFromIndexRef.current = claim;
    const withdraw = () => {
      if (movedFromIndexRef.current === claim) movedFromIndexRef.current = null;
    };
    const answer = onMove(targetIndex);
    if (answer === false) {
      withdraw();
    } else if (answer instanceof Promise) {
      void answer.then((moved) => (moved ? undefined : withdraw()), withdraw);
    }
  };

  return { ref, onKeyDown, 'aria-keyshortcuts': 'ArrowUp ArrowDown' };
}
