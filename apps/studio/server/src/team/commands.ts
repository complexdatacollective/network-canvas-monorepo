import { randomUUID } from 'node:crypto';

import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';
import { z } from 'zod';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import type { NotFound } from '@codaco/studio-contract/schema/errors';
import { TeamInvitationIdSchema, type TeamRole } from '@codaco/studio-rpc';

import { audited, auditable, changed, unchanged } from '../audit/audited.ts';
import type {
  AuditableFailure,
  AuditEventBody,
  AuditEvents,
} from '../audit/audited.ts';
import { AuditContext } from '../audit/context.ts';
import { reservedDenial } from '../audit/denial-rate-limit.ts';
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

// The four team commands, on `audited` (#1927 §10).
//
// What the combinator took over, and what that removed from here:
//
//   * The trusted half of every event — the team, the team's locked label, the
//     actor, the request — is stamped by `audited` and *absent* from the
//     `AuditEventBody` a command may write. The `assertEventContext` this file
//     used to rely on compared exactly those fields; a mismatch is no longer
//     refused at runtime because it can no longer be written.
//   * The outcome is likewise the combinator's. A success is `changed(...)` or
//     `unchanged(...)`; a denial or a bounded failure is an error carrying the
//     `auditable` marker, and `audited` stamps `denied`/`failed` from the
//     marker rather than from anything the command claims.
//   * The savepoint is the combinator's too. `audited` runs the whole body in
//     one, captures its `Exit`, and appends the events that Exit implies after
//     the savepoint has rolled back — so a bounded failure leaves its record
//     and none of its writes, without this file opening a nested transaction
//     per command.
//
// What is still here, because it is this file's: which refusals are auditable.
// A denial the team is entitled to see carries the marker; a conflict, a
// no-change and a not-found do not, so they roll the whole transaction back
// and leave nothing — an immutable log is the wrong place for "you asked for
// something that was already true".

const EmailSchema = z.email().max(320);
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

/** The fields every team-access event carries and no command varies. */
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

const memberLabel = (member: store.LockedMember): string =>
  (member.name.trim() || member.email).slice(0, 320);

/** What an auditable refusal is: the command's own error, carrying its event. */
type AuditableTeamFailure = TeamCommandError & AuditableFailure;

/** A denial the team is entitled to see, as a failure `audited` can stamp. */
const denied = (
  events: AuditEvents,
): Effect.Effect<never, AuditableTeamFailure> =>
  Effect.fail(
    auditable(new TeamCommandError({ code: 'FORBIDDEN' }), {
      outcome: 'denied',
      events,
    }),
  );

/** A bounded failure, likewise: the write is undone and the record is kept. */
const failed = (
  code: TeamCommandErrorCode,
  events: AuditEvents,
): Effect.Effect<never, AuditableTeamFailure> =>
  Effect.fail(
    auditable(new TeamCommandError({ code }), { outcome: 'failed', events }),
  );

/**
 * The denial window, with this tier's reading of it: only a `FORBIDDEN` is a
 * denial, and a suppressed attempt is answered with the same `FORBIDDEN` the
 * command would have given.
 */
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
  Database | Principal | RequestId | AuditSignal
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

        // The authoritative check, and the reason it is here rather than in
        // the middleware: `openTeam` answered about a membership that is
        // already stale by the time this transaction opens, and the row read
        // here is locked, so a role revoked in that window refuses the change
        // instead of committing under the older answer.
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
          // The one failure this command records. It names no subject: the
          // team, not the member, is what ran out of owners.
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
  email: string;
  role: TeamRole;
  status: 'pending';
  expiresAt: Date;
};

export const createTeamInvitation: (
  access: TeamAccess,
  input: { email: string; role: TeamRole },
) => Effect.Effect<
  CreatedTeamInvitation,
  TeamCommandError | NotFound | SqlError.SqlError,
  Database | Principal | RequestId | AuditSignal | Jobs
