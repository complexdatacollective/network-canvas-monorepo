import { randomUUID } from 'node:crypto';

import { and, desc, eq, gte, inArray, isNull, lt, max } from 'drizzle-orm';
import { Effect, Redacted, Schema } from 'effect';
import { type Statement, type SqlError } from 'effect/sql';

import { AuditActorKind } from '@codaco/studio-contract/schema/audit';
import type { AuditActorFilter } from '@codaco/studio-contract/schema/audit';
import { NotFound } from '@codaco/studio-contract/schema/errors';
import { PrivateString } from '@codaco/studio-contract/schema/primitives';

import { teams as teamsTable } from '../db/auth-schema.ts';
import { sqlErrorsOnly, sqlErrorsOnlyBeside } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import {
  encodeAuditEventInput,
  parseAuditEventInput,
  type AuditEventInput,
} from './events.ts';
import { AUDIT_TABLES } from './schema.ts';

const auditEvents = AUDIT_TABLES.auditEvents;

export const AUDIT_SEQUENCE_LOCK_SEED = 4_021_775_688_147_131n;

export const AUDIT_TEAM_LOCK_KEY_SQL = `hashtextextended(current_schema() || '/' || $1, $2::bigint)`;

/**
 * The key names the schema as well as the team: advisory locks are
 * database-wide, and the suites provision the schema many times in one database.
 */
export const lockTeam: (
  teamId: string,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'audit.store.lockTeam',
)(function* (teamId: string) {
  const { sql } = yield* Transaction;
  yield* sql.unsafe(
    `SELECT pg_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL})`,
    [teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
  );
});

export const lockedTeamLabel: (
  teamId: string,
) => Effect.Effect<
  Redacted.Redacted,
  NotFound | SqlError.SqlError,
  Transaction
> = Effect.fn('audit.store.lockedTeamLabel')(function* (teamId: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ name: teamsTable.name })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId))
    .for('update');
  const team = rows[0];
  if (team === undefined) {
    return yield* new NotFound({ detail: 'team not found' });
  }
  const label = team.name.trim();
  if (label.length === 0) {
    return yield* Effect.die(new Error('audit command team name is empty'));
  }
  return Redacted.make(label.slice(0, 320));
}, sqlErrorsOnlyBeside);

export type AuditEvent = AuditEventInput & {
  id: string;
  sequence: string;
  occurredAt: Date;
};

// Read without registry validation: a newer server may have appended an
// (event_type, event_version) pair this build does not register.
export type StoredAuditEvent = {
  id: string;
  teamId: string;
  teamLabel: Redacted.Redacted;
  sequence: string;
  occurredAt: Date;
  eventType: string;
  eventVersion: number;
  category: string;
  outcome: string;
  actorKind: string;
  actorId: string | null;
  actorLabel: Redacted.Redacted;
  subjectType: string | null;
  subjectId: string | null;
  subjectLabel: Redacted.Redacted | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceLabel: Redacted.Redacted | null;
  requestId: string;
  details: Redacted.Redacted<Record<string, unknown>>;
};

export type AuditListFilters = {
  categories?: readonly string[];
  eventTypes?: readonly string[];
  actor?: AuditActorFilter;
  outcomes?: readonly string[];
  /**
   * Half-open: `occurred_at` keeps microseconds, so an inclusive `Date` bound
   * cannot name the last instant of a period.
   */
  occurredFrom?: Date;
  occurredTo?: Date;
};

export type AuditFacets = {
  eventTypes: string[];
  actors: (AuditActorFilter & { label: Redacted.Redacted })[];
  truncated: boolean;
};

type AuditEventRow = typeof auditEvents.$inferSelect;

const AuditDetails = Schema.RedactedFromValue(
  Schema.Record(Schema.String, Schema.Unknown),
);
const decodeDetails = Schema.decodeUnknownSync(AuditDetails);

function storedEvent(row: AuditEventRow): AuditEvent {
  const { id, sequence, occurredAt, ...input } = row;
  return {
    ...parseAuditEventInput(input),
    id,
    sequence: sequence.toString(),
    occurredAt,
  };
}

const privateLabel = (label: string | null) =>
  label === null ? null : Redacted.make(label);

function storedRow(row: AuditEventRow): StoredAuditEvent {
  return {
    ...row,
    teamLabel: Redacted.make(row.teamLabel),
    actorLabel: Redacted.make(row.actorLabel),
    subjectLabel: privateLabel(row.subjectLabel),
    resourceLabel: privateLabel(row.resourceLabel),
    sequence: row.sequence.toString(),
    details: decodeDetails(row.details),
  };
}

export function clampAuditListLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

export const rowsOf = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  statement: Statement.Statement<object>,
): Effect.Effect<ReadonlyArray<S['Type']>, SqlError.SqlError> => {
  const decode = Schema.decodeUnknownSync(schema);
  return Effect.map(statement, (rows) => rows.map((row) => decode(row)));
};

