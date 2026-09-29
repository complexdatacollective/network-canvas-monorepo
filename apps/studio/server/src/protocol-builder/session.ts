// Who is calling a protocol-builder procedure, and on which protocol. A caller
// who cannot reach a protocol is refused exactly as for one that does not
// exist, so this is no more an existence oracle than `studies.get`.
import { Clock, Context, Effect, Layer, Option } from 'effect';
import type * as Headers from 'effect/unstable/http/Headers';

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
import { sessionOwner, type ProtocolBuilderSession } from './host.ts';
import { IDLE_MS, Leases } from './leases.ts';
import { StagedImports } from './resources.ts';
import { resolveProtocolSession } from './tenancy.ts';

/**
 * The socket a `/ws` call arrived on, provided by the route to the upgrade's
 * fiber, which the rpc server runs that socket's handlers under. Minted per
 * socket rather than taken from the rpc server's client counter, which
 * restarts with the process: a caller naming no tab owns its locks by it.
 */
export class WsConnection extends Context.Service<
  WsConnection,
  { readonly connectionId: string }
>()('@studio/protocol-builder/WsConnection') {}

/**
 * When a stream on this call's plane must end. The unary route provides it:
 * the maintenance gate sees only the request, so a `WatchProtocol` opened
 * there before an operator's window ends when the window opens, as `/ws`
 * closes its socket.
 */
export class WatchCutoff extends Context.Service<
  WatchCutoff,
  { readonly reached: Effect.Effect<void> }
>()('@studio/protocol-builder/WatchCutoff') {}

/** The principal `HostSessionLive` provided; absent is a wiring bug. */
const callerPrincipal: Effect.Effect<Principal['Service']> = Effect.flatMap(
  Effect.serviceOption(Principal),
  Option.match({
    onNone: () =>
      Effect.die(new Error('a protocol-builder call ran without HostSession')),
    onSome: Effect.succeed,
  }),
);

/**
 * A spent window, as a defect: `RateLimited` is not on the group (#1927 §20
 * Q11), and with fatal defects off it fails that call alone.
 */
const charge = (
  scope: RateLimitScope,
  subject: string,
): Effect.Effect<void, never, RateLimiter> =>
  Effect.orDie(enforceRateLimit(scope, subject));

/**
 * Studio's `HostSession`. The connection is the presence identity: a `/ws`
 * call's socket, or the cookie session for a unary call. The tab owns locks,
 * read from `CLIENT_SESSION_HEADER` on the request itself (the `/ws` route
 * moves its upgrade query there); a client naming none owns them by its
 * connection.
 */
export const HostSessionLive: Layer.Layer<HostSession, never, AuthService> =
  Layer.effect(HostSession)(
    Effect.gen(function* () {
      const auth = yield* AuthService;
      return (effect, options) =>
        Effect.gen(function* () {
          // On `/ws` these are the upgrade's headers, asked again on every
          // call so that a session revoked while its socket is open is refused.
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
            Effect.provideService(Principal, principal.value),
          );
        });
    }),
  );

/**
 * Dies unless the session a stream was admitted on still resolves to its
 * caller: `HostSession` runs once per call, and a watch is one call for as
 * long as the protocol is open.
 */
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

/** Everything one owner has staged in one draft, whichever edit staged it. */
export const ownerPrefix = (session: ProtocolBuilderSession): string =>
  `${session.draftId}\u0000${sessionOwner(session)}\u0000`;

/**
 * Resolves the protocol a call names to a session. The caller's budget is
 * charged before any query; the team's only once the team is known, so a
 * stranger cannot spend a team's quota with calls that are all refused. A call
 * is the unary plane's only sign of life, so it also touches this owner and
 * expires whoever has made none for the idle bound.
 */
export const openSession = Effect.fn('protocolBuilder.openSession')(function* (
  protocolId: string,
): Effect.fn.Return<
  ProtocolBuilderSession,
  ProtocolNotFound,
  | HostCaller
  | AuthService
  | RateLimiter
  | Database
  | SecretsCipher
  | Leases
  | StagedImports
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
  const leases = yield* Leases;
  const staged = yield* StagedImports;
  yield* leases.touch(sessionOwner(session));
  yield* staged.touch(ownerPrefix(session));
  const now = yield* Clock.currentTimeMillis;
  yield* staged.expire(now - IDLE_MS, leases.connected);
  return session;
});
