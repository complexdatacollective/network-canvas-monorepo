'use client';

import { useCallback, useRef } from 'react';

/**
 * `run`, called one at a time: each call waits until every earlier call has
 * settled. Writes made through it are applied in the order they were made,
 * even when an earlier one takes longer, as one that encrypts an answer can.
 */
export default function useOneAtATime<Args extends unknown[], Result>(
  run: (...args: Args) => Promise<Result>,
): {
  run: (...args: Args) => Promise<Result>;
  // The latest call, which settles after every earlier one, or undefined when
  // none is waiting or running.
  latest: () => Promise<Result> | undefined;
} {
  const previous = useRef<Promise<unknown>>(Promise.resolve());
  const latestCall = useRef<Promise<Result>>(undefined);
  const unsettled = useRef(0);

  const runInOrder = useCallback(
    (...args: Args) => {
      unsettled.current += 1;
      const call = previous.current.then(() => run(...args));
      latestCall.current = call;
      previous.current = call
        .catch(() => undefined)
        .finally(() => {
          unsettled.current -= 1;
        });
      return call;
    },
    [run],
  );

  const latest = useCallback(
    () => (unsettled.current > 0 ? latestCall.current : undefined),
    [],
  );

  return { run: runInOrder, latest };
}
