import { Cause, Console, Effect } from 'effect';

// How every Studio process refuses: the one-shot commands — `migrate`,
// `maintenance` and `rotate-secrets` — and the long-running `serve` and
// `worker` when they will not start. A refusal is one sentence saying what to
// do, written to stderr; the runtime's own report (a timestamp, a level, the
// error's class name, a stack) is what the entries turn off with
// `disableErrorReporting`. Exit codes are unchanged: `runMain`'s teardown
// still maps a failure to 1.
//
// A refusal is a typed failure. A defect is not one — nothing decided to
// refuse, something broke — so it is printed with its stack, because that is
// what whoever reads it needs to find the fault.

/** The one sentence an operator acts on, from whatever the command failed with. */
function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Prints the refusal before it propagates. An interruption is not a refusal —
 * a person pressed Ctrl-C, or the container runtime stopped the process — and
 * prints nothing.
 */
export const reportingRefusals = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.tapCause(self, (cause) => {
    if (Cause.hasInterruptsOnly(cause)) return Effect.void;
    if (Cause.hasDies(cause)) return Console.error(Cause.pretty(cause));
    return Console.error(messageOf(Cause.squash(cause)));
  });
