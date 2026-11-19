import { useSyncExternalStore } from 'react';

type WalkthroughState = Readonly<{
  open: boolean;
  step: number;
  collapsed: boolean;
  /**
   * The key of the editor section the current step is about, which the
   * section list marks. Set by the panel, which knows the steps.
   */
  section: string | undefined;
  /** The stage the walkthrough is about. */
  stage: string | undefined;
  /** Counts requests to bring an open panel to the researcher's attention. */
  focusRequest: number;
}>;

/**
 * The panel's offset from its home in the corner, and whether the researcher
 * dragged it there, in which case it stays put until a step about another
 * section.
 */
type Position = Readonly<{ x: number; y: number; byHand: boolean }>;

const CLOSED: WalkthroughState = {
  open: false,
  step: 0,
  collapsed: false,
  section: undefined,
  stage: undefined,
  focusRequest: 0,
};

let state: WalkthroughState = CLOSED;
/**
 * Where the panel is until the walkthrough closes. Kept apart from the state
 * above: the panel remounts when it is restored from the toolbar, and reading
 * this then puts it back where it was, while writing it on every move would
 * re-render the panel for nothing.
 */
let position: Position | undefined;
let returnFocusTo: HTMLElement | null = null;
let focusPending = false;
const listeners = new Set<() => void>();

function set(next: WalkthroughState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const whole = (snapshot: WalkthroughState) => snapshot;

/**
 * The walkthrough's state, or the part of it `select` picks. A component
 * re-renders only when what it picked changes, so `select` should return a
 * primitive or a part of the state as it is, not a new object.
 */
export function useWalkthroughState(): WalkthroughState;
export function useWalkthroughState<T>(
  select: (snapshot: WalkthroughState) => T,
): T;
export function useWalkthroughState<T>(
  select: (snapshot: WalkthroughState) => T | WalkthroughState = whole,
) {
  const getSnapshot = () => select(state);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Opens the walkthrough for `stage` at `step`, or at its start. Already open,
 * it moves to `step` if one is given, is restored if minimised, and is brought
 * to the researcher's attention.
 */
export function openWalkthrough(
  launcher: HTMLElement | null,
  stage: string,
  step?: number,
) {
  returnFocusTo = launcher;
  focusPending = true;
  if (state.open && state.stage === stage) {
    // Restored at another step (a section's button while minimised), the
    // panel goes beside that step's section, not back to where it was left.
    if (state.collapsed && step !== undefined && step !== state.step) {
      position = undefined;
    }
    set({
      ...state,
      ...(step === undefined ? {} : { step }),
      collapsed: false,
      focusRequest: state.focusRequest + 1,
    });
    return;
  }
  set({
    ...CLOSED,
    open: true,
    stage,
    step: step ?? 0,
  });
}

/**
 * Whether the panel should take focus now. True once per request, so only
 * opening, minimising or restoring the walkthrough moves focus, not any other
 * remount.
 */
export function takeWalkthroughFocus(): boolean {
  const pending = focusPending;
  focusPending = false;
  return pending;
}

/** `step`, kept within a walkthrough of `total` steps. */
export const stepWithin = (step: number, total: number) =>
  Math.min(step, Math.max(0, total - 1));

export function goToWalkthroughStep(step: number) {
  set({ ...state, step });
}

/** Where the panel was last put since the walkthrough opened, if anywhere. */
export const getWalkthroughPosition = (): Position | undefined => position;

export function setWalkthroughPosition(next: Position) {
  position = next;
}

export function setWalkthroughSection(section: string | undefined) {
  if (state.section === section) return;
  set({ ...state, section });
}

export function setWalkthroughCollapsed(collapsed: boolean) {
  if (state.collapsed === collapsed) return;
  focusPending = true;
  set({ ...state, collapsed });
}

/**
 * Closes the walkthrough, whether it was finished or not. Nothing about it is
 * kept: opened again, it starts from its first step with the panel in the
 * corner. (Minimising is not closing, and keeps both.)
 */
export function closeWalkthrough({ restoreFocus = true } = {}) {
  if (!state.open) return;
  position = undefined;
  set(CLOSED);
  const target = returnFocusTo;
  returnFocusTo = null;
  if (!restoreFocus) return;
  if (target?.isConnected) {
    target.focus();
    return;
  }
  // The control that opened it is gone (it is replaced while the walkthrough
  // is open): the toolbar control that comes back takes focus instead.
  focusPending = true;
}
