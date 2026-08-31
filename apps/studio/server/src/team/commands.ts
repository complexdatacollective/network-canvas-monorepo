import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

import {
  TeamInvitationIdSchema,
  TeamRoleSchema,
  type TeamRole,
} from '@codaco/studio-rpc';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  auditActorEventContext,
  auditEventContext,
  type AuditedCommandContext,
  deniedAuditEventContext,
  failedAuditEventContext,
  runAuditedCommand,
  runAuditedCommandWork,
} from '../audit/command.ts';
import { reserveDeniedAuditAttempt } from '../audit/denial-rate-limit.ts';
import { createDeniedAuditSummaryWriter } from '../audit/denial-summary.ts';
import type { AuditEventInput, DeniedAuditOperation } from '../audit/events.ts';
import { enqueueInvitationDelivery } from './invitation-delivery-store.ts';
import { TeamStore, type LockedMember } from './store.ts';

const EmailSchema = z.email().max(320);
const INVITATION_LIMIT = 100;
const MEMBERSHIP_LIMIT = 100;

export type TeamCommandErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NO_CHANGE'
  | 'LAST_OWNER'
  | 'INVALID_ROLE';

export class TeamCommandError extends Error {
  readonly code: TeamCommandErrorCode;

  constructor(code: TeamCommandErrorCode) {
    super(code);
    this.name = 'TeamCommandError';
    this.code = code;
  }
}

const store = new TeamStore();

function parseRoles(value: string): TeamRole[] {
  const roles = value
    .split(',')
    .map((role) => role.trim())
    .flatMap((role) => {
      const parsed = TeamRoleSchema.safeParse(role);
      return parsed.success ? [parsed.data] : [];
    });
  if (roles.length === 0 || roles.join(',') !== value.replaceAll(' ', '')) {
    throw new TeamCommandError('INVALID_ROLE');
  }
  return [...new Set(roles)];
}

function canManage(member: LockedMember): boolean {
  const roles = parseRoles(member.role);
  return roles.includes('owner') || roles.includes('admin');
}

function isOwner(member: LockedMember): boolean {
  return parseRoles(member.role).includes('owner');
}

function memberLabel(member: LockedMember): string {
  return (member.name.trim() || member.email).slice(0, 320);
}

function reserveDeniedTeamCommand(
  context: AuditedCommandContext,
  operation: DeniedAuditOperation,
) {
  return reserveDeniedAuditAttempt(
    {
      actorId: context.principal.userId,
      teamId: context.tenantDb.teamId,
      operation,
    },
    createDeniedAuditSummaryWriter(context, operation),
  );
}

export type UpdatedTeamMember = { memberId: string; role: TeamRole };

export async function updateTeamMemberRole(
  context: AuditedCommandContext,
  input: { memberId: string; role: TeamRole },
): Promise<UpdatedTeamMember> {
  const reservation = reserveDeniedTeamCommand(
    context,
    'team.updateMemberRole',
  );
  if (!reservation.admitted) throw new TeamCommandError('FORBIDDEN');

  try {
    const result = await runAuditedCommand(
      context,
      async (client, auditContext) => {
        const members = await store.lockActorAndTarget(client, {
          teamId: context.tenantDb.teamId,
          actorUserId: context.principal.userId,
          targetMemberId: input.memberId,
        });
        const target = members.target;
        if (!target) throw new TeamCommandError('NOT_FOUND');

        const denied = (
          reason: 'insufficient_permission' | 'owner_role_requires_owner',
        ) => {
          const event = {
            ...deniedAuditEventContext(auditContext),
            eventType: 'team.member.role_change_denied',
            subjectType: 'team_member',
            subjectId: target.id,
            subjectLabel: memberLabel(target),
            details: { requestedRoles: [input.role], reason },
          } satisfies AuditEventInput;
          return {
            status: 'denied' as const,
            error: new TeamCommandError('FORBIDDEN'),
            events: [event] as const,
          };
        };

        const actor = members.actor;
        if (!actor || !canManage(actor)) {
          return denied('insufficient_permission');
        }

        const actorIsOwner = isOwner(actor);
        const targetIsOwner = isOwner(target);
        if ((targetIsOwner || input.role === 'owner') && !actorIsOwner) {
          return denied('owner_role_requires_owner');
        }

        const previousRoles = parseRoles(target.role);
        if (previousRoles.length === 1 && previousRoles[0] === input.role) {
          throw new TeamCommandError('NO_CHANGE');
        }
        return runAuditedCommandWork(
          client,
          async () => {
            if (
              targetIsOwner &&
              input.role !== 'owner' &&
              (await store.countLockedOwners(
                client,
                context.tenantDb.teamId,
              )) <= 1
            ) {
              throw new TeamCommandError('LAST_OWNER');
            }

            await store.updateMemberRole(client, {
              teamId: context.tenantDb.teamId,
              memberId: target.id,
              role: input.role,
            });
            const event = {
              ...auditEventContext(auditContext),
              eventType: 'team.member.role_changed',
              subjectType: 'team_member',
              subjectId: target.id,
              subjectLabel: memberLabel(target),
              details: { previousRoles, newRoles: [input.role] },
            } satisfies AuditEventInput;
            return {
              result: { memberId: target.id, role: input.role },
              events: [event],
            };
          },
          (error) => {
            if (
              !(error instanceof TeamCommandError) ||
              error.code !== 'LAST_OWNER'
            ) {
              return null;
            }
            const event = {
              ...failedAuditEventContext(auditContext),
              eventType: 'team.member.role_change_failed',
              subjectType: null,
              subjectId: null,
              subjectLabel: null,
              details: { failureCode: 'last_owner' },
            } satisfies AuditEventInput;
            return { error, events: [event] };
          },
        );
      },
    );
    reservation.complete('other');
    return result;
  } catch (error) {
    reservation.complete(
      error instanceof TeamCommandError && error.code === 'FORBIDDEN'
        ? 'denied'
        : 'other',
    );
    throw error;
  }
}

