import { Effect, Layer, Schema } from 'effect';

import {
  Authenticated,
  Principal,
} from '@codaco/studio-contract/middleware/authenticated';
import { Unauthorized } from '@codaco/studio-contract/schema/errors';
import { UserId } from '@codaco/studio-contract/schema/ids';

import type { AuthService, SessionPrincipal } from '../auth/service.ts';
import { transportHeaders } from './request-headers.ts';

// The server half of the contract's `Authenticated` middleware: the only place
// on the rpc plane that reads a cookie and asks the auth provider who is
// calling.
//
// Deliberately minimal. It resolves the session and nothing else — no rate
// limit is charged here, although the middleware declares `RateLimited`
// alongside `Unauthorized`.
//
// The per-user budget is already charged, just not here: `rpc/team-scope.ts`'s
// scope-opening helpers take it before any query, and the three procedures
// that open no scope (`me`, `account.updateLocale`, `team.acceptInvitation`)
// take it in the handler. Stage 4 moves that charge INTO this middleware
// (#1932 §3, §12), which is what makes "before any database work" structural
// rather than a rule every helper has to keep. Doing it here now would take
// the decision away from procedures that still make it for themselves.

const decodeUserId = Schema.decodeUnknownSync(UserId);

/**
 * The provider's session as the contract spells it: the same fields, with
 * `userId` branded by decoding it through `UserId` rather than asserted. A
 * value the schema refuses is a provider that has changed under us, which is a
 * defect rather than a refusal — so the decode throws instead of being caught.
 *
 * Exported because the `/ws` plane needs it too: the protocol builder resolves
 * its own principal from a Hono middleware on the upgrade (`auth/principal.ts`)
 * rather than through the `Authenticated` middleware below, and `audited`
 * requires the contract's `Principal` service. One conversion, so the branded
 * principal a command acts on cannot differ between the two transports.
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
 * more than that.
 */
export const AuthenticatedLive = (
  auth: AuthService,
): Layer.Layer<Authenticated> =>
  Layer.succeed(Authenticated)((effect, options) =>
    Effect.gen(function* () {
      // The provider is handed a request, not a cookie: `auth.getSession` runs
      // a better-auth endpoint, and which headers that endpoint consults is its
      // business and changes between versions. So the rule is about where they
      // come from rather than which ones they are — the ones this deployment
      // received, never the ones the caller attached to the message.
      //
      // `options.headers` cannot be used for that: it is the request's headers
      // with the message's written over the top, so a caller could present a
      // `user-agent` and an `x-forwarded-for` of their own choosing. With
      // `TRUSTED_PROXIES` set, the address better-auth resolves comes off that
      // forwarded header (`auth/better-auth.ts`, `advanced.ipAddress`) — out of
      // the request body, where no reverse proxy can correct it, which is the
      // forgery that configuration exists to prevent.
      const transport = yield* transportHeaders(options.headers);
      // An Authorization header puts the request on the token plane, which must
      // never fall back silently to cookies (#1248) — the rule
      // `createPrincipalMiddleware` carried on the Hono `/rpc` mount. Until
      // #1288 lands, the token plane resolves to no principal.
      //
      // Asked of `transport` rather than of `options.headers`, so that the set
      // refused over and the set forwarded are one. Splitting them is a bypass
      // rather than an inconsistency: a message's headers are raw `JSON.parse`
      // output — `layerNdjson` never decodes the envelope against
      // `RequestEncoded` — and `Headers.fromInput` merges them through its
      // iterable branch, which assigns `out[k] = v` without filtering
      // `undefined`. A one-element entry `["authorization"]` therefore writes
      // the key as `undefined` in the merged set, where this check cannot see
      // it, while the request's real `Authorization` still reaches
      // `getSession` beside the cookie — the silent token-to-cookie fallback
      // #1248 forbids. Put the two reads back on different sets and
      // `auth.test.ts`'s 'refuses the token plane even when the message erases
      // the header' fails.
      if (transport['authorization'] !== undefined) {
        return yield* new Unauthorized({});
      }
      const headers = new Headers(transport);
      const session = yield* Effect.promise(() => auth.getSession(headers));
      if (!session) return yield* new Unauthorized({});
      return yield* Effect.provideService(
        effect,
        Principal,
        principalOf(session),
      );
    }),
  );
