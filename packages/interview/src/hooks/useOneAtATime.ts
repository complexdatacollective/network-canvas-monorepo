import { useCallback, useRef } from 'react';

/**
 * `run`, called one at a time: each call waits until every earlier call has
 * settled. Writes made through it are applied in the order they were made,
 * even when an earlier one takes longer, as one that encrypts an answer can.
 */
export default function useOneAtATime<Args extends unknown[], Result>(
  run: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  const previous = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(
    (...args: Args) => {
      const call = previous.current.then(() => run(...args));
      previous.current = call.catch(() => undefined);
      return call;
    },
    [run],
  );
}
