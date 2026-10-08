import { Clock, Effect, MutableRef } from 'effect';

const WARN_INTERVAL_MS = 60_000;

/** One line of at most 200 characters, for a log entry about a Valkey failure. */
export function describeValkeyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * A warning logged at most once a minute, so an outage that fails every
 * request does not log once per request.
 */
export function throttledWarning(
  render: (reason: string) => string,
): (reason: string) => Effect.Effect<void> {
  const lastWarnedAt = MutableRef.make(Number.NEGATIVE_INFINITY);
  return Effect.fnUntraced(function* (reason: string) {
    const now = yield* Clock.currentTimeMillis;
    if (now - MutableRef.get(lastWarnedAt) < WARN_INTERVAL_MS) return;
    MutableRef.set(lastWarnedAt, now);
    yield* Effect.logWarning(render(reason));
  });
}
