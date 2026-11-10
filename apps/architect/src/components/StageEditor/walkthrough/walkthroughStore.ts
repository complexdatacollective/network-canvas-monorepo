import { useSyncExternalStore } from 'react';

type WalkthroughState = Readonly<{
  open: boolean;
  step: number;
  collapsed: boolean;
  /** Whether the researcher has widened the panel to read it more easily. */
  expanded: boolean;
  /**
   * Where the researcher is in the steps written for each open dialog, by
   * the dialog's serial, so a dialog keeps its place while another is opened
   * from inside it.
   */
  detours: Readonly<Record<number, number>>;
  /** The editor section the current step is about, for the section list. */
  section: string | undefined;
  /** The stage the walkthrough is about, whose progress it keeps. */
  stage: string | undefined;
  /** Counts requests to bring an open panel to the researcher's attention. */
  focusRequest: number;
}>;

type Position = Readonly<{ x: number; y: number }>;

const CLOSED: WalkthroughState = {
  open: false,
  step: 0,
  collapsed: false,
  expanded: false,
  detours: {},
  section: undefined,
  stage: undefined,
  focusRequest: 0,
};

let state: WalkthroughState = CLOSED;
/**
 * Where the researcher has moved the panel to, from its home in the corner.
 * Kept apart from the state above: the panel remounts when it follows a
 * dialog, and reading this then puts it back where it was, while writing it
 * on every drag would re-render the panel for nothing.
 */
let position: Position = { x: 0, y: 0 };
let returnFocusTo: HTMLElement | null = null;
/**
 * The step each stage's walkthrough was left on, so opening it again carries
 * on there. Kept until the page reloads.
 */
const progress = new Map<string, number>();
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

const getSnapshot = () => state;

export function useWalkthroughState(): WalkthroughState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Opens the walkthrough for `stage` where the researcher left it. Already
 * open, it is restored if minimised and brought to their attention.
 */
export function openWalkthrough(launcher: HTMLElement | null, stage: string) {
  returnFocusTo = launcher;
  focusPending = true;
  if (state.open && state.stage === stage) {
    set({
      ...state,
      collapsed: false,
      focusRequest: state.focusRequest + 1,
    });
    return;
  }
  set({ ...CLOSED, open: true, stage, step: progress.get(stage) ?? 0 });
}

/**
 * Whether the panel should take focus now. True once per request: the panel
 * remounts when it moves into or out of a dialog, and taking focus then would
 * pull it out of the dialog the researcher is working in.
 */
export function takeWalkthroughFocus(): boolean {
  const pending = focusPending;
  focusPending = false;
  return pending;
}

export function goToWalkthroughStep(step: number) {
  if (state.stage !== undefined) progress.set(state.stage, step);
  set({ ...state, step });
}

export function goToDetourStep(serial: number, index: number) {
  set({ ...state, detours: { ...state.detours, [serial]: index } });
}

export const getWalkthroughPosition = (): Position => position;

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

export function setWalkthroughExpanded(expanded: boolean) {
  if (state.expanded === expanded) return;
  set({ ...state, expanded });
}

/**
 * Closes the walkthrough. Its place is kept for next time, unless it was
 * closed by finishing it.
 */
export function closeWalkthrough({
  restoreFocus = true,
  finished = false,
} = {}) {
  if (!state.open) return;
  if (finished && state.stage !== undefined) progress.delete(state.stage);
  set(CLOSED);
  const target = returnFocusTo;
  returnFocusTo = null;
  if (restoreFocus && target?.isConnected) target.focus();
}
