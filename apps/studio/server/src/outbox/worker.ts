import { requirePositiveFinite } from './dispatcher.ts';
import {
  observeOutbox,
  type OutboxObserver,
  type OutboxQueue,
} from './instrumentation.ts';

type OutboxWorkerOptions = {
  queue: OutboxQueue;
  runOnce(): Promise<{ claimed: number }>;
  observer?: OutboxObserver;
  onError?: (error: unknown) => void | Promise<void>;
  pollIntervalMs?: number;
  drainLimit?: number;
};

export type OutboxWorker = { stop(): Promise<void> };

/** One serial, bounded drain at a time; stopping waits for its active attempt. */
export function startOutboxWorker(options: OutboxWorkerOptions): OutboxWorker {
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const drainLimit = options.drainLimit ?? 10;
  requirePositiveFinite('pollIntervalMs', pollIntervalMs);
  if (!Number.isInteger(drainLimit) || drainLimit < 1) {
    throw new Error('drainLimit must be a positive integer');
  }

  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<void> = Promise.resolve();

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      active = (async () => {
        for (let index = 0; index < drainLimit; index += 1) {
          if (stopped) break;
          const result = await options.runOnce();
          if (result.claimed === 0) break;
        }
      })()
        .catch((error: unknown) => {
          observeOutbox(options.observer, {
            queue: options.queue,
            kind: 'worker_error',
          });
          try {
            void Promise.resolve(options.onError?.(error)).catch(
              () => undefined,
            );
          } catch {
            // Diagnostic callbacks cannot kill the polling worker either.
          }
        })
        .finally(() => schedule(pollIntervalMs));
    }, delayMs);
    timer.unref();
  };

  schedule(0);
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await active;
    },
  };
}
