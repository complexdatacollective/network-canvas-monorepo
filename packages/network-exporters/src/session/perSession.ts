import { Effect } from "effect";
import { SessionProcessingError } from "../errors";

export const perSession =
	<S, A, E>(stage: SessionProcessingError["stage"], fn: (s: S) => Effect.Effect<A, E>, getId: (s: S) => string) =>
	(sessions: S[]): Effect.Effect<readonly [SessionProcessingError[], A[]]> =>
		Effect.partition(sessions, (s) =>
			fn(s).pipe(Effect.mapError((cause) => new SessionProcessingError({ cause, stage, sessionId: getId(s) }))),
		);
