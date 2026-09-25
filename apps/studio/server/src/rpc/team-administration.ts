import { Effect, Layer, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import {
  TeamAccess,
  TeamAdministration,
} from '@codaco/studio-contract/middleware/team-administration';
import { TeamScoped } from '@codaco/studio-contract/schema/team';

import type { RpcDeps } from './deps.ts';
import { openTeam, requireTeamAdministration } from './team-scope.ts';

// The server half of the contract's `TeamAdministration` middleware: the tier
// gate the admin-only procedures declare, rather than a line each of their
// handlers has to remember to write (#1927 §10, Q8).
//
// It is the only middleware on this plane that reads the payload. A middleware
// is handed `payload: unknown` — it wraps every rpc that declares it, and those
// rpcs have different payload schemas — so the team it is being asked about has
// to be decoded back out. `TeamScoped` is the one field they share, and
// decoding through it rather than reading a property is what makes "this
// procedure carries a team id" a checked fact.

/**
 * The shared field, decoded out of the already-decoded payload.
 *
 * A payload with no `teamId` means this middleware was declared on a procedure
 * that is not team-scoped, which is a wiring mistake rather than a refusal a
 * caller could act on — so it dies rather than answering `Forbidden`, which
 * would tell an admin they are not one.
 */
const decodeTeamScoped = Schema.decodeUnknownEffect(TeamScoped);

export const TeamAdministrationLive = (
  deps: RpcDeps,
): Layer.Layer<TeamAdministration> =>
  Layer.succeed(TeamAdministration)((effect, options) =>
    Effect.gen(function* () {
      // `Principal` is available here only because `Authenticated` is declared
      // AFTER this middleware on every rpc that carries it, which puts it
      // outside this one. `middleware/teamAdministration.ts` says why, and
      // `__tests__/ordering-probe.test.ts` fails if the order is reversed.
      const principal = yield* Principal;
      const payload = yield* Effect.orDie(decodeTeamScoped(options.payload));
      const access = yield* openTeam(deps, principal, payload.teamId);
      yield* requireTeamAdministration(access);
      return yield* Effect.provideService(effect, TeamAccess, access);
    }),
  );
