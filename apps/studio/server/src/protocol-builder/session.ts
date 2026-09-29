// Who is calling a protocol-builder procedure, and on which protocol.
//
// The contract's inputs name a protocol and nothing else, so every procedure
// starts here: the principal and the calling tab come from `HostSession`, and
// `openSession` turns a protocol id into the team, the draft and the lock
// owner the host's commands run as — or into the one refusal a caller who
// cannot reach the protocol gets, which is the same as for a protocol that
// does not exist, so this is no more an existence oracle than `studies.get`.
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
 * The socket a `/ws` call arrived on.
 *
 * Provided by the `/ws` route to the upgrade's own fiber (`rpc.ts`), which is
 * the fiber the rpc server runs that socket's middleware and handlers under —
 * so its presence is what tells a call over a connection from a unary one.
 * The id is minted per socket rather than taken from the rpc server's client
 * counter: that counter restarts with the process and is not unique across
 * processes, and a caller naming no tab owns its locks by this id.
 */
export class WsConnection extends Context.Service<
  WsConnection,
  { readonly connectionId: string }
>()('@studio/protocol-builder/WsConnection') {}

/**
 * The principal `HostSession` resolved for this call.
 *
 * `HostSessionLive` provides it beside `HostCaller` on every call it admits; a
 * handler cannot declare it, because a handler's requirements are built into
 * the handlers layer rather than per call. Absent means a handler ran without
 * the middleware, which is a wiring bug rather than a refusal.
 */
const callerPrincipal: Effect.Effect<Principal['Service']> = Effect.flatMap(
  Effect.serviceOption(Principal),
  Option.match({
    onNone: () =>
      Effect.die(new Error('a protocol-builder call ran without HostSession')),
    onSome: Effect.succeed,
  }),
);

/**
 * A spent window, as a failure the contract does not name.
 *
 * `RateLimited` is not declared on the protocol-builder group (#1927 §20 Q11):
 * a contract Architect implements too has no business carrying a Studio
 * limit. So a refusal leaves as a defect, which the client sees as a failed
 * call it cannot name — as it could not name oRPC's `TOO_MANY_REQUESTS`
 * either — and the servers run with fatal defects off (`rpc.ts`), so it fails
 * that call alone rather than the socket.
 */
const charge = (
  scope: RateLimitScope,
  subject: string,
): Effect.Effect<void, never, RateLimiter> =>
  Effect.orDie(enforceRateLimit(scope, subject));

/**
 * The principal a set of transport headers resolves to.
 *
 * On `/ws` the upgrade's guards already resolved one for the socket and put it
 * in the upgrade's fiber, which is where this runs; it is taken from there
 * rather than asked of the auth provider on every frame. Anywhere else it is
 * asked of the request's own headers — never of the headers a message
 * attached, which a caller writes over the request's (`transportHeaders`).
 */
const resolvePrincipal = (
  headers: Headers.Headers,
): Effect.Effect<Option.Option<Principal['Service']>, never, AuthService> =>
  Effect.flatMap(Effect.serviceOption(Principal), (upgraded) =>
    Option.isSome(upgraded)
      ? Effect.succeed(upgraded)
      : Effect.map(principalFromHeaders(headers), Option.map(principalOf)),
  );

/**
 * Studio's `HostSession`: the principal, and the connection and tab the call
 * belongs to.
 *
 * The connection is the presence identity. A `/ws` call names its socket; a
 * unary call has no connection to name and falls back to the cookie session.
 * The tab is what locks belong to, read from `CLIENT_SESSION_HEADER` on the
 * request itself — the `/ws` route rewrites its upgrade query onto that header
 * (`ClientSessionQuery`), a fetch request carries it directly — and a client
 * that names none is its own owner by its connection, so it still keeps its
 * lock across calls.
 */
export const HostSessionLive: Layer.Layer<HostSession, never, AuthService> =
  Layer.effect(HostSession)(
    Effect.gen(function* () {
      const auth = yield* AuthService;
      return (effect, options) =>
        Effect.gen(function* () {
          const headers = yield* transportHeaders(options.headers);
          const principal = yield* Effect.provideService(
            resolvePrincipal(headers),
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

/** Everything one owner has staged in one draft, whichever edit staged it. */
export const ownerPrefix = (session: ProtocolBuilderSession): string =>
  `${session.draftId}\u0000${sessionOwner(session)}\u0000`;

/**
 * Resolves the protocol a call names to a session, in the order the rest of
 * the rpc plane takes the same steps:
 *
 * 1. the caller's own budget, before any query — the one a runaway client
 *    spends, and the protocol-builder surface must not be the one plane with
 *    no per-user limit;
 * 2. the caller's memberships;
 * 3. the protocol, found through them — unreachable and nothing open to edit
 *    are one `ProtocolNotFound`;
 * 4. the team's budget, once the team is known — charging it first would let
 *    a stranger spend a team's quota with calls that are all refused;
 * 5. this owner's sign of life: a call is the only one the unary plane gives,
 *    so it says both that this owner is still here with everything it has
 *    staged, and that whoever has made none for the idle bound is not.
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
