import { Effect, Option } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';

import type { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import type { Principal } from '@codaco/studio-contract/middleware/authenticated';

import { provideCaller } from '../../audit/actor.ts';
import { principalFromRequest } from '../../auth/principal.ts';
import { AuthService } from '../../auth/service.ts';
import { principalOf } from '../../rpc/authenticated.ts';

export const requirePrincipal = HttpRouter.middleware<{
  provides: Principal | AuditActor;
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
        return yield* provideCaller(principalOf(principal.value))(httpEffect);
      });
  }),
);
