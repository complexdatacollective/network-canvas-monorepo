let pendingValidationFailures: string[] = [];
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const reportStartupProtocolValidationFailure = (
  message: string,
): void => {
  pendingValidationFailures.push(message);
  emit();
};

export const subscribeStartupProtocolValidationFailures = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const takeStartupProtocolValidationFailures = (): string[] => {
  const failures = pendingValidationFailures;
  pendingValidationFailures = [];
  return failures;
};
