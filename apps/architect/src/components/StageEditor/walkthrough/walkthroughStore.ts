import { useSyncExternalStore } from 'react';

type WalkthroughState = Readonly<{
  open: boolean;
  /**
   * The step the walkthrough was last sent to, by id, or undefined for the
   * first one. An id rather than a position: which steps are shown changes as
   * the stage is edited, and a position would then name a different step.
   */
  stepId: string | undefined;
  /** The option picked for each question answered, by question id. */
  choices: Readonly<Record<string, string>>;
}>;

const CLOSED: WalkthroughState = Object.freeze({
  open: false,
  stepId: undefined,
  choices: Object.freeze({}),
});

let state: WalkthroughState = CLOSED;
let returnFocusTo: HTMLElement | null = null;
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

/**
 * Whether the stage editor's walkthrough is open, and which step it is on.
 *
 * Module state rather than a context because the button that opens it sits in
 * the editor's header slot and the panel in its action slot, and neither is
 * rendered inside the other.
 */
export function useWalkthroughState(): WalkthroughState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function openWalkthrough(launcher: HTMLElement | null) {
  returnFocusTo = launcher;
  set({ ...CLOSED, open: true });
}

export function goToWalkthroughStep(stepId: string) {
  set({ ...state, stepId });
}

/**
 * Records an answer and moves on to the step after the question. The step
 * after it may be one the answer hides; the panel then moves on to the next
 * step that is shown.
 */
export function chooseInWalkthrough(
  choice: string,
  option: string,
  nextStepId: string,
) {
  set({
    ...state,
    choices: { ...state.choices, [choice]: option },
    stepId: nextStepId,
  });
}

export function closeWalkthrough({ restoreFocus = true } = {}) {
  if (!state.open) return;
  set(CLOSED);
  const target = returnFocusTo;
  returnFocusTo = null;
  // After the next frame: the launcher is hidden while the walkthrough is
  // open, and cannot take focus until the page has re-rendered without it.
  if (restoreFocus && target !== null) {
    requestAnimationFrame(() => {
      if (target.isConnected) target.focus();
    });
  }
}