export type CreatedTeamInvitation = {
  invitationId: string;
  email: string;
  role: TeamRole;
  status: 'pending';
  expiresAt: Date;
};

export async function createTeamInvitation(
  context: AuditedCommandContext,
  input: { email: string; role: TeamRole },
): Promise<CreatedTeamInvitation> {
  const email = EmailSchema.parse(input.email.trim().toLowerCase());
  const reservation = reserveDeniedTeamCommand(
    context,
    'team.createInvitation',
  );
  if (!reservation.admitted) throw new TeamCommandError('FORBIDDEN');

  try {
    const result = await runAuditedCommand<CreatedTeamInvitation>(
      context,
      async (client, auditContext) => {
        const actor = await store.lockActor(
          client,
          context.tenantDb.teamId,
          context.principal.userId,
        );
        const denied = (
          reason: 'insufficient_permission' | 'owner_role_requires_owner',
        ) => {
          const event = {
            ...deniedAuditEventContext(auditContext),
            eventType: 'team.invitation.creation_denied',
            subjectType: null,
            subjectId: null,
            subjectLabel: null,
            details: { requestedRole: input.role, reason },
          } satisfies AuditEventInput;
          return {
            status: 'denied' as const,
            error: new TeamCommandError('FORBIDDEN'),
            events: [event] as const,
          };
        };
        if (!actor || !canManage(actor)) {
          return denied('insufficient_permission');
        }
        if (input.role === 'owner' && !isOwner(actor)) {
          return denied('owner_role_requires_owner');
        }
        if (
          (await store.hasMemberWithEmail(
            client,
            context.tenantDb.teamId,
            email,
          )) ||
          (await store.hasLivePendingInvitation(
            client,
            context.tenantDb.teamId,
            email,
          ))
        ) {
          throw new TeamCommandError('CONFLICT');
        }
        if (
          (await store.countLivePendingInvitations(
            client,
            context.tenantDb.teamId,
          )) >= INVITATION_LIMIT
        ) {
          throw new TeamCommandError('CONFLICT');
        }

        const invitation = await store.createInvitation(client, {
          id: randomUUID(),
          teamId: context.tenantDb.teamId,
          email,
          role: input.role,
          inviterId: context.principal.userId,
        });
        await enqueueInvitationDelivery(client, {
          invitationId: invitation.id,
          teamId: context.tenantDb.teamId,
          email: invitation.email,
          role: input.role,
          teamLabel: auditContext.teamLabel,
          inviterLabel: auditActorEventContext(auditContext).actorLabel,
          expiresAt: invitation.expiresAt,
        });
        const event = {
          ...auditEventContext(auditContext),
          eventType: 'team.invitation.created',
          subjectType: 'team_invitation',
          subjectId: invitation.id,
          subjectLabel: invitation.email,
          details: { role: input.role },
        } satisfies AuditEventInput;
        return {
          status: 'succeeded' as const,
          result: {
            invitationId: invitation.id,
            email: invitation.email,
            role: input.role,
            status: 'pending' as const,
            expiresAt: invitation.expiresAt,
          },
          events: [event] as const,
        };
      },
    );
    reservation.complete('other');
    return result;
  } catch (error) {
    reservation.complete(
      error instanceof TeamCommandError && error.code === 'FORBIDDEN'
        ? 'denied'
        : 'other',
    );
    throw error;
  }
}

