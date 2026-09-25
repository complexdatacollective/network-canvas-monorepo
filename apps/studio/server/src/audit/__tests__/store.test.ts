import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Cause, Effect, Predicate, Result, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { AuditListInput } from '@codaco/studio-contract/schema/audit';
import { TEAM_GUC } from '@codaco/studio-sync/rls';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
  maintenanceRows,
  tenantRows,
} from '../../__tests__/support/database.ts';
import { Database } from '../../db/client.ts';
import { sqlState } from '../../db/errors.ts';
import {
  MaintenanceScope,
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';
import type { AuditEventInput } from '../events.ts';
import {
  append,
  AUDIT_SEQUENCE_LOCK_SEED,
  AUDIT_TEAM_LOCK_KEY_SQL,
  facets,
  get,
  list,
  lockTeam,
  rowsOf,
} from '../store.ts';

// The schema audit.list actually validates its payload with, decoded exactly
// as the rpc server decodes it rather than through a second copy of the bound:
// what the wire rejects is the whole point of the assertion below.
const decodeAuditListInput = Schema.decodeUnknownResult(AuditListInput);

function auditListInputIssues(input: unknown) {
  const result = decodeAuditListInput(input);
  return Result.isFailure(result) ? [result.failure] : [];
}

/**
 * The store takes tenancy from the open transaction, so every case names its
 * team by opening a scope. The membership these stand in for is proved by the
 * commands in production; a store suite has no command to prove it.
 */
const access = (teamId: string) => unsafeMakeTeamAccess(teamId, 'owner');

/**
 * One transaction as the connecting login, carrying the `Transaction` service
 * the store requires. There is no `OwnerScope` — the owner is not a tenant
 * identity — so the cases that need the store on the owner's own connection
 * (the sequence allocator reading across teams, the cross-team oracle) open it
 * here, pinning the same search path `TestDatabase.onOwner` does.
 */
const ownerScope = <A, E, R>(
  teamId: string | null,
  body: Effect.Effect<A, E, R>,
) =>
  Effect.flatMap(TestDatabase, ({ owner, schema }) =>
    owner.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* owner.sql.unsafe(`set local search_path to ${schema}`);
        if (teamId !== null) {
          yield* owner.sql`select set_config(${TEAM_GUC}, ${teamId}, true)`;
        }
        return yield* body;
      }).pipe(
        Effect.provideService(
          Transaction,
          Transaction.of({ tx, sql: owner.sql, teamId }),
        ),
      ),
    ),
  );

/**
 * The SQLSTATE a refused statement carried, or the literal `'no failure'` when
 * it was not refused at all — so a case that stops refusing fails on the value
 * rather than passing vacuously.
 */
const stateOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.result(effect), (result) =>
    Result.isFailure(result) ? sqlState(result.failure) : 'no failure',
  );

/**
 * Every message down a failure's cause chain, joined. A trigger's own words
 * reach us as the driver's message, which both `SqlError` and drizzle's
 * wrapper replace with their own — so the top message alone would never name
 * the trigger that refused.
 */
function messagesOf(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 32; depth += 1) {
    if (!Predicate.isObject(current)) break;
    if (Cause.isCause(current)) {
      current = Cause.squash(current);
      continue;
    }
    if ('message' in current && Predicate.isString(current.message)) {
      parts.push(current.message);
    }
    if (!('cause' in current)) break;
    current = current.cause;
  }
  return parts.join('\n');
}

const failureOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.result(effect), (result) =>
    Result.isFailure(result) ? messagesOf(result.failure) : 'no failure',
  );

function invitationEvent(teamId: string): AuditEventInput {
  return {
    teamId,
    teamLabel: teamId,
    eventType: 'team.invitation.created',
    eventVersion: 1,
    category: 'team_access',
    outcome: 'succeeded',
    actorKind: 'user',
    actorId: 'actor',
    actorLabel: 'Audit actor',
    subjectType: 'team_invitation',
    subjectId: randomUUID(),
    subjectLabel: 'invitee@example.com',
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
    requestId: randomUUID(),
    details: { role: 'member' },
  };
}

