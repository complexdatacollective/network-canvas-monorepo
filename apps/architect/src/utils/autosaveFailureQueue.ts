let pendingAutosaveFailures = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const reportAutosaveFailure = (): void => {
  pendingAutosaveFailures += 1;
  emit();
};

export const subscribeAutosaveFailures = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const takeAutosaveFailures = (): number => {
  const taken = pendingAutosaveFailures;
  if (taken === 0) return taken;
  pendingAutosaveFailures = 0;
  emit();
  return taken;
};
