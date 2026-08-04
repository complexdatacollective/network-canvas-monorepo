import { Effect } from 'effect';

import { SessionProcessingError } from '../errors';

export const perSession =
  <S, A, E>(
    stage: SessionProcessingError['stage'],
    fn: (s: S) => Effect.Effect<A, E>,
    getId: (s: S) => string,
  ) =>
  (sessions: S[]): Effect.Effect<readonly [SessionProcessingError[], A[]]> =>
    Effect.partition(sessions, (s, index) =>
      fn(s).pipe(
        Effect.mapError(
          (cause) =>
            new SessionProcessingError({ cause, stage, sessionId: getId(s) }),
        ),
        // Periodic macrotask boundary: each pass is synchronous CPU work, and
        // without it browser hosts can neither paint nor dispatch a Cancel
        // click until the whole formatting stage completes. `ensuring`, not
        // `tap`: the boundary must hold even when the session at a yield
        // index fails to format.
        Effect.ensuring((index + 1) % 10 === 0 ? Effect.sleep(0) : Effect.void),
      ),
    );
