import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

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

import {
  acceptTeamInvitation,
  cancelTeamInvitation,
  createTeamInvitation,
  type TeamCommandError as TeamCommandFailure,
  updateTeamMemberRole,
} from '../../team/commands.ts';
import { chargeLimit, requirePool, withRequestId } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { openTeam } from '../team-scope.ts';

/**
 * A team command's own vocabulary, carried out as it is rather than flattened
 * into a transport code (design §5). `DELIVERY_IN_PROGRESS` — an invitation
 * whose email is mid-send, which the caller can retry — is no longer a
 * `CONFLICT`, and the three domain refusals that used to leave as
 * `BAD_REQUEST` (`NO_CHANGE`, `LAST_OWNER`, `INVALID_ROLE`) now say which one
 * they are.
 *
 * A team row that went away under an audited command leaves as the shared
 * `NotFound` the combinator raises, untouched. A database failure is a fault.
 */
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
        const principal = yield* Principal;
        // The caller's own budget first, as everywhere else on this plane.
        yield* chargeLimit(deps.limiter, 'rpc_user', principal.userId);
        // Per invitation token, and here rather than on better-auth's
        // `/organization/accept-invitation` (#1909): Studio blocks that route
        // outright (audit/better-auth-policy.ts) so that acceptance and its
        // audit event share one transaction, which makes this procedure the
        // only path a token is ever guessed through.
        //
        // Before the lookup, so a guessed token costs nothing to refuse.
        yield* chargeLimit(
          deps.limiter,
          'invitation_accept',
          payload.invitationId,
        );
        // A plane wired without a database refuses here, in the same place
        // every other team procedure does — `openTeam` asserts it for the
        // three that carry a team id, and this one carries none, so it says
        // so itself rather than reaching a client with nothing behind it.
        yield* requirePool(deps);
        // No `openTeam` here, and no team in the payload: the invitation is
        // what names the tenant, and the command resolves it.
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
    // No refusal when nothing can send it: an invitation is queued and goes out
    // when a worker with mail configured returns (#1895, ruling of 2026-09-14).
    // Where there is no queue at all — a process with no database — the auth
    // gate has already refused this call.
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
