import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { parseAuditEventInput, type AuditEventInput } from './events.ts';

// A stable namespace seed keeps this lock separate from the schema/bootstrap
// locks. A hash collision only causes harmless extra serialization; the
// unique team/sequence index remains the correctness backstop.
export const AUDIT_SEQUENCE_LOCK_SEED = 4_021_775_688_147_131n;

/**
 * Serializes every audited command for one team before it reads or mutates
 * domain state. Append calls this too so direct store callers retain safe
 * sequence allocation; transaction-scoped advisory locks are re-entrant.
 */
export async function lockAuditTeam(
  client: pg.PoolClient,
  teamId: string,
): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, $2::bigint))`,
    [teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
  );
}

export type AuditEvent = AuditEventInput & {
  id: string;
  sequence: string;
  occurredAt: Date;
};

type AuditEventRow = {
  id: string;
  teamId: string;
  teamLabel: string;
  sequence: string;
  occurredAt: Date;
  eventType: AuditEventInput['eventType'];
  eventVersion: 1;
  category: 'team_access';
  outcome: 'succeeded' | 'denied';
  actorKind: 'user';
  actorId: string;
  actorLabel: string;
  subjectType: 'team_member' | 'team_invitation';
  subjectId: string;
  subjectLabel: string;
  resourceType: null;
  resourceId: null;
  resourceLabel: null;
  requestId: string;
  details: AuditEventInput['details'];
};

function storedEvent(row: AuditEventRow): AuditEvent {
  const { id, sequence, occurredAt, ...input } = row;
  return {
    ...parseAuditEventInput(input),
    id,
    sequence,
    occurredAt,
  };
}

export class AuditStore {
  async append(
    client: pg.PoolClient,
    unvalidatedEvent: AuditEventInput,
  ): Promise<AuditEvent> {
    const event = parseAuditEventInput(unvalidatedEvent);
    await lockAuditTeam(client, event.teamId);
    const previous = await client.query<{ sequence: string }>(
      `SELECT COALESCE(MAX(sequence), 0)::text AS sequence
       FROM audit_events
       WHERE team_id = $1`,
      [event.teamId],
    );
    const sequence = (
      BigInt(previous.rows[0]?.sequence ?? '0') + 1n
    ).toString();
    const inserted = await client.query<AuditEventRow>(
      `INSERT INTO audit_events (
         id, team_id, team_label, sequence, event_type, event_version, category, outcome,
         actor_kind, actor_id, actor_label, subject_type, subject_id,
         subject_label, resource_type, resource_id, resource_label,
         request_id, details
       ) VALUES (
         $1, $2, $3, $4::bigint, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18::uuid, $19::jsonb
       )
       RETURNING
         id, team_id AS "teamId", team_label AS "teamLabel", sequence::text AS sequence,
         occurred_at AS "occurredAt", event_type AS "eventType",
         event_version AS "eventVersion", category, outcome,
         actor_kind AS "actorKind", actor_id AS "actorId",
         actor_label AS "actorLabel", subject_type AS "subjectType",
         subject_id AS "subjectId", subject_label AS "subjectLabel",
         resource_type AS "resourceType", resource_id AS "resourceId",
         resource_label AS "resourceLabel", request_id AS "requestId", details`,
      [
        randomUUID(),
        event.teamId,
        event.teamLabel,
        sequence,
        event.eventType,
        event.eventVersion,
        event.category,
        event.outcome,
        event.actorKind,
        event.actorId,
        event.actorLabel,
        event.subjectType,
        event.subjectId,
        event.subjectLabel,
        event.resourceType,
        event.resourceId,
        event.resourceLabel,
        event.requestId,
        JSON.stringify(event.details),
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('audit insert returned no row');
    return storedEvent(row);
  }

  async listForTeam(
    client: pg.PoolClient,
    teamId: string,
    options: { beforeSequence?: string; limit?: number } = {},
  ): Promise<AuditEvent[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const rows = await client.query<AuditEventRow>(
      `SELECT
         id, team_id AS "teamId", team_label AS "teamLabel", sequence::text AS sequence,
         occurred_at AS "occurredAt", event_type AS "eventType",
         event_version AS "eventVersion", category, outcome,
         actor_kind AS "actorKind", actor_id AS "actorId",
         actor_label AS "actorLabel", subject_type AS "subjectType",
         subject_id AS "subjectId", subject_label AS "subjectLabel",
         resource_type AS "resourceType", resource_id AS "resourceId",
         resource_label AS "resourceLabel", request_id AS "requestId", details
       FROM audit_events
       WHERE team_id = $1
         AND ($2::bigint IS NULL OR sequence < $2::bigint)
       ORDER BY sequence DESC
       LIMIT $3`,
      [teamId, options.beforeSequence ?? null, limit],
    );
    return rows.rows.map(storedEvent);
  }
}
