import { Effect, Layer, Option, Schema } from 'effect';

import {
  Authenticated,
  Principal,
} from '@codaco/studio-contract/middleware/authenticated';
import { Unauthorized } from '@codaco/studio-contract/schema/errors';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { principalFromHeaders } from '../auth/principal.ts';
import { AuthService, type SessionPrincipal } from '../auth/service.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import { transportHeaders } from './request-headers.ts';

// The server half of the contract's `Authenticated` middleware: the only place
// on the rpc plane that reads a cookie and asks the auth provider who is
// calling, and the place the caller's own budget is charged.
//
// `rpc_user` is taken here, once the principal is known and before the handler
// runs — so before any database work, for every procedure that carries the
// middleware, without a helper or a handler having to remember it (#1932 §3,
// §12). The two narrower scopes stay explicit calls where their subject first
// exists: `rpc_team` in `rpc/team-scope.ts` once membership is confirmed, and
// `invitation_accept` at the top of `team.acceptInvitation`, before the token
// is looked up.

const decodeUserId = Schema.decodeUnknownSync(UserId);

/**
 * The provider's session as the contract spells it: the same fields, with
 * `userId` branded by decoding it through `UserId` rather than asserted. A
 * value the schema refuses is a provider that has changed under us, which is a
 * defect rather than a refusal — so the decode throws instead of being caught.
 *
 * Exported because the HTTP gates need it too: the `/ws` upgrade and the
 * unsafe `/storage` methods resolve their principal in a route middleware
 * (`http/middleware/principal.ts`) rather than through the `Authenticated`
 * middleware below, and `audited` requires the contract's `Principal`
 * service. One conversion, so the branded principal a command acts on cannot
 * differ between the two transports.
 */
export const principalOf = (session: SessionPrincipal): Principal['Service'] =>
  Principal.of({
    kind: 'user',
    userId: decodeUserId(session.userId),
    email: session.email,
    emailVerified: session.emailVerified,
    name: session.name,
    locale: session.locale,
    sessionId: session.sessionId,
  });

/**
 * The browser's cookie reaches here on the one transport `StudioRpcs` is
 * mounted on: a fetch request to `/rpc`, which carries it directly
 * (`RpcServer.layerHttp` in `http/rpc-routes.ts`, the group's only mount).
 * `/ws` is the protocol builder's oRPC bridge and runs no rpc middleware at
 * all; when stage 8 moves it onto this plane, a frame will inherit the
 * handshake's cookie and arrive here the same way. Either transport puts it on
 * the headers of the HTTP request, which is the only set this reads —
 * `transportHeaders` says why.
 *
 * A caller with no cookie, an expired one, an instance with auth switched off,
 * and a caller on the token plane are one answer — `Unauthorized`, saying no
 * more than that. A caller who is known but has spent their window is
 * `RateLimited`, carrying the interval to wait.
 *
 * The services are captured when the layer is built: a middleware function is
 * handed nothing but the call, so what it asks of has to be closed over.
 */
export const AuthenticatedLive: Layer.Layer<
  Authenticated,
  never,
  AuthService | RateLimiter
> = Layer.effect(Authenticated)(
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const limiter = yield* RateLimiter;
    return (effect, options) =>
      Effect.gen(function* () {
        // The provider is handed a request, not a cookie: `auth.getSession`
        // runs a better-auth endpoint, and which headers that endpoint
        // consults is its business and changes between versions. So the rule
        // is about where they come from rather than which ones they are — the
        // ones this deployment received, never the ones the caller attached to
        // the message.
        //
        // `options.headers` cannot be used for that: it is the request's
        // headers with the message's written over the top, so a caller could
        // present a `user-agent` and an `x-forwarded-for` of their own
        // choosing. With `TRUSTED_PROXIES` set, the address better-auth
        // resolves comes off that forwarded header (`auth/better-auth.ts`,
        // `advanced.ipAddress`) — out of the request body, where no reverse
        // proxy can correct it, which is the forgery that configuration exists
        // to prevent.
        //
        // And the token-plane rule is asked of the same set, inside
        // `principalFromHeaders`, so that the set refused over and the set
        // forwarded are one. Splitting them is a bypass rather than an
        // inconsistency: a message's headers are raw `JSON.parse` output —
        // `layerNdjson` never decodes the envelope against `RequestEncoded` —
        // and `Headers.fromInput` merges them through its iterable branch,
        // which assigns `out[k] = v` without filtering `undefined`. A
        // one-element entry `["authorization"]` therefore writes the key as
        // `undefined` in the merged set; a guard that read the value there
        // would see no token while the request's real `Authorization` still
        // reached `getSession` beside the cookie — the silent token-to-cookie
        // fallback #1248 forbids. (`principalFromHeaders` asks whether the key
        // is present, which that entry cannot hide, but the rule should not
        // rest on which set happens to be tolerant.) Read `options.headers`
        // here and `auth.test.ts`'s 'asks the provider with the headers the
        // request carried, not ones a message attached' fails.
        const transport = yield* transportHeaders(options.headers);
        const principal = yield* Effect.provideService(
          principalFromHeaders(transport),
          AuthService,
          auth,
        );
        if (Option.isNone(principal)) return yield* new Unauthorized({});
        // The caller's own budget, before the handler and so before any query:
        // that is the one a runaway client spends, and refusing after a
        // membership lookup would have spent the work the limit exists to
        // stop.
        yield* Effect.provideService(
          enforceRateLimit('rpc_user', principal.value.userId),
          RateLimiter,
          limiter,
        );
        return yield* Effect.provideService(
          effect,
          Principal,
          principalOf(principal.value),
        );
      });
  }),
);