export type CancelledTeamInvitation = {
  invitationId: string;
  status: 'canceled';
};

export async function cancelTeamInvitation(
  context: AuditedCommandContext,
  input: { invitationId: string },
): Promise<CancelledTeamInvitation> {
  const reservation = reserveDeniedTeamCommand(
    context,
    'team.cancelInvitation',
  );
  if (!reservation.admitted) throw new TeamCommandError('FORBIDDEN');

  try {
    const result = await runAuditedCommand<CancelledTeamInvitation>(
      context,
      async (client, auditContext) => {
        const actor = await store.lockActor(
          client,
          context.tenantDb.teamId,
          context.principal.userId,
        );
        if (!actor || !canManage(actor)) {
          const event = {
            ...deniedAuditEventContext(auditContext),
            eventType: 'team.invitation.cancellation_denied',
            subjectType: null,
            subjectId: null,
            subjectLabel: null,
            details: { reason: 'insufficient_permission' },
          } satisfies AuditEventInput;
          return {
            status: 'denied' as const,
            error: new TeamCommandError('FORBIDDEN'),
            events: [event] as const,
          };
        }
        const invitation = await store.lockInvitation(
          client,
          context.tenantDb.teamId,
          input.invitationId,
        );
        if (!invitation) throw new TeamCommandError('NOT_FOUND');
        if (invitation.status !== 'pending') {
          throw new TeamCommandError('NO_CHANGE');
        }
        if (!invitation.role) throw new TeamCommandError('INVALID_ROLE');
        const roles = parseRoles(invitation.role);
        // Better Auth historically stored role arrays as comma-separated values.
        // Cancellation stays available for those rows, while acceptance below
        // deliberately remains limited to one role for one new membership.
        await store.cancelInvitation(
          client,
          context.tenantDb.teamId,
          invitation.id,
        );
        const event = {
          ...auditEventContext(auditContext),
          eventVersion: 2,
          eventType: 'team.invitation.cancelled',
          subjectType: 'team_invitation',
          subjectId: invitation.id,
          subjectLabel: invitation.email,
          details: { roles },
        } satisfies AuditEventInput;
        return {
          status: 'succeeded' as const,
          result: { invitationId: invitation.id, status: 'canceled' as const },
          events: [event] as const,
        };
      },
    );
    reservation.complete('other');
    return result;
  } catch (error) {
    reservation.complete(
      error instanceof TeamCommandError && error.code === 'FORBIDDEN'
        ? 'denied'
        : 'other',
    );
    throw error;
  }
}

export type AcceptedTeamInvitation = {
  invitationId: string;
  teamId: string;
  teamName: string;
  memberId: string;
  role: TeamRole;
  status: 'accepted';
};

export type InvitationCommandContext = {
  pool: pg.Pool;
  principal: AuditedCommandContext['principal'];
  requestId: string;
};

/**
 * Invitation acceptance is the one team command whose authenticated actor is
 * not a member yet. The browser supplies only the opaque invitation id; this
 * command resolves the tenant, then locks and revalidates all invitation and
 * membership evidence inside the ordinary audited team transaction.
 */
