import { randomUUID } from 'node:crypto';

import { and, desc, eq, gte, inArray, isNull, lt, max } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { type Statement, type SqlError } from 'effect/unstable/sql';

import { AuditActorKind } from '@codaco/studio-contract/schema/audit';
import { NotFound } from '@codaco/studio-contract/schema/errors';
import type { AuditActorFilter } from '@codaco/studio-rpc';

import { teams as teamsTable } from '../db/auth-schema.ts';
import { sqlErrorsOnly, sqlErrorsOnlyBeside } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { parseAuditEventInput, type AuditEventInput } from './events.ts';
import { AUDIT_TABLES } from './schema.ts';

const auditEvents = AUDIT_TABLES.auditEvents;

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
 *
 * Raw rather than built: `select pg_advisory_xact_lock(…)` has no FROM clause,
 * which the builder has no way to express.
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

/**
 * The team's name as the event will record it, read under `FOR UPDATE`.
 *
 * The lock is what makes the label mean something: an event says what the team
 * was called at the moment the command took it, so a rename committing while
 * the command runs must not change the record. Both writers of audit events
 * read it here — `audited`, for a request's command, and the denied-attempts
 * summary, for the worker's — so neither can label a row differently from the
 * other.
 *
 * Fails with `NotFound` when the team is gone: an access token can outlive the
 * team it names, and a row appended for a team that no longer exists would be
 * a record of nothing.
 */
export const lockedTeamLabel: (
  teamId: string,
) => Effect.Effect<string, NotFound | SqlError.SqlError, Transaction> =
  Effect.fn('audit.store.lockedTeamLabel')(function* (teamId: string) {
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
      // The schema's own `teams_name_nonblank_check` forbids this, so a blank
      // name here is a database that stopped enforcing its own constraint.
      return yield* Effect.die(new Error('audit command team name is empty'));
    }
    return label.slice(0, 320);
  }, sqlErrorsOnlyBeside);

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

type AuditEventRow = typeof auditEvents.$inferSelect;

// `details` is a `jsonb` column, which the builder hands back as `unknown`:
// whatever the row holds, nothing has checked it. The table's
// `audit_events_details_object_check` is what makes this decode total, and a
// row that failed it could not have been committed — so a value that does not
// decode is a defect, not a failure a caller could act on.
const AuditDetails = Schema.Record(Schema.String, Schema.Unknown);
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

// `sequence` is a bigint on the wire to nobody: it is a per-team counter the
// clients display and page on, never do arithmetic with, so it leaves this
// module as a base-10 string exactly as `sequence::text` used to render it.
function storedRow(row: AuditEventRow): StoredAuditEvent {
  return {
    ...row,
    sequence: row.sequence.toString(),
    details: decodeDetails(row.details),
  };
}

export function clampAuditListLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

/**
 * The rows of a raw statement, decoded through a schema — the one place in
 * this module where a hand-written statement's result becomes typed data.
 * A statement the builder cannot express still answers with `unknown` columns,
 * and naming the shape in a type would only assert it; `schema` checks it.
 */
export const rowsOf = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  statement: Statement.Statement<object>,
): Effect.Effect<ReadonlyArray<S['Type']>, SqlError.SqlError> => {
  const decode = Schema.decodeUnknownSync(schema);
  return Effect.map(statement, (rows) => rows.map((row) => decode(row)));
};

/**
 * `occurredAt` defaults to the statement's own time, which is what a live
 * command wants — the column's own `statement_timestamp()` default, reached by
 * leaving it out of the insert. A writer that is recording an operation that
 * happened at a known moment — the synthetic-data seed, whose whole corpus is
 * dated from one anchor — passes it, so the log agrees with the rows it
 * describes.
 */
export const append: (
  event: AuditEventInput,
  options?: { occurredAt?: Date },
) => Effect.Effect<AuditEvent, SqlError.SqlError, Transaction> = Effect.fn(
  'audit.store.append',
)(function* (
  unvalidatedEvent: AuditEventInput,
  options?: { occurredAt?: Date },
) {
  const event = parseAuditEventInput(unvalidatedEvent);
  const { tx } = yield* Transaction;
  yield* lockTeam(event.teamId);
  const [previous] = yield* tx
    .select({ sequence: max(auditEvents.sequence) })
    .from(auditEvents)
    .where(eq(auditEvents.teamId, event.teamId));
  // `max` of no rows is one row carrying null, which is the `COALESCE(…, 0)`
  // this replaced: a team's first event is sequence 1.
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
    // Actor identity is the (kind, id) pair the feed renders, and a system
    // actor may legitimately have no id. `actor_id = NULL` would silently
    // match nothing under three-valued logic, so the absent id becomes an
    // explicit IS NULL — which the (team_id, actor_id, sequence DESC) index
    // serves directly.
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
  label: Schema.String,
});

/**
 * The distinct action and actor values in one team's whole history, for the
 * activity screen's filters.
 *
 * Both are loose index scans (the recursive "skip scan") over the existing
 * (team_id, event_type, sequence DESC NULLS LAST) and
 * (team_id, actor_id, sequence DESC NULLS LAST) indexes, so the work is
 * proportional to the number of distinct values rather than to the number of
 * events, and `LIMIT $2` on the walk itself stops the recursion rather than
 * only shortening its result. `WITH RECURSIVE` is the reason these two are the
 * only statements here the builder does not write: it has no path to one.
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
  // The label comes from each actor's newest event, so a renamed user is
  // offered under the name the newest row already shows in the feed.
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
