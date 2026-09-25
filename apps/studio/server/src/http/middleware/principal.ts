import { Effect, Option } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';

import { principalFromRequest } from '../../auth/principal.ts';
import { AuthService } from '../../auth/service.ts';
import { principalOf } from '../../rpc/authenticated.ts';

/**
 * Who is calling, for the HTTP routes outside the rpc plane that need a
 * signed-in researcher: the WebSocket upgrade and the unsafe `/storage`
 * methods. The rpc plane decides the same question inside its `Authenticated`
 * middleware; the resolution rule is one (`auth/principal.ts`), and so is the
 * conversion to the contract's branded principal (`principalOf`).
 *
 * A request that resolves to nobody is answered 401 here rather than failed,
 * for the reason every route middleware answers: a middleware that handles
 * errors cannot be composed alongside the origin gates and the limits.
 *
 * The principal is provided to the route and to any middleware inside this
 * one, which is how the `/ws` upgrade limit is keyed by the user it resolved.
 */
export const requirePrincipal = HttpRouter.middleware<{
  provides: Principal;
}>()(
  Effect.gen(function* () {
    const auth = yield* AuthService;
    return (httpEffect) =>
      Effect.gen(function* () {
        const principal = yield* Effect.provideService(
          principalFromRequest,
          AuthService,
          auth,
        );
        if (Option.isNone(principal)) {
          return HttpServerResponse.jsonUnsafe(
            { title: 'Unauthorized', status: 401 },
            { status: 401, contentType: 'application/problem+json' },
          );
        }
        return yield* Effect.provideService(
          httpEffect,
          Principal,
          principalOf(principal.value),
        );
      });
  }),
);
