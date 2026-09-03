import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { AuditActorFilter } from '@codaco/studio-rpc';

import { parseAuditEventInput, type AuditEventInput } from './events.ts';

// A stable namespace seed keeps this lock separate from the schema/bootstrap
// locks. A hash collision only causes harmless extra serialization; the
// unique team/sequence index remains the correctness backstop.
export const AUDIT_SEQUENCE_LOCK_SEED = 4_021_775_688_147_131n;

/**
 * The lock key as SQL over `$1` (the team id) and `$2` (the seed), so a test
 * contending for or holding the lock computes exactly the key the store does.
 */
export const AUDIT_TEAM_LOCK_KEY_SQL = `hashtextextended(current_schema() || '/' || $1, $2::bigint)`;

/**
 * Serializes every audited command for one team before it reads or mutates
 * domain state. Append calls this too so direct store callers retain safe
 * sequence allocation; transaction-scoped advisory locks are re-entrant.
 *
 * The key names the schema as well as the team. Advisory locks are
 * database-wide, and the lock guards one `audit_events` table's sequence, so
 * the schema that table lives in belongs in the key: the integration suites
 * provision the schema many times over in one database, and the seed writes
 * the same deterministic team ids into every copy inside one long
 * transaction — keyed on the team alone, every concurrent seed queued behind
 * whichever held the lock, for the length of its whole transaction. A
 * deployment has one schema, where the two keys are the same lock.
 */