> = Effect.fn('team.createInvitation')(function* (
  access: TeamAccess,
  input: { email: string; role: TeamRole },
) {
  // A malformed address is a contract violation rather than a refusal a caller
  // could act on, and it reaches the transport as the fault it is — which is
  // what the thrown `ZodError` did here before.
  const email = yield* Effect.sync(() =>
    EmailSchema.parse(input.email.trim().toLowerCase()),
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
          // The labels the combinator locked, not ones this command chose: the
          // email the invitee reads names the team as it was when the
          // invitation was made.
          teamLabel: context.teamLabel,
          inviterLabel: context.actorLabel,
          expiresAt: invitation.expiresAt,
        });
        // In the command's own transaction (#1895), which `Jobs.enqueue`
        // guarantees at the type level: it requires `Transaction`, and the
        // only thing that provides one is the scope `audited` opened. A
        // rollback therefore takes the job with it, and a commit can never
        // leave an invitation nothing will ever send. The optional job client
        // this replaced could be absent, which is why it had a runtime throw;
        // a missing service is now a wiring error the graph refuses to build.
        yield* Effect.orDie(
          // `JobRefused` is unreachable here and is not a refusal this command
          // could answer with: the queue refuses only a collision on a
          // per-enqueue `singletonKey`, and this enqueue names none. A
          // deliveryId is minted per invitation, so there is nothing for a
          // second job to collide with either.
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
  Database | Principal | RequestId | AuditSignal
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

        // Read before contending for the row: the refusal below names the
        // invitation it could not cancel, and a lock this command never got
        // leaves nothing locked to read that label from. Unlocked is enough
        // for a label — the decision itself is made under the lock.
        const label = yield* store.readInvitationLabel(
          access.teamId,
          input.invitationId,
        );
        if (label === null) {
          return yield* new TeamCommandError({ code: 'NOT_FOUND' });
        }

        // The delivery handler holds this same row for the length of its send
        // (#1895). Waiting for it would hold the team's audit lock behind an
        // SMTP call, so this asks not to wait; Postgres answers 55P03, and
        // that is the one database failure here which is a decision rather
        // than a fault.
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
        // Better Auth historically stored role arrays as comma-separated
        // values. Cancellation stays available for those rows, while
        // acceptance below deliberately remains limited to one role for one
        // new membership.
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
  teamName: string;
  memberId: string;
  role: TeamRole;
  status: 'accepted';
};

/**
 * Invitation acceptance is the one team command whose authenticated actor is
 * not a member yet. The browser supplies only the opaque invitation id, so the
 * tenant is resolved here rather than taken from the request, and every piece
 * of invitation and membership evidence is then locked and revalidated inside
 * the ordinary audited team transaction.
 */
export const acceptTeamInvitation: (input: {
  invitationId: string;
}) => Effect.Effect<
  AcceptedTeamInvitation,
  TeamCommandError | NotFound | SqlError.SqlError,
  Database | Principal | RequestId | AuditSignal
> = Effect.fn('team.acceptInvitation')(function* (input: {
  invitationId: string;
}) {
  const invitationId = yield* Effect.sync(() =>
    TeamInvitationIdSchema.parse(input.invitationId),
  );
  // Untenanted because there is no tenant yet: `team_invitations` carries no
  // row-level-security policy, and this lookup is what decides which team the
  // audited transaction below will be opened on.
  const teamId = yield* UntenantedScope.open(
    store.findInvitationTeam(invitationId),
  );
  // Unknown, expired, cancelled and wrong-account invitations all expose the
  // same refusal to the caller. Only a server-resolved tenant can receive a
  // bounded immutable denial event.
  if (teamId === null) {
    return yield* new TeamCommandError({ code: 'FORBIDDEN' });
  }

  // The access this command opens its transaction on, and the one place in
  // Studio where the token is minted for somebody who is NOT a member: the
  // invitation row is what names the team, and the actor's right to act in it
  // is exactly what the command is about to decide.
  //
  // It is minted BEFORE the row is locked, because the scope has to be open
  // before anything can be locked inside it — so the mint is not the proof.
  // The proof is the locked re-read below: the transaction it opens is
  // stamped with the team the invitation named, and every decision after that
  // comes from the invitation row under `FOR UPDATE`. A token for a team the
  // caller has no claim on therefore buys nothing: the command denies, and the
  // denial is the event that team is entitled to.
  //
  // The role carried is the invitee's prospective one and nothing is read from
  // it; `TeamAccess.role` only ever decides ordering, never authorization.
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
          invitation.email.toLowerCase() !==
          principal.email.trim().toLowerCase()
        ) {
          return yield* refuse('email_mismatch');
        }
        // `isLive` is the database's own comparison against
        // `clock_timestamp()`, so an application host running behind cannot
        // accept an invitation Postgres considers expired.
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
        // One role for one new membership, deliberately: a legacy
        // comma-separated value can still be cancelled, but it cannot be
        // turned into a membership whose role nothing can name.
        if (roles === null || roles.length !== 1) {
          return yield* failed('INVALID_ROLE', bounded('invalid_role'));
        }
        const role = roles[0]!;

        const memberships = yield* store.lockMembershipSet(
          teamId,
          principal.userId,
        );

        if (invitation.status === 'accepted') {
          // The lost-response replay: the identities are the same and nothing
          // changed, so this must return what the first call returned rather
          // than invent a second acceptance event.
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

/** Exported for the suites' compile assertions; nothing in production reads it. */
export type { AuditEventBody };
