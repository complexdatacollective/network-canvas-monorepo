import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { TeamRoleSchema, type TeamRole } from '@codaco/studio-rpc';

import {
  auditEventContext,
  type AuditedCommandContext,
  deniedAuditEventContext,
  failedAuditEventContext,
  runAuditedCommand,
  runAuditedCommandWork,
  runAuditedMutation,
} from '../audit/command.ts';
import { reserveDeniedAuditAttempt } from '../audit/denial-rate-limit.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { TeamStore, type LockedMember } from './store.ts';

const EmailSchema = z.email().max(320);
const INVITATION_LIMIT = 100;

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

function requireManager(actor: LockedMember | null): LockedMember {
  if (!actor || !canManage(actor)) throw new TeamCommandError('FORBIDDEN');
  return actor;
}

export type UpdatedTeamMember = { memberId: string; role: TeamRole };

export async function updateTeamMemberRole(
  context: AuditedCommandContext,
  input: { memberId: string; role: TeamRole },
): Promise<UpdatedTeamMember> {
  const reservation = reserveDeniedAuditAttempt({
    actorId: context.principal.userId,
    teamId: context.tenantDb.teamId,
    operation: 'team.updateMemberRole',
  });
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
  return runAuditedMutation(context, async (client, auditContext) => {
    const actor = requireManager(
      await store.lockActor(
        client,
        context.tenantDb.teamId,
        context.principal.userId,
      ),
    );
    if (input.role === 'owner' && !isOwner(actor)) {
      throw new TeamCommandError('FORBIDDEN');
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
    const event = {
      ...auditEventContext(auditContext),
      eventType: 'team.invitation.created',
      subjectType: 'team_invitation',
      subjectId: invitation.id,
      subjectLabel: invitation.email,
      details: { role: input.role },
    } satisfies AuditEventInput;
    return {
      result: {
        invitationId: invitation.id,
        email: invitation.email,
        role: input.role,
        status: 'pending' as const,
        expiresAt: invitation.expiresAt,
      },
      events: [event],
    };
  });
}

export type CancelledTeamInvitation = {
  invitationId: string;
  status: 'canceled';
};

export async function cancelTeamInvitation(
  context: AuditedCommandContext,
  input: { invitationId: string },
): Promise<CancelledTeamInvitation> {
  return runAuditedMutation(context, async (client, auditContext) => {
    requireManager(
      await store.lockActor(
        client,
        context.tenantDb.teamId,
        context.principal.userId,
      ),
    );
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
    if (roles.length !== 1) throw new TeamCommandError('INVALID_ROLE');
    const role = roles[0]!;
    await store.cancelInvitation(
      client,
      context.tenantDb.teamId,
      invitation.id,
    );
    const event = {
      ...auditEventContext(auditContext),
      eventType: 'team.invitation.cancelled',
      subjectType: 'team_invitation',
      subjectId: invitation.id,
      subjectLabel: invitation.email,
      details: { role },
    } satisfies AuditEventInput;
    return {
      result: { invitationId: invitation.id, status: 'canceled' as const },
      events: [event],
    };
  });
}
