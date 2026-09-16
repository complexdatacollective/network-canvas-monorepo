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
// alongside `Unauthorized`. The per-user limit arrives with stage 4's
// team-opening helper (#1930); charging it here now would move a decision the
// procedures still make for themselves.

const decodeUserId = Schema.decodeUnknownSync(UserId);

/**
 * The provider's session as the contract spells it: the same fields, with
 * `userId` branded by decoding it through `UserId` rather than asserted. A
 * value the schema refuses is a provider that has changed under us, which is a
 * defect rather than a refusal — so the decode throws instead of being caught.
 */
const principalOf = (session: SessionPrincipal): Principal['Service'] =>
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
 * The browser's cookie reaches here on both transports: a fetch request to
 * `/rpc` carries it directly, and a `/ws` frame inherits the handshake's. Both
 * are headers of the HTTP request, which is the only set this reads —
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
      // An Authorization header puts the request on the token plane, which must
      // never fall back silently to cookies (#1248) — the rule
      // `createPrincipalMiddleware` carried on the Hono `/rpc` mount. Until
      // #1288 lands, the token plane resolves to no principal.
      if (options.headers['authorization'] !== undefined) {
        return yield* new Unauthorized({});
      }
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
      // forgery that configuration exists to prevent. The one header that must
      // not be forwarded at all — `authorization` — is refused above.
      const headers = new Headers(yield* transportHeaders(options.headers));
      const session = yield* Effect.promise(() => auth.getSession(headers));
      if (!session) return yield* new Unauthorized({});
      return yield* Effect.provideService(
        effect,
        Principal,
        principalOf(session),
      );
    }),
  );
