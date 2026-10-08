import { Cause, Clock, Effect } from 'effect';

/** How often a defect that recurs pass after pass is logged again. */
const RECURRING_DEFECT_LOG_MS = 60_000;

/**
 * Keeps a scheduled loop running past a defect in one of its passes. A defect
 * that recurs pass after pass is logged when it first fails a pass, then once
 * a minute with how many passes in a row it has failed, rather than at every
 * pass. A different defect is logged at once, and a pass that succeeds starts
 * the count again. Made once per loop, since the count is the loop's own.
 */
export const catchLoopDefect = (message: string) => {
  let failing = 0;
  let logged: { readonly at: number; readonly defect: string } | undefined;
  return <A, E, R>(
    pass: Effect.Effect<A, E, R>,
  ): Effect.Effect<A | void, never, R> =>
    pass.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          failing = 0;
          logged = undefined;
        }),
      ),
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          failing += 1;
          const at = yield* Clock.currentTimeMillis;
          const defect = Cause.pretty(cause);
          if (
            logged !== undefined &&
            logged.defect === defect &&
            at - logged.at < RECURRING_DEFECT_LOG_MS
          ) {
            return;
          }
          logged = { at, defect };
          yield* Effect.logError(
            failing === 1 ? message : `${message} (${failing} passes in a row)`,
            cause,
          );
        }),
      ),
    );
};
