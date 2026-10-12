'use client';

import { useCallback, useRef } from 'react';

import { useTrackWrite } from '../store/WritesInFlightContext';

/**
 * `save`, called one at a time: each call waits until every earlier call has
 * settled, so saves are applied in the order they were made, even when an
 * earlier one takes longer, as one that encrypts an answer can. Each call is a
 * session write under way from the moment it is made, stored when `stored`
 * says its result is, so leaving the stage, finishing or closing waits for the
 * calls still waiting their turn too. Pass a `stored` that does not change
 * between renders.
 */
export default function useSavesInOrder<Args extends unknown[], Result>(
  save: (...args: Args) => Promise<Result>,
  stored: (result: Result) => boolean,
): (...args: Args) => Promise<Result> {
  const trackWrite = useTrackWrite();
  const previous = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(
    (...args: Args) => {
      const call = previous.current.then(() => save(...args));
      previous.current = call.catch(() => undefined);
      trackWrite(call.then(stored));
      return call;
    },
    [save, stored, trackWrite],
  );
}
