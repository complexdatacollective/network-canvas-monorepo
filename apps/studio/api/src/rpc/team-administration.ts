import { Effect, Layer, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import {
  TeamAccess,
  TeamAdministration,
} from '@codaco/studio-contract/middleware/team-administration';
import { TeamScoped } from '@codaco/studio-contract/schema/team';

import { AuthService } from '../auth/service.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import type { RpcDeps } from './deps.ts';
import { openTeam, requireTeamAdministration } from './team-scope.ts';

const decodeTeamScoped = Schema.decodeUnknownEffect(TeamScoped);

export const TeamAdministrationLive = (
  deps: RpcDeps,
): Layer.Layer<TeamAdministration, never, AuthService | RateLimiter> =>
  Layer.effect(TeamAdministration)(
    Effect.gen(function* () {
      const auth = yield* AuthService;
      const limiter = yield* RateLimiter;
      return (effect, options) =>
        Effect.gen(function* () {
          // `Principal` is available here only because `Authenticated` is
          // declared AFTER this middleware on every rpc that carries it.
          const principal = yield* Principal;
          const payload = yield* Effect.orDie(
            decodeTeamScoped(options.payload),
          );
          const access = yield* openTeam(deps, principal, payload.teamId).pipe(
            Effect.provideService(AuthService, auth),
            Effect.provideService(RateLimiter, limiter),
          );
          yield* requireTeamAdministration(access);
          return yield* Effect.provideService(effect, TeamAccess, access);
        });
    }),
  );
