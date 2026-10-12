import { Cause, Console, Effect } from 'effect';

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

export const reportingRefusals = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.tapCause(self, (cause) => {
    if (Cause.hasInterruptsOnly(cause)) return Effect.void;
    if (Cause.hasDies(cause)) return Console.error(Cause.pretty(cause));
    return Console.error(messageOf(Cause.squash(cause)));
  });
