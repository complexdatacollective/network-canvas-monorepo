import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { TeamRpcs } from '@codaco/studio-contract/rpc/team';
import type { NotFound } from '@codaco/studio-contract/schema/errors';
import {
  AcceptTeamInvitationResult,
  CancelTeamInvitationResult,
  CreateTeamInvitationResult,
  TeamCommandError,
  UpdateTeamMemberRoleResult,
} from '@codaco/studio-contract/schema/team';

import { enforceRateLimit } from '../../rate-limit/enforce.ts';
import {
  acceptTeamInvitation,
  cancelTeamInvitation,
  createTeamInvitation,
  type TeamCommandError as TeamCommandFailure,
  updateTeamMemberRole,
} from '../../team/commands.ts';
import { requireDatabase, withRequestId } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam } from '../team-scope.ts';

const refusals = <A, R>(
  command: Effect.Effect<
    A,
    TeamCommandFailure | NotFound | SqlError.SqlError,
    R
  >,
) =>
  command.pipe(
    Effect.catchTag('SqlError', Effect.die),
    Effect.catchTag(
      'TeamCommandError',
      (failure) => new TeamCommandError({ code: failure.code }),
    ),
  );

const decodeUpdatedMember = Schema.decodeUnknownSync(
  UpdateTeamMemberRoleResult,
);
const decodeCreatedInvitation = Schema.decodeUnknownSync(
  CreateTeamInvitationResult,
);
const decodeCancelledInvitation = Schema.decodeUnknownSync(
  CancelTeamInvitationResult,
);
const decodeAcceptedInvitation = Schema.decodeUnknownSync(
  AcceptTeamInvitationResult,
);

export const TeamHandlers = (deps: RpcDeps) =>
  TeamRpcs.toLayer({
    'team.acceptInvitation': (payload) =>
      Effect.gen(function* () {
        // Per invitation token and before the lookup, so a guessed token costs
        // nothing to refuse.
        yield* enforceRateLimit('invitation_accept', payload.invitationId);
        yield* requireDatabase(deps);
        return decodeAcceptedInvitation(
          yield* refusals(
            withRequestId(
              acceptTeamInvitation({ invitationId: payload.invitationId }),
            ),
          ),
        );
      }),
    'team.updateMemberRole': (payload) =>
      Effect.gen(function* () {
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeUpdatedMember(
          yield* refusals(
            withRequestId(
              updateTeamMemberRole(access, {
                memberId: payload.memberId,
                role: payload.role,
              }),
            ),
          ),
        );
      }),
    'team.createInvitation': (payload) =>
      Effect.gen(function* () {
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeCreatedInvitation(
          yield* refusals(
            withRequestId(
              createTeamInvitation(access, {
                email: payload.email,
                role: payload.role,
              }),
            ),
          ),
        );
      }),
    'team.cancelInvitation': (payload) =>
      Effect.gen(function* () {
        const access = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeCancelledInvitation(
          yield* refusals(
            withRequestId(
              cancelTeamInvitation(access, {
                invitationId: payload.invitationId,
              }),
            ),
          ),
        );
      }),
  });
