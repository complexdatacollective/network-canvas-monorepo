import type pg from 'pg';

import type { TenantDb } from '@codaco/studio-sync/tenant';

import type { Principal } from '../auth/service.ts';
import type { AuditEventInput } from './events.ts';
import { AuditStore, lockAuditTeam } from './store.ts';

export type AuditedCommandContext = {
  tenantDb: TenantDb;
  principal: Principal;
  requestId: string;
};

export type LockedAuditedCommandContext = AuditedCommandContext & {
  teamLabel: string;
};

export class AuditCommandTeamNotFoundError extends Error {
  constructor() {
    super('audit command team not found');
    this.name = 'AuditCommandTeamNotFoundError';
  }
}

export type AuditedMutationResult<T> = {
  result: T;
  events: readonly [AuditEventInput, ...AuditEventInput[]];
};

export type AuditedCommandDecision<T> =
  | ({ status: 'succeeded' } & AuditedMutationResult<T>)
  | {
      status: 'denied';
      error: Error;
      events: readonly [AuditEventInput, ...AuditEventInput[]];
    };

const auditStore = new AuditStore();

function actorLabel(context: AuditedCommandContext): string {
  return (context.principal.name.trim() || context.principal.email).slice(
    0,
    320,
  );
}

export function auditEventContext(context: LockedAuditedCommandContext) {
  return {
    teamId: context.tenantDb.teamId,
    teamLabel: context.teamLabel,
    eventVersion: 1,
    category: 'team_access',
    outcome: 'succeeded',
    actorKind: 'user',
    actorId: context.principal.userId,
    actorLabel: actorLabel(context),
    requestId: context.requestId,
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
  } as const;
}

export function deniedAuditEventContext(context: LockedAuditedCommandContext) {
  return {
    ...auditEventContext(context),
    outcome: 'denied',
  } as const;
}

function assertEventContext(
  context: LockedAuditedCommandContext,
  event: AuditEventInput,
  decisionStatus: AuditedCommandDecision<unknown>['status'],
): void {
  if (
    event.teamId !== context.tenantDb.teamId ||
    event.teamLabel !== context.teamLabel ||
    event.actorKind !== 'user' ||
    event.actorId !== context.principal.userId ||
    event.actorLabel !== actorLabel(context) ||
    event.requestId !== context.requestId
  ) {
    throw new Error('audit event context does not match its command');
  }
  if (event.outcome !== decisionStatus) {
    throw new Error('audit event outcome does not match its command decision');
  }
}

/**
 * Runs a command whose authorization decision is itself auditable. A denied
 * decision appends its event and commits no domain mutation, then throws only
 * after that transaction has committed. If the denial event cannot be
 * written, the requested action still never runs.
 */
export async function runAuditedCommand<T>(
  context: AuditedCommandContext,
  work: (
    client: pg.PoolClient,
    auditContext: LockedAuditedCommandContext,
  ) => Promise<AuditedCommandDecision<T>>,
): Promise<T> {
  const decision = await context.tenantDb.transaction(async (client) => {
    await lockAuditTeam(client, context.tenantDb.teamId);
    const team = await client.query<{ name: string }>(
      `SELECT name FROM teams WHERE id = $1 FOR UPDATE`,
      [context.tenantDb.teamId],
    );
    const lockedTeam = team.rows[0];
    if (!lockedTeam) throw new AuditCommandTeamNotFoundError();
    const teamName = lockedTeam.name.trim();
    if (!teamName) throw new Error('audit command team name is empty');
    const auditContext: LockedAuditedCommandContext = {
      ...context,
      teamLabel: teamName.slice(0, 320),
    };
    const result = await work(client, auditContext);
    if (result.events.length === 0) {
      throw new Error('an audited command must produce at least one event');
    }
    for (const event of result.events) {
      assertEventContext(auditContext, event, result.status);
      await auditStore.append(client, event);
    }
    return result;
  });

  if (decision.status === 'denied') throw decision.error;
  return decision.result;
}

export async function runAuditedMutation<T>(
  context: AuditedCommandContext,
  work: (
    client: pg.PoolClient,
    auditContext: LockedAuditedCommandContext,
  ) => Promise<AuditedMutationResult<T>>,
): Promise<T> {
  return runAuditedCommand(context, async (client, auditContext) => {
    const mutation = await work(client, auditContext);
    return { status: 'succeeded', ...mutation };
  });
}
