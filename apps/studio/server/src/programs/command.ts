import { Cause, Console, Effect } from 'effect';

// What the one-shot commands — `migrate`, `maintenance` and `rotate-secrets` —
// share: the way they refuse. Each is typed by a person, so a refusal is one
// sentence saying what to do, written to stderr as it was before the shell
// moved to Effect; the runtime's own report (a timestamp, a level, the error's
// class name, a stack) is what the entries turn off with
// `disableErrorReporting`. Exit codes are unchanged: `runMain`'s teardown
// still maps a failure to 1.

/** The one sentence an operator acts on, from whatever the command failed with. */
function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Prints the command's refusal before it propagates. An interruption is not a
 * refusal — a person pressed Ctrl-C — and prints nothing.
 */
export const reportingRefusals = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.tapCause(self, (cause) =>
    Cause.hasInterruptsOnly(cause)
      ? Effect.void
      : Console.error(messageOf(Cause.squash(cause))),
  );
