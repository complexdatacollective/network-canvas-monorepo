import type pg from 'pg';

import type { TenantDb } from '@codaco/studio-sync/tenant';

import type { Principal } from '../auth/service.ts';
import { logOperational } from '../observability/logger.ts';
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
    }
  | {
      status: 'failed';
      error: Error;
      events: readonly [AuditEventInput, ...AuditEventInput[]];
    }
  | {
      // An idempotent replay or domain no-op completed without a mutation, so
      // it must neither invent a success event nor weaken the non-empty event
      // contract for a command that actually changed state.
      status: 'unchanged';
      result: T;
    };

const auditStore = new AuditStore();

async function appendRequiredAuditEvent(
  client: pg.PoolClient,
  event: AuditEventInput,
): Promise<void> {
  try {
    await auditStore.append(client, event);
  } catch (error) {
    logOperational('STUDIO_AUDIT_APPEND_FAILED', {
      teamId: event.teamId,
      requestId: event.requestId ?? undefined,
    });
    throw error;
  }
}

function actorLabel(context: AuditedCommandContext): string {
  return (context.principal.name.trim() || context.principal.email).slice(
    0,
    320,
  );
}

export function auditActorEventContext(context: LockedAuditedCommandContext) {
  return {
    teamId: context.tenantDb.teamId,
    teamLabel: context.teamLabel,
    actorKind: 'user',
    actorId: context.principal.userId,
    actorLabel: actorLabel(context),
    requestId: context.requestId,
  } as const;
}

export function auditEventContext(context: LockedAuditedCommandContext) {
  return {
    ...auditActorEventContext(context),
    eventVersion: 1,
    category: 'team_access',
    outcome: 'succeeded',
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

export function failedAuditEventContext(context: LockedAuditedCommandContext) {
  return {
    ...auditEventContext(context),
    outcome: 'failed',
  } as const;
}

function assertEventContext(
  context: LockedAuditedCommandContext,
  event: AuditEventInput,
  decisionStatus: 'succeeded' | 'denied' | 'failed',
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

async function runWithLockedAuditContext<T>(
  context: AuditedCommandContext,
  work: (
    client: pg.PoolClient,
    auditContext: LockedAuditedCommandContext,
  ) => Promise<T>,
): Promise<T> {
  return context.tenantDb.transaction(async (client) => {
    await lockAuditTeam(client, context.tenantDb.teamId);
    const team = await client.query<{ name: string }>(
      `SELECT name FROM teams WHERE id = $1 FOR UPDATE`,
      [context.tenantDb.teamId],
    );
    const lockedTeam = team.rows[0];
    if (!lockedTeam) throw new AuditCommandTeamNotFoundError();
    const teamName = lockedTeam.name.trim();
    if (!teamName) throw new Error('audit command team name is empty');
    return work(client, {
      ...context,
      teamLabel: teamName.slice(0, 320),
    });
  });
}

/** Appends a server-owned observation that is not coupled to a domain write. */
export async function appendAuditedEvent(
  context: AuditedCommandContext,
  buildEvent: (context: LockedAuditedCommandContext) => AuditEventInput,
): Promise<void> {
  await runWithLockedAuditContext(context, async (client, auditContext) => {
    const event = buildEvent(auditContext);
    assertEventContext(auditContext, event, event.outcome);
    await appendRequiredAuditEvent(client, event);
  });
}

export type AuditedCommandFailure = {
  error: Error;
  events: readonly [AuditEventInput, ...AuditEventInput[]];
};

type AuditedCommandWorkResult<T> =
  | AuditedMutationResult<T>
  | { status: 'unchanged'; result: T };

/**
 * Runs authorized domain work behind a savepoint. A classified synchronous
 * failure rolls back target locks and mutations acquired after the savepoint,
 * then returns a bounded failed decision for the outer audited transaction to
 * append while its team and authorization locks remain held. Idempotent work
 * may return unchanged after its replay evidence has been checked.
 */
export async function runAuditedCommandWork<T>(
  client: pg.PoolClient,
  work: () => Promise<AuditedCommandWorkResult<T>>,
  classifyFailure: (error: unknown) => AuditedCommandFailure | null,
): Promise<AuditedCommandDecision<T>> {
  await client.query('SAVEPOINT studio_audited_command_work');
  try {
    const result = await work();
    await client.query('RELEASE SAVEPOINT studio_audited_command_work');
    return 'status' in result ? result : { status: 'succeeded', ...result };
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT studio_audited_command_work');
    await client.query('RELEASE SAVEPOINT studio_audited_command_work');
    const failure = classifyFailure(error);
    if (!failure) throw error;
    return { status: 'failed', ...failure };
  }
}

/**
 * Runs a command whose authorization decision is itself auditable. A denied
 * decision appends its event and commits no domain mutation, then throws only
 * after that transaction has committed. An idempotent replay or domain no-op
 * returns unchanged without inventing an event. If a required event cannot be
 * written, the requested action still never commits.
 */
export async function runAuditedCommand<T>(
  context: AuditedCommandContext,
  work: (
    client: pg.PoolClient,
    auditContext: LockedAuditedCommandContext,
  ) => Promise<AuditedCommandDecision<T>>,
): Promise<T> {
  const decision = await runWithLockedAuditContext(
    context,
    async (client, auditContext) => {
      const result = await work(client, auditContext);
      if (result.status === 'unchanged') return result;
      if (result.events.length === 0) {
        throw new Error('an audited command must produce at least one event');
      }
      for (const event of result.events) {
        assertEventContext(auditContext, event, result.status);
        await appendRequiredAuditEvent(client, event);
      }
      return result;
    },
  );

  if (decision.status === 'denied' || decision.status === 'failed') {
    throw decision.error;
  }
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
