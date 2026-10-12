import { randomUUID } from 'node:crypto';

import { Effect, Option } from 'effect';

import { RequestId } from '../http/middleware/request-id.ts';
import type { RpcDeps } from './deps.ts';

export const requestIdOrMint: Effect.Effect<string> = Effect.flatMap(
  Effect.serviceOption(RequestId),
  Option.match({
    onNone: () => Effect.sync(() => randomUUID()),
    onSome: (requestId: string) => Effect.succeed(requestId),
  }),
);

export const withRequestId = <A, E, R>(
  command: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, RequestId>> =>
  Effect.flatMap(requestIdOrMint, (requestId) =>
    Effect.provideService(command, RequestId, requestId),
  );

export const requireDatabase = (deps: RpcDeps): Effect.Effect<void> =>
  deps.services === undefined
    ? Effect.die(new Error('the rpc plane was wired without a database'))
    : Effect.void;
