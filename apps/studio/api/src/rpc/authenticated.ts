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

const decodeUserId = Schema.decodeUnknownSync(UserId);

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
        const transport = yield* transportHeaders(options.headers);
        const principal = yield* Effect.provideService(
          principalFromHeaders(transport),
          AuthService,
          auth,
        );
        if (Option.isNone(principal)) return yield* new Unauthorized({});
        // The caller's own budget, before the handler and so before any query.
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
