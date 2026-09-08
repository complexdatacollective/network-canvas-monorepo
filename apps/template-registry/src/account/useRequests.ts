import { useCallback, useEffect, useRef } from 'react';

/** A result from a dismissed account/credential/operator surface must never
 * repopulate private state, even when the server finishes after cancellation. */
export function useRequests() {
  const active = useRef(false);
  const pending = useRef(new Set<AbortController>());
  const cancel = useCallback(() => {
    for (const controller of pending.current) controller.abort();
    pending.current.clear();
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancel();
    };
  }, [cancel]);
  const run = useCallback(
    async <T>(
      work: (signal: AbortSignal) => Promise<T>,
    ): Promise<T | undefined> => {
      if (!active.current) return undefined;
      const controller = new AbortController();
      pending.current.add(controller);
      try {
        const result = await work(controller.signal);
        return active.current && !controller.signal.aborted
          ? result
          : undefined;
      } catch (error) {
        if (active.current && !controller.signal.aborted) throw error;
        return undefined;
      } finally {
        pending.current.delete(controller);
      }
    },
    [],
  );
  return { run, cancel };
}
