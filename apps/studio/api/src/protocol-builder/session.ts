import { Context, Effect, Layer, Option } from 'effect';
import type * as Headers from 'effect/http/Headers';

import { ProtocolNotFound } from '@codaco/protocol-builder-core/contract/errors';
import {
  HostCaller,
  HostSession,
  HostUnauthorized,
} from '@codaco/protocol-builder-core/contract/session';
import {
  CLIENT_SESSION_HEADER,
  readClientSessionId,
} from '@codaco/studio-contract/client-session';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';

import { provideCaller } from '../audit/actor.ts';
import { principalFromHeaders } from '../auth/principal.ts';
import { AuthService } from '../auth/service.ts';
import type { Database } from '../db/client.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import { type RateLimiter } from '../rate-limit/limiter.ts';
import type { RateLimitScope } from '../rate-limit/scopes.ts';
import { principalOf } from '../rpc/authenticated.ts';
import { requestIdOrMint } from '../rpc/bridge.ts';
import { transportHeaders } from '../rpc/request-headers.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { type ProtocolBuilderSession } from './host.ts';
import { Leases } from './leases.ts';
import { resolveProtocolSession } from './tenancy.ts';

/**
 * Minted per socket rather than taken from the rpc server's client counter,
 * which restarts with the process.
 */
export class WsConnection extends Context.Service<
  WsConnection,
  { readonly connectionId: string }
>()('@studio/protocol-builder/WsConnection') {}

export class WatchCutoff extends Context.Service<
  WatchCutoff,
  { readonly reached: Effect.Effect<void> }
>()('@studio/protocol-builder/WatchCutoff') {}

const callerPrincipal: Effect.Effect<Principal['Service']> = Effect.flatMap(
  Effect.serviceOption(Principal),
  Option.match({
    onNone: () =>
      Effect.die(new Error('a protocol-builder call ran without HostSession')),
    onSome: Effect.succeed,
  }),
);

const charge = (
  scope: RateLimitScope,
  subject: string,
): Effect.Effect<void, never, RateLimiter> =>
  Effect.orDie(enforceRateLimit(scope, subject));

export const HostSessionLive: Layer.Layer<HostSession, never, AuthService> =
  Layer.effect(HostSession)(
    Effect.gen(function* () {
      const auth = yield* AuthService;
      return (effect, options) =>
        Effect.gen(function* () {
          // Asked again on every call so that a session revoked while its
          // socket is open is refused.
          const headers = yield* transportHeaders(options.headers);
          const principal = yield* Effect.provideService(
            Effect.map(principalFromHeaders(headers), Option.map(principalOf)),
            AuthService,
            auth,
          );
          if (Option.isNone(principal)) return yield* new HostUnauthorized({});
          const connectionId = Option.match(
            yield* Effect.serviceOption(WsConnection),
            {
              onNone: () => principal.value.sessionId,
              onSome: (connection) => connection.connectionId,
            },
          );
          const displayName =
            principal.value.name.trim() || principal.value.email.trim();
          return yield* effect.pipe(
            Effect.provideService(
              HostCaller,
              HostCaller.of({
                connectionId,
                clientSessionId:
                  readClientSessionId(headers[CLIENT_SESSION_HEADER]) ??
                  connectionId,
                userId: principal.value.userId,
                displayName: displayName.slice(0, 320),
              }),
            ),
            provideCaller(principal.value),
          );
        });
    }),
  );

export const stillSignedIn = Effect.fnUntraced(function* (
  headers: Headers.Headers,
) {
  const principal = yield* principalFromHeaders(
    yield* transportHeaders(headers),
  );
  const caller = yield* callerPrincipal;
  if (Option.isNone(principal) || principal.value.userId !== caller.userId) {
    return yield* Effect.die(new HostUnauthorized({}));
  }
});

/**
 * The team's budget is charged only once the team is known, so a stranger
 * cannot spend a team's quota.
 */
export const openSession = Effect.fn('protocolBuilder.openSession')(function* (
  protocolId: string,
): Effect.fn.Return<
  ProtocolBuilderSession,
  ProtocolNotFound,
  HostCaller | AuthService | RateLimiter | Database | SecretsCipher | Leases
> {
  const caller = yield* HostCaller;
  const principal = yield* callerPrincipal;
  yield* charge('rpc_user', principal.userId);
  const auth = yield* AuthService;
  const memberships = yield* auth.listMemberships(principal.userId);
  const session = yield* resolveProtocolSession({
    protocolId,
    principal,
    requestId: yield* requestIdOrMint,
    connectionId: caller.connectionId,
    clientSessionId: caller.clientSessionId,
    memberships,
    cipher: yield* SecretsCipher,
  }).pipe(Effect.orDie);
  if (session === null) return yield* new ProtocolNotFound({ protocolId });
  yield* charge('rpc_team', session.access.teamId);
  yield* (yield* Leases).contact(session);
  return session;
});
