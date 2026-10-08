import { Clock, Effect, MutableRef } from 'effect';

const WARN_INTERVAL_MS = 60_000;

/**
 * A warning logged at most once a minute, so an outage that fails every
 * request does not log once per request.
 */
export function throttledWarning(
  warn: (error: unknown) => Effect.Effect<void>,
): (error: unknown) => Effect.Effect<void> {
  const lastWarnedAt = MutableRef.make(Number.NEGATIVE_INFINITY);
  return Effect.fnUntraced(function* (error: unknown) {
    const now = yield* Clock.currentTimeMillis;
    if (now - MutableRef.get(lastWarnedAt) < WARN_INTERVAL_MS) return;
    MutableRef.set(lastWarnedAt, now);
    yield* warn(error);
  });
}