export async function acceptTeamInvitation(
  context: InvitationCommandContext,
  input: { invitationId: string },
): Promise<AcceptedTeamInvitation> {
  const invitationId = TeamInvitationIdSchema.parse(input.invitationId);
  const teamId = await store.findInvitationTeamId(context.pool, invitationId);
  // Unknown, expired, cancelled, and wrong-account invitations all expose the
  // same refusal to the caller. Only a server-resolved tenant can receive a
  // bounded immutable denial event.
  if (!teamId) throw new TeamCommandError('FORBIDDEN');
  const auditedContext = {
    tenantDb: createTenantDb(context.pool, teamId),
    principal: context.principal,
    requestId: context.requestId,
  } satisfies AuditedCommandContext;
  const reservation = reserveDeniedTeamCommand(
    auditedContext,
    'team.acceptInvitation',
  );
  if (!reservation.admitted) throw new TeamCommandError('FORBIDDEN');

  try {
    const result = await runAuditedCommand(
      auditedContext,
      async (client, auditContext) => {
        const invitation = await store.lockInvitation(
          client,
          teamId,
          invitationId,
        );
        if (!invitation) throw new TeamCommandError('FORBIDDEN');
        const denied = (
          reason:
            | 'email_mismatch'
            | 'email_unverified'
            | 'invitation_unavailable',
        ) => {
          const event = {
            ...deniedAuditEventContext(auditContext),
            eventType: 'team.invitation.acceptance_denied',
            subjectType: 'team_invitation',
            subjectId: invitation.id,
            subjectLabel: invitation.email,
            details: { reason },
          } satisfies AuditEventInput;
          return {
            status: 'denied' as const,
            error: new TeamCommandError('FORBIDDEN'),
            events: [event] as const,
          };
        };
        if (!context.principal.emailVerified) {
          return denied('email_unverified');
        }
        if (
          invitation.email.toLowerCase() !==
          context.principal.email.trim().toLowerCase()
        ) {
          return denied('email_mismatch');
        }
        if (
          (invitation.status !== 'pending' &&
            invitation.status !== 'accepted') ||
          (invitation.status === 'pending' && !invitation.isLive)
        ) {
          return denied('invitation_unavailable');
        }
        return runAuditedCommandWork(
          client,
          async () => {
            if (!invitation.role) {
              throw new TeamCommandError('INVALID_ROLE');
            }
            const roles = parseRoles(invitation.role);
            if (roles.length !== 1) {
              throw new TeamCommandError('INVALID_ROLE');
            }
            const role = roles[0]!;

            const memberships = await store.lockMembershipSet(
              client,
              teamId,
              context.principal.userId,
            );
            if (invitation.status === 'accepted') {
              if (!memberships.existing) {
                throw new TeamCommandError('CONFLICT');
              }
              const existingRoles = parseRoles(memberships.existing.role);
              if (existingRoles.length !== 1) {
                throw new TeamCommandError('INVALID_ROLE');
              }
              return {
                status: 'unchanged' as const,
                result: {
                  invitationId,
                  teamId,
                  teamName: auditContext.teamLabel,
                  memberId: memberships.existing.id,
                  role: existingRoles[0]!,
                  status: 'accepted' as const,
                },
              };
            }
            if (memberships.existing || memberships.count >= MEMBERSHIP_LIMIT) {
              throw new TeamCommandError('CONFLICT');
            }

            const memberId = randomUUID();
            await store.createMember(client, {
              id: memberId,
              teamId,
              userId: context.principal.userId,
              role,
            });
            await store.acceptInvitation(client, teamId, invitationId);
            const event = {
              ...auditEventContext(auditContext),
              eventType: 'team.invitation.accepted',
              subjectType: 'team_invitation',
              subjectId: invitationId,
              subjectLabel: invitation.email,
              details: { role, memberId },
            } satisfies AuditEventInput;
            return {
              result: {
                invitationId,
                teamId,
                teamName: auditContext.teamLabel,
                memberId,
                role,
                status: 'accepted' as const,
              },
              events: [event],
            };
          },
          (error) => {
            if (
              !(error instanceof TeamCommandError) ||
              (error.code !== 'INVALID_ROLE' && error.code !== 'CONFLICT')
            ) {
              return null;
            }
            const event = {
              ...failedAuditEventContext(auditContext),
              eventType: 'team.invitation.acceptance_failed',
              subjectType: null,
              subjectId: null,
              subjectLabel: null,
              details: {
                failureCode:
                  error.code === 'INVALID_ROLE' ? 'invalid_role' : 'conflict',
              },
            } satisfies AuditEventInput;
            return { error, events: [event] };
          },
        );
      },
    );
    reservation.complete('other');
    return result;
  } catch (error) {
    reservation.complete(
      error instanceof TeamCommandError && error.code === 'FORBIDDEN'
        ? 'denied'
        : 'other',
    );
    throw error;
  }
}
