import { randomUUID } from 'node:crypto';

import { Effect, Redacted, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import type { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import type { NotFound } from '@codaco/studio-contract/schema/errors';
import { TeamInvitationId } from '@codaco/studio-contract/schema/ids';
import { Email } from '@codaco/studio-contract/schema/primitives';
import type { TeamRole } from '@codaco/studio-contract/schema/team';

import { audited, auditable, changed, unchanged } from '../audit/audited.ts';
import type { AuditableFailure, AuditEvents } from '../audit/audited.ts';
import { AuditContext } from '../audit/context.ts';
import {
  type DeniedAttempts,
  reservedDenial,
} from '../audit/denial-rate-limit.ts';
import type { DeniedAuditOperation } from '../audit/events.ts';
import type { AuditSignal } from '../audit/signal.ts';
import type { Database } from '../db/client.ts';
import { isLockUnavailable } from '../db/errors.ts';
import {
  type TeamAccess,
  UntenantedScope,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
import type { RequestId } from '../http/middleware/request-id.ts';
import { Jobs } from '../jobs/jobs.ts';
import { enqueueInvitationDelivery } from './invitation-delivery-store.ts';
import { isTeamAdministrator, tryParseRoles } from './roles.ts';
import * as store from './store.ts';

const decodeEmail = Schema.decodeUnknownSync(Email);
const INVITATION_LIMIT = 100;
const MEMBERSHIP_LIMIT = 100;

const TeamCommandErrorCode = Schema.Literals([
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'NO_CHANGE',
  'LAST_OWNER',
  'INVALID_ROLE',
  'DELIVERY_IN_PROGRESS',
]);

type TeamCommandErrorCode = typeof TeamCommandErrorCode.Type;

export class TeamCommandError extends Schema.TaggedError<TeamCommandError>()(
  'TeamCommandError',
  { code: TeamCommandErrorCode },
) {
  override get message(): string {
    return this.code;
  }
}

const TEAM_EVENT = {
  eventVersion: 1,
  category: 'team_access',
  resourceType: null,
  resourceId: null,
  resourceLabel: null,
} as const;

const parseRoles = (
  value: string,
): Effect.Effect<TeamRole[], TeamCommandError> => {
  const roles = tryParseRoles(value);
  return roles === null
    ? Effect.fail(new TeamCommandError({ code: 'INVALID_ROLE' }))
    : Effect.succeed(roles);
};

const canManage = (
  member: store.LockedMember,
): Effect.Effect<boolean, TeamCommandError> =>
  Effect.map(parseRoles(member.role), isTeamAdministrator);

const isOwner = (
  member: store.LockedMember,
): Effect.Effect<boolean, TeamCommandError> =>
  Effect.map(parseRoles(member.role), (roles) => roles.includes('owner'));

const memberLabel = (member: store.LockedMember): Redacted.Redacted =>
  Redacted.make(
    (Redacted.value(member.name).trim() || Redacted.value(member.email)).slice(
      0,
      320,
    ),
  );

type AuditableTeamFailure = TeamCommandError & AuditableFailure;

const denied = (
  events: AuditEvents,
): Effect.Effect<never, AuditableTeamFailure> =>
  Effect.fail(
    auditable(new TeamCommandError({ code: 'FORBIDDEN' }), {
      outcome: 'denied',
      events,
    }),
  );

const failed = (
  code: TeamCommandErrorCode,
  events: AuditEvents,
): Effect.Effect<never, AuditableTeamFailure> =>
  Effect.fail(
    auditable(new TeamCommandError({ code }), { outcome: 'failed', events }),
  );

const reserved = <A, E, R>(
  operation: DeniedAuditOperation,
  teamId: string,
  command: Effect.Effect<A, E | TeamCommandError, R>,
) =>
  reservedDenial(
    {
      operation,
      teamId,
      refusal: () => new TeamCommandError({ code: 'FORBIDDEN' }),
      isDenial: (error) =>
        error instanceof TeamCommandError && error.code === 'FORBIDDEN',
    },
    command,
  );

export type UpdatedTeamMember = { memberId: string; role: TeamRole };

export const updateTeamMemberRole: (
  access: TeamAccess,
  input: { memberId: string; role: TeamRole },
) => Effect.Effect<
  UpdatedTeamMember,
  TeamCommandError | NotFound | SqlError.SqlError,
  Database | Principal | AuditActor | RequestId | AuditSignal | DeniedAttempts
> = Effect.fn('team.updateMemberRole')(function* (
  access: TeamAccess,
  input: { memberId: string; role: TeamRole },
) {
  return yield* reserved(
    'team.updateMemberRole',
    access.teamId,
    audited(
      'team.updateMemberRole.audited',
      access,
      Effect.gen(function* () {
        const principal = yield* Principal;
        const members = yield* store.lockActorAndTarget({
          teamId: access.teamId,
          actorUserId: principal.userId,
          targetMemberId: input.memberId,
        });
        const target = members.target;
        if (target === null) {
          return yield* new TeamCommandError({ code: 'NOT_FOUND' });
        }

        const refuse = (
          reason: 'insufficient_permission' | 'owner_role_requires_owner',
        ) =>
          denied([
            {
              ...TEAM_EVENT,
              eventType: 'team.member.role_change_denied',
              subjectType: 'team_member',
              subjectId: target.id,
              subjectLabel: memberLabel(target),
              details: { requestedRoles: [input.role], reason },
            },
          ]);

        const actor = members.actor;
        if (actor === null || !(yield* canManage(actor))) {
          return yield* refuse('insufficient_permission');
        }

        const actorIsOwner = yield* isOwner(actor);
        const targetIsOwner = yield* isOwner(target);
        if ((targetIsOwner || input.role === 'owner') && !actorIsOwner) {
          return yield* refuse('owner_role_requires_owner');
        }

        const previousRoles = yield* parseRoles(target.role);
        if (previousRoles.length === 1 && previousRoles[0] === input.role) {
          return yield* new TeamCommandError({ code: 'NO_CHANGE' });
        }

        if (
          targetIsOwner &&
          input.role !== 'owner' &&
          (yield* store.countLockedOwners(access.teamId)) <= 1
        ) {
          return yield* failed('LAST_OWNER', [
            {
              ...TEAM_EVENT,
              eventType: 'team.member.role_change_failed',
              subjectType: null,
              subjectId: null,
              subjectLabel: null,
              details: { failureCode: 'last_owner' },
            },
          ]);
        }

        yield* store.updateMemberRole({
          teamId: access.teamId,
          memberId: target.id,
          role: input.role,
        });
        return changed({ memberId: target.id, role: input.role }, [
          {
            ...TEAM_EVENT,
            eventType: 'team.member.role_changed',
            subjectType: 'team_member',
            subjectId: target.id,
            subjectLabel: memberLabel(target),
            details: { previousRoles, newRoles: [input.role] },
          },
        ]);
      }),
    ),
  );
});

export type CreatedTeamInvitation = {
  invitationId: string;
  email: Redacted.Redacted;
  role: TeamRole;
  status: 'pending';
  expiresAt: Date;
};

export const createTeamInvitation: (
  access: TeamAccess,
  input: { email: Redacted.Redacted; role: TeamRole },
) => Effect.Effect<
  CreatedTeamInvitation,
  TeamCommandError | NotFound | SqlError.SqlError,
  | Database
  | Principal
  | AuditActor
  | RequestId
  | AuditSignal
  | Jobs
  | DeniedAttempts
> = Effect.fn('team.createInvitation')(function* (
  access: TeamAccess,
  input: { email: Redacted.Redacted; role: TeamRole },
) {
  const email = yield* Effect.sync(() =>
    decodeEmail(Redacted.value(input.email).trim().toLowerCase()),
  );

  return yield* reserved(
    'team.createInvitation',
    access.teamId,
    audited(
      'team.createInvitation.audited',
      access,
      Effect.gen(function* () {
        const principal = yield* Principal;
        const context = yield* AuditContext;
        const jobs = yield* Jobs;
        const actor = yield* store.lockActor(access.teamId, principal.userId);

        const refuse = (
          reason: 'insufficient_permission' | 'owner_role_requires_owner',
        ) =>
          denied([
            {
              ...TEAM_EVENT,
              eventType: 'team.invitation.creation_denied',
              subjectType: null,
              subjectId: null,
              subjectLabel: null,
              details: { requestedRole: input.role, reason },
            },
          ]);

        if (actor === null || !(yield* canManage(actor))) {
          return yield* refuse('insufficient_permission');
        }
        if (input.role === 'owner' && !(yield* isOwner(actor))) {
          return yield* refuse('owner_role_requires_owner');
        }

        if (
          (yield* store.hasMemberWithEmail(access.teamId, email)) ||
          (yield* store.hasLivePendingInvitation(access.teamId, email))
        ) {
          return yield* new TeamCommandError({ code: 'CONFLICT' });
        }
        if (
          (yield* store.countLivePendingInvitations(access.teamId)) >=
          INVITATION_LIMIT
        ) {
          return yield* new TeamCommandError({ code: 'CONFLICT' });
        }

        const invitation = yield* store.createInvitation({
          id: randomUUID(),
          teamId: access.teamId,
          email,
          role: input.role,
          inviterId: principal.userId,
        });
        const delivery = yield* enqueueInvitationDelivery({
          invitationId: invitation.id,
          teamId: access.teamId,
          email: invitation.email,
          role: input.role,
          teamLabel: context.teamLabel,
          inviterLabel: context.actorLabel,
          expiresAt: invitation.expiresAt,
        });
        yield* Effect.orDie(
          // `JobRefused` is unreachable: the queue refuses only a `singletonKey`
          // collision, and this enqueue names none.
          jobs.enqueue('invitation-delivery', {
            deliveryId: delivery.deliveryId,
          }),
        );

        return changed(
          {
            invitationId: invitation.id,
            email: invitation.email,
            role: input.role,
            status: 'pending' as const,
            expiresAt: invitation.expiresAt,
          },
          [
            {
              ...TEAM_EVENT,
              eventType: 'team.invitation.created',
              subjectType: 'team_invitation',
              subjectId: invitation.id,
              subjectLabel: invitation.email,
              details: { role: input.role },
            },
          ],
        );
      }),
    ),
  );
});

export type CancelledTeamInvitation = {
  invitationId: string;
  status: 'canceled';
};

export const cancelTeamInvitation: (
  access: TeamAccess,
  input: { invitationId: string },
) => Effect.Effect<
  CancelledTeamInvitation,
  TeamCommandError | NotFound | SqlError.SqlError,
  Database | Principal | AuditActor | RequestId | AuditSignal | DeniedAttempts
> = Effect.fn('team.cancelInvitation')(function* (
  access: TeamAccess,
  input: { invitationId: string },
) {
  return yield* reserved(
    'team.cancelInvitation',
    access.teamId,
    audited(
      'team.cancelInvitation.audited',
      access,
      Effect.gen(function* () {
        const principal = yield* Principal;
        const actor = yield* store.lockActor(access.teamId, principal.userId);
        if (actor === null || !(yield* canManage(actor))) {
          return yield* denied([
            {
              ...TEAM_EVENT,
              eventType: 'team.invitation.cancellation_denied',
              subjectType: null,
              subjectId: null,
              subjectLabel: null,
              details: { reason: 'insufficient_permission' },
            },
          ]);
        }

        // Read before contending for the row: a lock this command never got leaves
        // nothing locked to read the refusal's label from.
        const label = yield* store.readInvitationLabel(
          access.teamId,
          input.invitationId,
        );
        if (label === null) {
          return yield* new TeamCommandError({ code: 'NOT_FOUND' });
        }

        // Postgres answers 55P03 for the `nowait` lock: the one database failure here
        // which is a decision rather than a fault.
        const invitation = yield* store
          .lockInvitation(access.teamId, input.invitationId, { nowait: true })
          .pipe(
            Effect.catch(
              (
                error,
              ): Effect.Effect<
                never,
                AuditableTeamFailure | SqlError.SqlError
              > =>
                isLockUnavailable(error)
                  ? failed('DELIVERY_IN_PROGRESS', [
                      {
                        ...TEAM_EVENT,
                        eventType: 'team.invitation.cancellation_failed',
                        subjectType: 'team_invitation',
                        subjectId: input.invitationId,
                        subjectLabel: label,
                        details: { failureCode: 'delivery_in_progress' },
                      },
                    ])
                  : Effect.fail(error),
            ),
          );

        if (invitation === null) {
          return yield* new TeamCommandError({ code: 'NOT_FOUND' });
        }
        if (invitation.status !== 'pending') {
          return yield* new TeamCommandError({ code: 'NO_CHANGE' });
        }
        if (invitation.role === null) {
          return yield* new TeamCommandError({ code: 'INVALID_ROLE' });
        }
        // Better Auth historically stored role arrays as comma-separated values.
        const roles = yield* parseRoles(invitation.role);

        yield* store.cancelInvitation(access.teamId, invitation.id);
        return changed(
          { invitationId: invitation.id, status: 'canceled' as const },
          [
            {
              ...TEAM_EVENT,
              eventVersion: 2,
              eventType: 'team.invitation.cancelled',
              subjectType: 'team_invitation',
              subjectId: invitation.id,
              subjectLabel: invitation.email,
              details: { roles },
            },
          ],
        );
      }),
    ),
  );
});

export type AcceptedTeamInvitation = {
  invitationId: string;
  teamId: string;
  teamName: Redacted.Redacted;
  memberId: string;
  role: TeamRole;
  status: 'accepted';
};

export const acceptTeamInvitation: (input: {
  invitationId: string;
}) => Effect.Effect<
  AcceptedTeamInvitation,
  TeamCommandError | NotFound | SqlError.SqlError,
  Database | Principal | AuditActor | RequestId | AuditSignal | DeniedAttempts
> = Effect.fn('team.acceptInvitation')(function* (input: {
  invitationId: string;
}) {
  const invitationId = yield* Effect.sync(() =>
    Schema.decodeUnknownSync(TeamInvitationId)(input.invitationId),
  );
  // Untenanted: `team_invitations` carries no row-level-security policy, and
  // this lookup decides which team the transaction below opens on.
  const teamId = yield* UntenantedScope.open(
    store.findInvitationTeam(invitationId),
  );
  if (teamId === null) {
    return yield* new TeamCommandError({ code: 'FORBIDDEN' });
  }

  // Minted for somebody who is NOT a member, before the row is locked: the proof
  // is the locked re-read below, not the mint.
  const access = unsafeMakeTeamAccess(teamId, 'member');

  return yield* reserved(
    'team.acceptInvitation',
    teamId,
    audited(
      'team.acceptInvitation.audited',
      access,
      Effect.gen(function* () {
        const principal = yield* Principal;
        const context = yield* AuditContext;
        const invitation = yield* store.lockInvitation(teamId, invitationId);
        if (invitation === null) {
          return yield* new TeamCommandError({ code: 'FORBIDDEN' });
        }

        const refuse = (
          reason:
            | 'email_mismatch'
            | 'email_unverified'
            | 'invitation_unavailable',
        ) =>
          denied([
            {
              ...TEAM_EVENT,
              eventType: 'team.invitation.acceptance_denied',
              subjectType: 'team_invitation',
              subjectId: invitation.id,
              subjectLabel: invitation.email,
              details: { reason },
            },
          ]);

        if (!principal.emailVerified) return yield* refuse('email_unverified');
        if (
          Redacted.value(invitation.email).toLowerCase() !==
          Redacted.value(principal.email).trim().toLowerCase()
        ) {
          return yield* refuse('email_mismatch');
        }
        if (
          (invitation.status !== 'pending' &&
            invitation.status !== 'accepted') ||
          (invitation.status === 'pending' && !invitation.isLive)
        ) {
          return yield* refuse('invitation_unavailable');
        }

        const bounded = (failureCode: 'invalid_role' | 'conflict') =>
          [
            {
              ...TEAM_EVENT,
              eventType: 'team.invitation.acceptance_failed',
              subjectType: null,
              subjectId: null,
              subjectLabel: null,
              details: { failureCode },
            },
          ] satisfies AuditEvents;

        if (invitation.role === null) {
          return yield* failed('INVALID_ROLE', bounded('invalid_role'));
        }
        const roles = tryParseRoles(invitation.role);
        // One role for one new membership, deliberately: a legacy comma-separated
        // value can be cancelled but not accepted.
        if (roles === null || roles.length !== 1) {
          return yield* failed('INVALID_ROLE', bounded('invalid_role'));
        }
        const role = roles[0]!;

        const memberships = yield* store.lockMembershipSet(
          teamId,
          principal.userId,
        );

        if (invitation.status === 'accepted') {
          if (memberships.existing === null) {
            return yield* failed('CONFLICT', bounded('conflict'));
          }
          const existingRoles = yield* Effect.orElseSucceed(
            parseRoles(memberships.existing.role),
            () => null,
          );
          if (existingRoles === null || existingRoles.length !== 1) {
            return yield* failed('INVALID_ROLE', bounded('invalid_role'));
          }
          return unchanged({
            invitationId,
            teamId,
            teamName: context.teamLabel,
            memberId: memberships.existing.id,
            role: existingRoles[0]!,
            status: 'accepted' as const,
          });
        }

        if (
          memberships.existing !== null ||
          memberships.count >= MEMBERSHIP_LIMIT
        ) {
          return yield* failed('CONFLICT', bounded('conflict'));
        }

        const memberId = randomUUID();
        yield* store.createMember({
          id: memberId,
          teamId,
          userId: principal.userId,
          role,
        });
        yield* store.acceptInvitation(teamId, invitationId);
        return changed(
          {
            invitationId,
            teamId,
            teamName: context.teamLabel,
            memberId,
            role,
            status: 'accepted' as const,
          },
          [
            {
              ...TEAM_EVENT,
              eventType: 'team.invitation.accepted',
              subjectType: 'team_invitation',
              subjectId: invitationId,
              subjectLabel: invitation.email,
              details: { role, memberId },
            },
          ],
        );
      }),
    ),
  );
});
