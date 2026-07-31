export type StoreRehydrationResult = 'rehydrated' | 'failed' | 'timed-out';

export type StoreRehydrationGate = {
  promise: Promise<StoreRehydrationResult>;
  settle: (result: StoreRehydrationResult) => void;
  getResult: () => StoreRehydrationResult | null;
};

const STORE_REHYDRATION_TIMEOUT_MS = 2_000;

export const createStoreRehydrationGate = (
  timeoutMs = STORE_REHYDRATION_TIMEOUT_MS,
): StoreRehydrationGate => {
  let result: StoreRehydrationResult | null = null;
  let resolvePromise: (result: StoreRehydrationResult) => void = () => {};
  const promise = new Promise<StoreRehydrationResult>((resolve) => {
    resolvePromise = resolve;
  });
  const timeout = setTimeout(() => {
    settle('timed-out');
  }, timeoutMs);

  function settle(nextResult: StoreRehydrationResult): void {
    if (result !== null) return;
    result = nextResult;
    clearTimeout(timeout);
    resolvePromise(nextResult);
  }

  return {
    promise,
    settle,
    getResult: () => result,
  };
};