export async function lockAuditTeam(
  client: pg.PoolClient,
  teamId: string,
): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL})`,
    [teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
  );
}

export type AuditEvent = AuditEventInput & {
  id: string;
  sequence: string;
  occurredAt: Date;
};

// A stored row read back without registry validation. Reads must tolerate a
// (event_type, event_version) pair this build does not register — a row
// appended by a newer server — so interpretation belongs to the renderer,
// which falls back to a safe generic presentation for unknown pairs.
export type StoredAuditEvent = {
  id: string;
  teamId: string;
  teamLabel: string;
  sequence: string;
  occurredAt: Date;
  eventType: string;
  eventVersion: number;
  category: string;
  outcome: string;
  actorKind: string;
  actorId: string | null;
  actorLabel: string;
  subjectType: string | null;
  subjectId: string | null;
  subjectLabel: string | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceLabel: string | null;
  requestId: string;
  details: Record<string, unknown>;
};

export type AuditListFilters = {
  categories?: readonly string[];
  eventTypes?: readonly string[];
  actor?: AuditActorFilter;
  outcomes?: readonly string[];
  /**
   * A half-open instant window, `occurredFrom <= occurred_at < occurredTo`.
   *
   * `occurred_at` is `statement_timestamp()`, which Postgres keeps to
   * microseconds, so an inclusive upper bound cannot name the last instant of
   * a period: a `Date` only reaches milliseconds, and every event in the 999
   * microseconds after the bound would fall outside a window that was supposed
   * to contain them. Callers name the start of the next period instead.
   */
  occurredFrom?: Date;
  occurredTo?: Date;
};

/** One selectable value for the activity screen's filters. */
export type AuditFacets = {
  eventTypes: string[];
  actors: (AuditActorFilter & { label: string })[];
  truncated: boolean;
};

const STORED_EVENT_COLUMNS = `
  id, team_id AS "teamId", team_label AS "teamLabel", sequence::text AS sequence,
  occurred_at AS "occurredAt", event_type AS "eventType",
  event_version AS "eventVersion", category, outcome,
  actor_kind AS "actorKind", actor_id AS "actorId",
  actor_label AS "actorLabel", subject_type AS "subjectType",
  subject_id AS "subjectId", subject_label AS "subjectLabel",
  resource_type AS "resourceType", resource_id AS "resourceId",
  resource_label AS "resourceLabel", request_id AS "requestId", details`;

type AuditEventRow = {
  id: string;
  teamId: string;
  teamLabel: string;
  sequence: string;
  occurredAt: Date;
  eventType: AuditEventInput['eventType'];
  eventVersion: AuditEventInput['eventVersion'];
  category: AuditEventInput['category'];
  outcome: AuditEventInput['outcome'];
  actorKind: AuditEventInput['actorKind'];
  actorId: AuditEventInput['actorId'];
  actorLabel: AuditEventInput['actorLabel'];
  subjectType: AuditEventInput['subjectType'];
  subjectId: AuditEventInput['subjectId'];
  subjectLabel: AuditEventInput['subjectLabel'];
  resourceType: AuditEventInput['resourceType'];
  resourceId: AuditEventInput['resourceId'];
  resourceLabel: AuditEventInput['resourceLabel'];
  requestId: AuditEventInput['requestId'];
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

export function clampAuditListLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

export class AuditStore {
  /**
   * `occurredAt` defaults to the statement's own time, which is what a live
   * command wants. A writer that is recording an operation that happened at
   * a known moment — the synthetic-data seed, whose whole corpus is dated
   * from one anchor — passes it, so the log agrees with the rows it describes.
   */
  async append(
    client: pg.PoolClient,
    unvalidatedEvent: AuditEventInput,
    options: { occurredAt?: Date } = {},
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
         request_id, details, occurred_at
       ) VALUES (
         $1, $2, $3, $4::bigint, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18::uuid, $19::jsonb,
         COALESCE($20, statement_timestamp())
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
        options.occurredAt ?? null,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('audit insert returned no row');
    return storedEvent(row);
  }

  async listForTeam(
    client: pg.PoolClient,
    teamId: string,
    options: {
      beforeSequence?: string;
      limit?: number;
    } & AuditListFilters = {},
  ): Promise<StoredAuditEvent[]> {
    const limit = clampAuditListLimit(options.limit);
    const params: unknown[] = [teamId, options.beforeSequence ?? null];
    const clauses: string[] = [];
    const where = (value: unknown, clause: (param: string) => string) => {
      params.push(value);
      clauses.push(`AND ${clause(`$${params.length}`)}`);
    };
    if (options.categories?.length) {
      where(options.categories, (p) => `category = ANY(${p})`);
    }
    if (options.eventTypes?.length) {
      where(options.eventTypes, (p) => `event_type = ANY(${p})`);
    }
    // Actor identity is the (kind, id) pair the feed renders, and a system
    // actor may legitimately have no id. `actor_id = NULL` would silently
    // match nothing under three-valued logic, so the absent id becomes an
    // explicit IS NULL — which the (team_id, actor_id, sequence DESC) index
    // serves directly.
    const actor = options.actor;
    if (actor !== undefined) {
      where(actor.kind, (p) => `actor_kind = ${p}`);
      if (actor.id === null) clauses.push('AND actor_id IS NULL');
      else where(actor.id, (p) => `actor_id = ${p}`);
    }
    if (options.outcomes?.length) {
      where(options.outcomes, (p) => `outcome = ANY(${p})`);
    }
    if (options.occurredFrom) {
      where(options.occurredFrom, (p) => `occurred_at >= ${p}`);
    }
    if (options.occurredTo) {
      where(options.occurredTo, (p) => `occurred_at < ${p}`);
    }
    params.push(limit);
    const rows = await client.query<StoredAuditEvent>(
      `SELECT ${STORED_EVENT_COLUMNS}
       FROM audit_events
       WHERE team_id = $1
         AND ($2::bigint IS NULL OR sequence < $2::bigint)
         ${clauses.join('\n         ')}
       ORDER BY sequence DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.rows;
  }

  /**
   * The distinct action and actor values in one team's whole history, for the
   * activity screen's filters.
   *
   * Both are loose index scans (the recursive "skip scan") over the existing
   * (team_id, event_type, sequence DESC NULLS LAST) and
   * (team_id, actor_id, sequence DESC NULLS LAST) indexes, so the work is
   * proportional to the number of distinct values rather than to the number of
   * events, and `LIMIT $2` on the walk itself stops the recursion rather than
   * only shortening its result.
   *
   * Two details make the plan hold:
   *
   * - Each step's ORDER BY must spell out `sequence DESC NULLS LAST`, matching
   *   the index exactly. Plain `DESC` means NULLS FIRST, which the index
   *   cannot serve, and Postgres falls back to an incremental sort that reads
   *   every row of the actor's group: measured at 400k events in one team,
   *   1.4ms/290 buffers with the qualifier against 575ms/405k buffers without.
   * - Because the index carries sequence DESC beside the id, that one row is
   *   already the actor's newest event, so the walk carries the label out with
   *   it. A separate "newest row for this actor" lookup per actor cannot use
   *   the same index for both the match and the ordering, and cost 184ms/24.5k
   *   buffers on the same data.
   *
   * `actor_id IS NULL` sorts after every id under NULLS LAST and is therefore
   * unreachable from the ascending walk, so the single null-actor entry — the
   * system actor the actor_id CHECK exists for — is read separately.
   */
  async facetsForTeam(
    client: pg.PoolClient,
    teamId: string,
    limit: number,
  ): Promise<AuditFacets> {
    const eventTypes = await client.query<{ eventType: string }>(
      `WITH RECURSIVE walk AS (
         (SELECT event_type FROM audit_events
          WHERE team_id = $1
          ORDER BY event_type LIMIT 1)
         UNION ALL
         SELECT next.event_type
         FROM walk
         CROSS JOIN LATERAL (
           SELECT e.event_type FROM audit_events e
           WHERE e.team_id = $1 AND e.event_type > walk.event_type
           ORDER BY e.event_type LIMIT 1
         ) AS next
       )
       SELECT event_type AS "eventType"
       FROM (SELECT event_type FROM walk LIMIT $2) AS types
       ORDER BY event_type`,
      [teamId, limit + 1],
    );
    const actors = await client.query<{
      kind: AuditActorFilter['kind'];
      id: string | null;
      label: string;
    }>(
      `WITH RECURSIVE walk AS (
         (SELECT actor_kind, actor_id, actor_label FROM audit_events
          WHERE team_id = $1 AND actor_id IS NOT NULL
          ORDER BY actor_id, sequence DESC NULLS LAST LIMIT 1)
         UNION ALL
         SELECT next.actor_kind, next.actor_id, next.actor_label
         FROM walk
         CROSS JOIN LATERAL (
           SELECT e.actor_kind, e.actor_id, e.actor_label FROM audit_events e
           WHERE e.team_id = $1 AND e.actor_id > walk.actor_id
           ORDER BY e.actor_id, e.sequence DESC NULLS LAST LIMIT 1
         ) AS next
       )
       SELECT kind, id, label FROM (
         (SELECT actor_kind AS kind, actor_id AS id, actor_label AS label
          FROM walk LIMIT $2)
         UNION ALL
         (SELECT actor_kind, actor_id, actor_label FROM audit_events
          WHERE team_id = $1 AND actor_id IS NULL
          ORDER BY actor_id, sequence DESC NULLS LAST LIMIT 1)
       ) AS actors
       ORDER BY label`,
      [teamId, limit + 1],
    );
    // The label comes from each actor's newest event, so a renamed user is
    // offered under the name the newest row already shows in the feed.
    const truncated =
      eventTypes.rows.length > limit || actors.rows.length > limit;
    return {
      eventTypes: eventTypes.rows.slice(0, limit).map((row) => row.eventType),
      actors: actors.rows.slice(0, limit),
      truncated,
    };
  }

  async getForTeam(
    client: pg.PoolClient,
    teamId: string,
    eventId: string,
  ): Promise<StoredAuditEvent | null> {
    const rows = await client.query<StoredAuditEvent>(
      `SELECT ${STORED_EVENT_COLUMNS}
       FROM audit_events
       WHERE team_id = $1 AND id = $2::uuid`,
      [teamId, eventId],
    );
    return rows.rows[0] ?? null;
  }
}
