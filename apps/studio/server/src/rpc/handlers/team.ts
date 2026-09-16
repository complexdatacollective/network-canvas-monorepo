import { Effect, Schema } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { TeamRpcs } from '@codaco/studio-contract/rpc/team';
import { NotFound } from '@codaco/studio-contract/schema/errors';
import {
  AcceptTeamInvitationResult,
  CancelTeamInvitationResult,
  CreateTeamInvitationResult,
  TeamCommandError,
  UpdateTeamMemberRoleResult,
} from '@codaco/studio-contract/schema/team';

import { AuditCommandTeamNotFoundError } from '../../audit/command.ts';
import {
  acceptTeamInvitation,
  cancelTeamInvitation,
  createTeamInvitation,
  TeamCommandError as TeamCommandFailure,
  updateTeamMemberRole,
} from '../../team/commands.ts';
import {
  chargeLimit,
  requestIdOrMint,
  requirePool,
  runCommand,
} from '../bridge.ts';
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
 * A team row that went away under an audited command is the shared `NotFound`.
 * Anything else is a fault.
 */
const teamRefusal = (
  cause: unknown,
): Effect.Effect<never, NotFound | TeamCommandError> => {
  if (cause instanceof AuditCommandTeamNotFoundError) return new NotFound({});
  if (!(cause instanceof TeamCommandFailure)) return Effect.die(cause);
  return new TeamCommandError({ code: cause.code });
};

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
        const pool = yield* requirePool(deps);
        const requestId = yield* requestIdOrMint;
        return decodeAcceptedInvitation(
          yield* runCommand(
            () =>
              acceptTeamInvitation(
                { pool, principal, requestId },
                { invitationId: payload.invitationId },
              ),
            teamRefusal,
          ),
        );
      }),
    'team.updateMemberRole': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeUpdatedMember(
          yield* runCommand(
            () =>
              updateTeamMemberRole(
                {
                  tenantDb: scope.tenantDb,
                  principal: scope.principal,
                  requestId: scope.requestId,
                },
                { memberId: payload.memberId, role: payload.role },
              ),
            teamRefusal,
          ),
        );
      }),
    // No refusal when nothing can send it: an invitation is queued and goes out
    // when a worker with mail configured returns (#1895, ruling of 2026-09-14).
    // Where there is no queue at all — a process with no database — the auth
    // gate has already refused this call.
    'team.createInvitation': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeCreatedInvitation(
          yield* runCommand(
            () =>
              createTeamInvitation(
                {
                  tenantDb: scope.tenantDb,
                  principal: scope.principal,
                  requestId: scope.requestId,
                  jobs: deps.jobs,
                },
                { email: payload.email, role: payload.role },
              ),
            teamRefusal,
          ),
        );
      }),
    'team.cancelInvitation': (payload) =>
      Effect.gen(function* () {
        const scope = yield* openTeam(deps, yield* Principal, payload.teamId);
        return decodeCancelledInvitation(
          yield* runCommand(
            () =>
              cancelTeamInvitation(
                {
                  tenantDb: scope.tenantDb,
                  principal: scope.principal,
                  requestId: scope.requestId,
                },
                { invitationId: payload.invitationId },
              ),
            teamRefusal,
          ),
        );
      }),
  });