export const append: (
  event: AuditEventInput,
  options?: { occurredAt?: Date },
) => Effect.Effect<AuditEvent, SqlError.SqlError, Transaction> = Effect.fn(
  'audit.store.append',
)(function* (
  unvalidatedEvent: AuditEventInput,
  options?: { occurredAt?: Date },
) {
  const event = encodeAuditEventInput(unvalidatedEvent);
  const { tx } = yield* Transaction;
  yield* lockTeam(event.teamId);
  const [previous] = yield* tx
    .select({ sequence: max(auditEvents.sequence) })
    .from(auditEvents)
    .where(eq(auditEvents.teamId, event.teamId));
  const sequence = (previous?.sequence ?? 0n) + 1n;
  // `.returning()` is not decoration: a write without it answers with the
  // driver's own result object, which is typed as a row array and is not one.
  const [row] = yield* tx
    .insert(auditEvents)
    .values({
      id: randomUUID(),
      teamId: event.teamId,
      teamLabel: event.teamLabel,
      sequence,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      category: event.category,
      outcome: event.outcome,
      actorKind: event.actorKind,
      actorId: event.actorId,
      actorLabel: event.actorLabel,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      subjectLabel: event.subjectLabel,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      resourceLabel: event.resourceLabel,
      requestId: event.requestId,
      details: event.details,
      ...(options?.occurredAt === undefined
        ? {}
        : { occurredAt: options.occurredAt }),
    })
    .returning();
  if (!row) {
    return yield* Effect.die(new Error('audit insert returned no row'));
  }
  return storedEvent(row);
}, sqlErrorsOnly);

export const list: (
  teamId: string,
  options?: {
    beforeSequence?: string;
    limit?: number;
  } & AuditListFilters,
) => Effect.Effect<StoredAuditEvent[], SqlError.SqlError, Transaction> =
  Effect.fn('audit.store.list')(function* (
    teamId: string,
    options: {
      beforeSequence?: string;
      limit?: number;
    } & AuditListFilters = {},
  ) {
    const { tx } = yield* Transaction;
    const limit = clampAuditListLimit(options.limit);
    const filters = [eq(auditEvents.teamId, teamId)];
    if (options.beforeSequence !== undefined) {
      filters.push(lt(auditEvents.sequence, BigInt(options.beforeSequence)));
    }
    if (options.categories?.length) {
      filters.push(inArray(auditEvents.category, [...options.categories]));
    }
    if (options.eventTypes?.length) {
      filters.push(inArray(auditEvents.eventType, [...options.eventTypes]));
    }
    const actor = options.actor;
    if (actor !== undefined) {
      filters.push(eq(auditEvents.actorKind, actor.kind));
      filters.push(
        actor.id === null
          ? isNull(auditEvents.actorId)
          : eq(auditEvents.actorId, actor.id),
      );
    }
    if (options.outcomes?.length) {
      filters.push(inArray(auditEvents.outcome, [...options.outcomes]));
    }
    if (options.occurredFrom) {
      filters.push(gte(auditEvents.occurredAt, options.occurredFrom));
    }
    if (options.occurredTo) {
      filters.push(lt(auditEvents.occurredAt, options.occurredTo));
    }
    const rows = yield* tx
      .select()
      .from(auditEvents)
      .where(and(...filters))
      .orderBy(desc(auditEvents.sequence))
      .limit(limit);
    return rows.map(storedRow);
  }, sqlErrorsOnly);

const FacetEventType = Schema.Struct({ eventType: Schema.String });

const FacetActor = Schema.Struct({
  kind: AuditActorKind,
  id: Schema.NullOr(Schema.String),
  label: PrivateString,
});

/**
 * Each step's ORDER BY must spell out `sequence DESC NULLS LAST` to match the
 * index; plain `DESC` means NULLS FIRST, which the index cannot serve.
 */
export const facets: (
  teamId: string,
  limit: number,
) => Effect.Effect<AuditFacets, SqlError.SqlError, Transaction> = Effect.fn(
  'audit.store.facets',
)(function* (teamId: string, limit: number) {
  const { sql } = yield* Transaction;
  const eventTypes = yield* rowsOf(
    FacetEventType,
    sql.unsafe(
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
    ),
  );
  const actors = yield* rowsOf(
    FacetActor,
    sql.unsafe(
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
    ),
  );
  const truncated = eventTypes.length > limit || actors.length > limit;
  return {
    eventTypes: eventTypes.slice(0, limit).map((row) => row.eventType),
    actors: actors.slice(0, limit),
    truncated,
  };
});

export const get: (
  teamId: string,
  eventId: string,
) => Effect.Effect<StoredAuditEvent | null, SqlError.SqlError, Transaction> =
  Effect.fn('audit.store.get')(function* (teamId: string, eventId: string) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.teamId, teamId), eq(auditEvents.id, eventId)));
    const row = rows[0];
    return row === undefined ? null : storedRow(row);
  }, sqlErrorsOnly);
