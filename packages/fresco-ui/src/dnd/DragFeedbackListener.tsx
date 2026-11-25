'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

import type { DropOutcome } from './types';

type DragFeedback = {
  /**
   * Called each time a drag starts inside the listener: when a pointer has
   * moved far enough to drag an item, or when a keyboard drag picks one up.
   * Never called for a press or a tap that does not become a drag.
   */
  onDragStart?: () => void;
  /**
   * Called each time an item is dropped on a target that accepts it, with
   * what the target's `dropFeedback` says this drop means (undefined when it
   * declares none; see `DropFeedback`) and `drop`,
   * which carries out the drop by calling the target's own drop handler and
   * returns what the handler returned: whether it took the drop (see
   * `DropOutcome`). The listener must call `drop` once, before it returns. A
   * drag that ends where nothing accepts the item, or that is cancelled, is
   * not a drop.
   */
  onDrop?: (feedback: string | undefined, drop: () => DropOutcome) => void;
};

const NO_FEEDBACK: Required<DragFeedback> = {
  onDragStart: () => undefined,
  onDrop: (_feedback, drop) => {
    void drop();
  },
};

const DragFeedbackListenerContext =
  createContext<Required<DragFeedback>>(NO_FEEDBACK);

type DragFeedbackListenerProps = DragFeedback & {
  children?: ReactNode;
};

/**
 * Tells its owner when an item is picked up and when it is dropped, for
 * feedback that belongs to the surroundings rather than to one drag source
 * or drop target (the interview's sounds). Each drop target says what a drop
 * on it means through its `dropFeedback`, a name the owner gives meaning to.
 */
export function DragFeedbackListener({
  onDragStart,
  onDrop,
  children,
}: DragFeedbackListenerProps) {
  // The latest callbacks, behind functions that stay the same for the life
  // of the listener, so a drag source or drop target does not re-run its
  // effects each time the owner renders.
  const latest = useRef({ onDragStart, onDrop });
  useLayoutEffect(() => {
    latest.current = { onDragStart, onDrop };
  });
  const feedback = useMemo<Required<DragFeedback>>(
    () => ({
      onDragStart: () => latest.current.onDragStart?.(),
      onDrop: (dropFeedback, drop) => {
        const handler = latest.current.onDrop;
        if (handler) handler(dropFeedback, drop);
        else void drop();
      },
    }),
    [],
  );
  return (
    <DragFeedbackListenerContext value={feedback}>
      {children}
    </DragFeedbackListenerContext>
  );
}

/**
 * The nearest `DragFeedbackListener`'s callbacks. Without one, a drag start
 * goes unreported and a drop is simply carried out. They are stable for the
 * life of the listener.
 */
export const useDragFeedback = (): Required<DragFeedback> =>
  useContext(DragFeedbackListenerContext);
