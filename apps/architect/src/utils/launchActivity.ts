import { hasPendingLaunchFiles, subscribeLaunchFiles } from './fileLaunchQueue';

// Work that opens a protocol without the researcher having asked from the
// start screen: a protocol named in the URL, a file launched or handed over,
// and the dialog each of them may raise. A build served inside Architect 9 has
// no start screen of its own and returns to Architect 9 instead, which must
// wait until this work is done: it may still open the editor, or be showing
// the researcher why it could not.

let inFlight = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of Array.from(listeners)) listener();
};

/** Count `work` as launch activity until it settles; resolves as it does. */
export const trackLaunchActivity = <T>(work: Promise<T>): Promise<T> => {
  inFlight += 1;
  emit();
  return work.finally(() => {
    inFlight -= 1;
    emit();
  });
};

export const isLaunchActivityInProgress = (): boolean =>
  inFlight > 0 || hasPendingLaunchFiles();

export const subscribeLaunchActivity = (listener: () => void): (() => void) => {
  listeners.add(listener);
  const unsubscribeFiles = subscribeLaunchFiles(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeFiles();
  };
};