/**
 * A row placed exactly where a test needs it, which `append` cannot do:
 * `occurred_at` defaults to the insert's own clock, and `event_type` is
 * confined to what this build registers. `at` plus `offset` names an instant
 * to the microsecond — an interval literal rather than a float, so the value
 * stored is the one written. Runs on the owner's connection: the point is to
 * write what no producer in this build can.
 */
const insertRawEvent = (
  teamId: string,
  sequence: number,
  row: { eventType?: string; at?: Date; offset?: string },
) =>
  Effect.flatMap(TestDatabase, (harness) =>
    harness.onOwner(
      harness.owner.sql.unsafe(
        `INSERT INTO audit_events (
           id, team_id, team_label, sequence, occurred_at, event_type,
           event_version, category, outcome, actor_kind, actor_id, actor_label,
           request_id, details)
         VALUES (gen_random_uuid(), $1, $1, $2,
                 COALESCE($3::timestamptz, statement_timestamp()) + $4::interval,
                 $5, 1, 'audit', 'succeeded', 'system', NULL, 'Studio',
                 gen_random_uuid(), '{}'::jsonb)`,
        [
          teamId,
          sequence,
          row.at ?? null,
          row.offset ?? '0 microseconds',
          row.eventType ?? 'audit.system_retention',
        ],
      ),
    ),
  );

