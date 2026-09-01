import type { StoredProtocolRefusal } from './storedProtocolAdmission';

/**
 * Reasons the session restored at launch could not be opened, waiting for a
 * React tree to report them in.
 *
 * Carries the whole refusal rather than a bare message: the restored session
 * can fail because the row is invalid, because it was written by a newer
 * Architect, or because an in-place upgrade could not be completed, and each
 * of those is a different dialog. `showProtocolOpenResultDialog` already knows
 * how to render all three, so the queue passes the refusal through untouched.
 */
let pendingFailures: StoredProtocolRefusal[] = [];
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const reportStartupProtocolFailure = (
  refusal: StoredProtocolRefusal,
): void => {
  pendingFailures.push(refusal);
  emit();
};

export const subscribeStartupProtocolFailures = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const takeStartupProtocolFailures = (): StoredProtocolRefusal[] => {
  const failures = pendingFailures;
  pendingFailures = [];
  return failures;
};
