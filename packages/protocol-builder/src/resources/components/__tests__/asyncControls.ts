export type Deferred<T> = Readonly<{
  promise: Promise<T>;
  /** Answers the held call. */
  settle: (value: T) => void;
}>;

/** A call the test decides the timing and the answer of. */
export function deferred<T>(): Deferred<T> {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (value: T) => settle(value) };
}

/**
 * Runs the microtasks and the zero-delay timers a held call's own continuation
 * needs, inside `act`, so a state update it should NOT make has had every
 * chance to happen before the assertion that it did not.
 */
export async function flushPendingWork(): Promise<void> {
  await new Promise((settle) => setTimeout(settle, 0));
  await new Promise((settle) => setTimeout(settle, 0));
}