describe.skipIf(!testDb)('immutable audit store', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'over a scratch schema',
    (it) => {
      it.effect(
        'lets runtime roles append and read but not mutate history',
        () =>
          Effect.gen(function* () {
            const team = 'audit-privileges';
            const harness = yield* TestDatabase;

            const first = yield* TenantScope.open(
              access(team),
              append(invitationEvent(team)),
            );
            expect(first.sequence).toBe('1');
            expect(first.teamLabel).toBe(team);

            // The worker appends a team's event under an explicit tenant scope,
            // which is the only state in which it may touch audit_events.
            const second = yield* MaintenanceScope.openTenant(
              access(team),
              append(invitationEvent(team)),
            );
            expect(second.sequence).toBe('2');

            expect(
              yield* TenantScope.open(access(team), list(team)),
            ).toHaveLength(2);

            const privileges = yield* harness.onOwner(
              harness.owner.sql<{
                role: string;
                update: boolean;
                delete: boolean;
                truncate: boolean;
              }>`SELECT role,
                      has_table_privilege(role, 'audit_events', 'UPDATE') AS update,
                      has_table_privilege(role, 'audit_events', 'DELETE') AS delete,
                      has_table_privilege(role, 'audit_events', 'TRUNCATE') AS truncate
               FROM unnest(ARRAY['studio_app', 'studio_maintenance']) AS role
               ORDER BY role`,
            );
            expect([...privileges]).toEqual([
              {
                role: 'studio_app',
                update: false,
                delete: false,
                truncate: false,
              },
              {
                role: 'studio_maintenance',
                update: false,
                delete: false,
                truncate: false,
              },
            ]);

            // Each refusal opens its own scope: the first one aborts the
            // transaction it ran in, so a shared one would report the abort
            // rather than the privilege check for every statement after it.
            const asTenant = (statement: string) =>
              stateOf(tenantRows(team, statement));
            const asMaintenance = (statement: string) =>
              stateOf(maintenanceRows(statement));

            expect(
              yield* asTenant(
                `UPDATE audit_events SET actor_label = 'changed'`,
              ),
            ).toBe('42501');
            expect(yield* asTenant(`DELETE FROM audit_events`)).toBe('42501');
            expect(yield* asTenant(`TRUNCATE audit_events`)).toBe('42501');
            expect(
              yield* asMaintenance(
                `UPDATE audit_events SET actor_label = 'changed'`,
              ),
            ).toBe('42501');
            expect(yield* asMaintenance(`DELETE FROM audit_events`)).toBe(
              '42501',
            );
            expect(yield* asMaintenance(`TRUNCATE audit_events`)).toBe('42501');

            // The connecting login keeps every privilege, so only the trigger
            // stands between it and a rewritten history.
            expect(
              yield* failureOf(
                harness.onOwner(
                  harness.owner
                    .sql`UPDATE audit_events SET actor_label = 'changed'`,
                ),
              ),
            ).toContain('audit events are immutable');
            expect(
              yield* failureOf(
                harness.onOwner(harness.owner.sql`DELETE FROM audit_events`),
              ),
            ).toContain('audit events are immutable');
          }),
      );

      it.effect(
        'enforces application-team RLS and explicit team query predicates',
        () =>
          Effect.gen(function* () {
            yield* TenantScope.open(
              access('audit-a'),
              append(invitationEvent('audit-a')),
            );
            yield* TenantScope.open(
              access('audit-b'),
              append(invitationEvent('audit-b')),
            );

            expect(
              yield* TenantScope.open(access('audit-a'), list('audit-a')),
            ).toHaveLength(1);

            // A read with no team predicate at all, inside team A's scope:
            // the policy, not the predicate, is what hides team B's row.
            const unpredicated = yield* TenantScope.open(
              access('audit-a'),
              Effect.flatMap(
                Transaction,
                ({ sql }) => sql<{ id: string }>`SELECT id FROM audit_events`,
              ),
            );
            expect(unpredicated).toHaveLength(1);

            // A maintenance scope stamps no team, and audit_events has no
            // maintenance escape: it reads nothing and may write nothing.
            expect(yield* MaintenanceScope.open(list('audit-a'))).toHaveLength(
              0,
            );
            expect(
              yield* stateOf(
                MaintenanceScope.open(append(invitationEvent('audit-a'))),
              ),
            ).toBe('42501');

            expect(
              yield* stateOf(
                TenantScope.open(
                  access('audit-a'),
                  append(invitationEvent('audit-b')),
                ),
              ),
            ).toBe('42501');

            // The connecting login is not confined by the policy, so on that
            // connection the explicit team predicate is the only thing that
            // separates the two teams' histories.
            expect(yield* ownerScope(null, list('audit-a'))).toHaveLength(1);
            expect(yield* ownerScope(null, list('audit-b'))).toHaveLength(1);
          }),
      );

      it.effect(
        'records the insertion statement time rather than transaction start',
        () =>
          TenantScope.open(
            access('audit-timestamp'),
            Effect.gen(function* () {
              const { sql } = yield* Transaction;
              // `@effect/sql-pg` decodes `timestamptz` to epoch milliseconds,
              // where drizzle's own column mapper hands back a `Date` — so the
              // instant read through a raw statement is a number, and decoding
              // it says so rather than trusting the driver to keep doing it.
              const started = yield* rowsOf(
                Schema.Struct({ value: Schema.Number }),
                sql`SELECT transaction_timestamp() AS value`,
              );
              yield* sql`SELECT pg_sleep(0.02)`;
              const event = yield* append(invitationEvent('audit-timestamp'));

              const transactionStarted = started[0]?.value;
              expect(event.occurredAt).toBeInstanceOf(Date);
              expect(event.occurredAt.getTime()).toBeGreaterThan(
                transactionStarted ?? Number.POSITIVE_INFINITY,
              );
            }),
          ),
      );

      // The one writer that does not want the statement's own clock: the
      // synthetic-data seed dates its whole corpus from one anchor, so the log
      // agrees with the rows it describes. Left out, the column's
      // `statement_timestamp()` default applies — which is why the two are one
      // case: the option has to be honoured *and* absent has to mean now.
      it.effect(
        'records the instant a writer names, and now when it does not',
        () =>
          Effect.gen(function* () {
            const team = 'audit-anchored';
            const anchor = new Date('2021-06-05T12:34:56.789Z');

            const anchored = yield* TenantScope.open(
              access(team),
              append(invitationEvent(team), { occurredAt: anchor }),
            );
            expect(anchored.occurredAt.toISOString()).toBe(
              anchor.toISOString(),
            );

            const before = Date.now();
            const live = yield* TenantScope.open(
              access(team),
              append(invitationEvent(team)),
            );
            expect(live.occurredAt.getTime()).toBeGreaterThanOrEqual(
              before - 1,
            );

            // Stored, not merely returned: the row reads back the same way.
            const stored = yield* TenantScope.open(access(team), list(team));
            expect(stored.map((row) => row.occurredAt.toISOString())).toContain(
              anchor.toISOString(),
            );
          }),
      );

      it.effect(
        'keeps the unique sequence index and a separate chronological index',
        () =>
          Effect.gen(function* () {
            const harness = yield* TestDatabase;
            const indexes = yield* harness.onOwner(
              harness.owner.sql<{
                indexname: string;
              }>`SELECT indexname FROM pg_indexes
                 WHERE schemaname = current_schema() AND tablename = 'audit_events'`,
            );
            const names = indexes.map(({ indexname }) => indexname);
            expect(names).toContain('audit_events_team_id_sequence_idx');
            expect(names).toContain(
              'audit_events_team_id_occurred_at_sequence_desc_idx',
            );
            expect(names).not.toContain(
              'audit_events_team_id_sequence_desc_idx',
            );
          }),
      );

      it.effect(
        'allocates a complete unique sequence under same-team concurrency',
        () =>
          Effect.gen(function* () {
            if (testDb === null) {
              throw new Error('unreachable: probe guaranteed a database');
            }
            const harness = yield* TestDatabase;
            const team = 'audit-concurrency';

            // The suite's application client holds one connection on purpose,
            // so twelve appends through it would queue on the pool rather than
            // on the team lock. This case is about the lock, so it brings a
            // client that can actually run them at once.
            const inserted = yield* Effect.forEach(
              Array.from({ length: 12 }, (_, index) => index),
              () =>
                TenantScope.open(access(team), append(invitationEvent(team))),
              { concurrency: 'unbounded' },
            ).pipe(
              Effect.provide(
                Database.layer({
                  url: testDb.url,
                  searchPath: harness.schema,
                  maxConnections: 12,
                  applicationName: 'studio-test-audit-concurrency',
                }),
              ),
            );

            expect(
              inserted
                .map(({ sequence }) => BigInt(sequence))
                .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
            ).toEqual(
              Array.from({ length: 12 }, (_, index) => BigInt(index + 1)),
            );
          }),
      );

      it.effect(
        'serializes one team lock without making another team contend',
        () =>
          Effect.gen(function* () {
            const harness = yield* TestDatabase;

            // The contender is a second application client, which keys its own
            // transaction connection: its statements cannot land inside the
            // holder's transaction, which is what makes the answer meaningful.
            const tryLock = (teamId: string) =>
              TenantScope.open(
                access(teamId),
                Effect.flatMap(Transaction, ({ sql }) =>
                  sql.unsafe<{ acquired: boolean }>(
                    `SELECT pg_try_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL}) AS acquired`,
                    [teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
                  ),
                ),
              ).pipe(Effect.provideService(Database, harness.secondApp));

            const contended = yield* TenantScope.open(
              access('audit-lock-a'),
              Effect.gen(function* () {
                yield* lockTeam('audit-lock-a');
                return {
                  sameTeam: yield* tryLock('audit-lock-a'),
                  otherTeam: yield* tryLock('audit-lock-b'),
                };
              }),
            );

            expect([...contended.sameTeam]).toEqual([{ acquired: false }]);
            expect([...contended.otherTeam]).toEqual([{ acquired: true }]);
          }),
      );

      it.effect(
        'allocates from the explicit team even when another team is further ahead',
        () =>
          Effect.gen(function* () {
            for (let index = 0; index < 5; index += 1) {
              yield* ownerScope(
                'audit-predicate-high',
                append(invitationEvent('audit-predicate-high')),
              );
            }
            const first = yield* ownerScope(
              'audit-predicate-low',
              append(invitationEvent('audit-predicate-low')),
            );
            expect(first.sequence).toBe('1');
            const second = yield* ownerScope(
              'audit-predicate-low',
              append(invitationEvent('audit-predicate-low')),
            );
            expect(second.sequence).toBe('2');
          }),
      );

      it.effect(
        'reports every distinct action and actor, and flags a hit cap',
        () =>
          Effect.gen(function* () {
            const team = 'audit-facets';
            const harness = yield* TestDatabase;
            yield* TenantScope.open(
              access(team),
              append(invitationEvent(team)),
            );

            // The one actor shape no producer in this build can append: the
            // CHECK constraint permits a system actor with no id, and the facet
            // scan has to reach it even though the ascending walk over actor_id
            // never can.
            yield* harness.onOwner(
              harness.owner.sql.unsafe(
                `INSERT INTO audit_events (
                   id, team_id, team_label, sequence, event_type, event_version,
                   category, outcome, actor_kind, actor_id, actor_label,
                   request_id, details)
                 VALUES (gen_random_uuid(), $1, $1, 2, 'audit.system_retention', 1,
                         'audit', 'succeeded', 'system', NULL, 'Studio',
                         gen_random_uuid(), '{}'::jsonb)`,
                [team],
              ),
            );

            const reported = yield* TenantScope.open(
              access(team),
              facets(team, 10),
            );
            expect(reported.eventTypes.toSorted()).toEqual([
              'audit.system_retention',
              'team.invitation.created',
            ]);
            expect(reported.actors).toContainEqual({
              kind: 'system',
              id: null,
              label: 'Studio',
            });
            expect(reported.actors).toContainEqual({
              kind: 'user',
              id: 'actor',
              label: 'Audit actor',
            });
            expect(reported.truncated).toBe(false);

            // Below the real cardinality the list is cut and says so, rather
            // than silently pretending the team has only one action.
            const capped = yield* TenantScope.open(
              access(team),
              facets(team, 1),
            );
            expect(capped.eventTypes).toHaveLength(1);
            expect(capped.actors).toHaveLength(1);
            expect(capped.truncated).toBe(true);
          }),
      );

      // The cap is two independent walks, and the flag is their disjunction —
      // so a team whose actions are capped while its actors are not, and the
      // mirror of it, are the only shapes that can tell one walk's bound from
      // the other's.
      it.effect('flags a cap reached by either walk on its own', () =>
        Effect.gen(function* () {
          const actions = 'audit-facet-actions';
          yield* insertRawEvent(actions, 1, { eventType: 'audit.one' });
          yield* insertRawEvent(actions, 2, { eventType: 'audit.two' });
          // Both rows carry the same system actor, so only the action walk
          // can be the one that overflows.
          const byAction = yield* TenantScope.open(
            access(actions),
            facets(actions, 1),
          );
          expect(byAction.eventTypes).toHaveLength(1);
          expect(byAction.actors).toHaveLength(1);
          expect(byAction.truncated).toBe(true);

          const actors = 'audit-facet-actors';
          yield* TenantScope.open(
            access(actors),
            append({ ...invitationEvent(actors), actorId: 'actor-one' }),
          );
          yield* TenantScope.open(
            access(actors),
            append({ ...invitationEvent(actors), actorId: 'actor-two' }),
          );
          // One event type, two actors: now only the actor walk can overflow.
          const byActor = yield* TenantScope.open(
            access(actors),
            facets(actors, 1),
          );
          expect(byActor.eventTypes).toHaveLength(1);
          expect(byActor.actors).toHaveLength(1);
          expect(byActor.truncated).toBe(true);

          // And at a cap the team does reach, neither walk claims more.
          const whole = yield* TenantScope.open(
            access(actors),
            facets(actors, 10),
          );
          expect(whole.eventTypes).toEqual(['team.invitation.created']);
          expect(
            whole.actors
              .map(({ id }) => id ?? '')
              .toSorted((a, b) => a.localeCompare(b)),
          ).toEqual(['actor-one', 'actor-two']);
          expect(whole.truncated).toBe(false);
        }),
      );

      it.effect(
        'filters the list by the actor pair, including an actor with no id',
        () =>
          Effect.gen(function* () {
            const team = 'audit-facets';
            const systemOnly = yield* TenantScope.open(
              access(team),
              list(team, { actor: { kind: 'system', id: null } }),
            );
            expect(systemOnly.map((row) => row.sequence)).toEqual(['2']);

            const userOnly = yield* TenantScope.open(
              access(team),
              list(team, { actor: { kind: 'user', id: 'actor' } }),
            );
            expect(userOnly.map((row) => row.sequence)).toEqual(['1']);
          }),
      );

      // The page the feed asks for: newest first, cut to the caller's limit,
      // and continued from the last sequence it was given. The cursor is a
      // base-10 string on the wire and a bigint in the predicate, so this is
      // also the only case that proves that conversion.
      it.effect(
        'pages backwards from a cursor, within the asked-for limit',
        () =>
          Effect.gen(function* () {
            const team = 'audit-paging';
            for (let index = 0; index < 3; index += 1) {
              yield* TenantScope.open(
                access(team),
                append(invitationEvent(team)),
              );
            }

            const firstPage = yield* TenantScope.open(
              access(team),
              list(team, { limit: 2 }),
            );
            expect(firstPage.map((row) => row.sequence)).toEqual(['3', '2']);

            const nextPage = yield* TenantScope.open(
              access(team),
              list(team, { limit: 2, beforeSequence: '2' }),
            );
            expect(nextPage.map((row) => row.sequence)).toEqual(['1']);

            // The cursor is exclusive, so a cursor at the oldest row ends the
            // feed rather than repeating it.
            expect(
              yield* TenantScope.open(
                access(team),
                list(team, { beforeSequence: '1' }),
              ),
            ).toEqual([]);
          }),
      );

      // The action menu is built from the team's whole history, which can hold
      // event types this build never registered, so the filter input has to
      // accept every event_type the table can store. The CHECK constraint is
      // the only authority on that length; a narrower input schema would show
      // an event in the feed, offer it in the menu, and then refuse the
      // selection as a bad request.
      it.effect(
        'accepts a filter on the longest event type the table can store',
        () =>
          Effect.gen(function* () {
            const team = 'audit-bounds';
            const longest = `audit.${'e'.repeat(122)}`;
            expect(longest).toHaveLength(128);
            yield* insertRawEvent(team, 1, { eventType: longest });

            // One character further is refused by the table, so 128 really is
            // the ceiling this bound has to reach and no further.
            const refused = yield* Effect.result(
              insertRawEvent(team, 2, { eventType: `${longest}e` }),
            );
            expect(Result.isFailure(refused)).toBe(true);
            if (Result.isFailure(refused)) {
              expect(sqlState(refused.failure)).toBe('23514');
              expect(messagesOf(refused.failure)).toContain(
                'audit_events_identifier_lengths_check',
              );
            }

            expect(
              auditListInputIssues({
                teamId: team,
                eventTypes: [longest],
                // The same table caps actor_id at 255 characters.
                actor: { kind: 'user', id: 'a'.repeat(255) },
              }),
            ).toEqual([]);

            const offered = yield* TenantScope.open(
              access(team),
              facets(team, 10),
            );
            expect(offered.eventTypes).toContain(longest);

            const filtered = yield* TenantScope.open(
              access(team),
              list(team, { eventTypes: [longest] }),
            );
            expect(filtered.map((row) => row.eventType)).toEqual([longest]);
          }),
      );

      // `occurred_at` is `statement_timestamp()`, which Postgres keeps to the
      // microsecond, so no millisecond-precision cutoff can name the last
      // instant of a day. The window is half-open instead: the caller passes
      // the instant the next period begins, and everything before it belongs
      // to the period that instant closes.
      it.effect(
        'closes the occurred_at window on the instant the next period begins',
        () =>
          Effect.gen(function* () {
            const team = 'audit-window';
            // The bounds the activity screen sends for "to: 5 March 2026" —
            // the viewer's local midnights. Both these and the stored values
            // are absolute instants, so whatever timezone the server keeps
            // never enters the comparison: the day filtered on is the viewer's
            // own.
            const dayStart = new Date('2026-03-05T00:00:00');
            const nextDayStart = new Date('2026-03-06T00:00:00');

            yield* insertRawEvent(team, 1, { at: dayStart });
            yield* insertRawEvent(team, 2, {
              at: nextDayStart,
              offset: '-500 microseconds',
            });
            yield* insertRawEvent(team, 3, { at: nextDayStart });

            const withinDay = yield* TenantScope.open(
              access(team),
              list(team, {
                occurredFrom: dayStart,
                occurredTo: nextDayStart,
              }),
            );
            // Sequence 2 sits 500 microseconds before midnight, inside the day
            // and past anything a millisecond bound could express. Sequence 3
            // is midnight itself, which opens the next day rather than closing
            // this one.
            expect(withinDay.map((row) => row.sequence)).toEqual(['2', '1']);

            // The cutoff this replaced, kept as the reason it had to: an
            // inclusive end-of-day rounded to the millisecond drops sequence 2,
            // so the day the viewer asked for silently loses its last event.
            const millisecondCutoff = yield* TenantScope.open(
              access(team),
              list(team, {
                occurredFrom: dayStart,
                occurredTo: new Date('2026-03-05T23:59:59.999'),
              }),
            );
            expect(millisecondCutoff.map((row) => row.sequence)).toEqual(['1']);
          }),
      );

      // `get` reads one row by id, and the two directions are worth keeping
      // apart: a row the team owns comes back whole, and an id that matches
      // nothing is `null` rather than an empty row the caller would render.
      it.effect('returns a stored event by id, and null for no match', () =>
        Effect.gen(function* () {
          const team = 'audit-get';
          const stored = yield* TenantScope.open(
            access(team),
            append(invitationEvent(team)),
          );

          const found = yield* TenantScope.open(
            access(team),
            get(team, stored.id),
          );
          expect(found?.id).toBe(stored.id);
          expect(found?.sequence).toBe(stored.sequence);
          expect(found?.details).toEqual({ role: 'member' });

          expect(
            yield* TenantScope.open(access(team), get(team, randomUUID())),
          ).toBeNull();

          // Another team's id is no more reachable than an absent one. Asked
          // inside a tenant scope the policy alone would hide it, so the
          // question is put on the connecting login's connection, which the
          // policy does not confine: there the team predicate is the only
          // thing that can answer it.
          expect(
            yield* TenantScope.open(
              access('audit-a'),
              get('audit-a', stored.id),
            ),
          ).toBeNull();
          expect(yield* ownerScope(null, get('audit-a', stored.id))).toBeNull();
          expect((yield* ownerScope(null, get(team, stored.id)))?.id).toBe(
            stored.id,
          );
        }),
      );

      it.effect(
        'has no foreign key that could cascade mutable rows into history',
        () =>
          Effect.gen(function* () {
            const harness = yield* TestDatabase;
            const foreignKeys = yield* harness.onOwner(
              harness.owner.sql<{
                conname: string;
              }>`SELECT conname FROM pg_constraint
                 WHERE conrelid = 'audit_events'::regclass AND contype = 'f'`,
            );
            expect(foreignKeys).toHaveLength(0);
          }),
      );
    },
  );
});
