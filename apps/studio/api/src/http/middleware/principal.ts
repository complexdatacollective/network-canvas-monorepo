import { Effect, Option } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';

import { principalFromRequest } from '../../auth/principal.ts';
import { AuthService } from '../../auth/service.ts';
import { principalOf } from '../../rpc/authenticated.ts';

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
