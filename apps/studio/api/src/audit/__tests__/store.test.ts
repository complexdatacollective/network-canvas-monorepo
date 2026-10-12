import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Cause, Effect, Predicate, Redacted, Result, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { AuditListInput } from '@codaco/studio-contract/schema/audit';
import { TEAM_GUC } from '@codaco/studio-sync/rls';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
  maintenanceRows,
  tenantRows,
  databaseNow,
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

const decodeAuditListInput = Schema.decodeUnknownResult(AuditListInput);

function auditListInputIssues(input: unknown) {
  const result = decodeAuditListInput(input);
  return Result.isFailure(result) ? [result.failure] : [];
}

const access = (teamId: string) => unsafeMakeTeamAccess(teamId, 'owner');

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

const stateOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.result(effect), (result) =>
    Result.isFailure(result) ? sqlState(result.failure) : 'no failure',
  );

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
    teamLabel: Redacted.make(teamId),
    eventType: 'team.invitation.created',
    eventVersion: 1,
    category: 'team_access',
    outcome: 'succeeded',
    actorKind: 'user',
    actorId: 'actor',
    actorLabel: Redacted.make('Audit actor'),
    subjectType: 'team_invitation',
    subjectId: randomUUID(),
    subjectLabel: Redacted.make('invitee@example.com'),
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
    requestId: randomUUID(),
    details: { role: 'member' },
  };
}

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
            expect(Redacted.value(first.teamLabel)).toBe(team);

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

            // Each refusal opens its own scope: the first one aborts the transaction
            // it ran in.
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

            const unpredicated = yield* TenantScope.open(
              access('audit-a'),
              Effect.flatMap(
                Transaction,
                ({ sql }) => sql<{ id: string }>`SELECT id FROM audit_events`,
              ),
            );
            expect(unpredicated).toHaveLength(1);

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
              const started = yield* rowsOf(
                Schema.Struct({ value: Schema.Date }),
                sql`SELECT transaction_timestamp() AS value`,
              );
              yield* sql`SELECT pg_sleep(0.02)`;
              const event = yield* append(invitationEvent('audit-timestamp'));

              const transactionStarted = started[0]?.value.getTime();
              expect(event.occurredAt).toBeInstanceOf(Date);
              expect(event.occurredAt.getTime()).toBeGreaterThan(
                transactionStarted ?? Number.POSITIVE_INFINITY,
              );
            }),
          ),
      );

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

            const before = yield* databaseNow;
            const live = yield* TenantScope.open(
              access(team),
              append(invitationEvent(team)),
            );
            expect(live.occurredAt.getTime()).toBeGreaterThanOrEqual(before);

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
            const actors = reported.actors.map((actor) => ({
              ...actor,
              label: Redacted.value(actor.label),
            }));
            expect(actors).toContainEqual({
              kind: 'system',
              id: null,
              label: 'Studio',
            });
            expect(actors).toContainEqual({
              kind: 'user',
              id: 'actor',
              label: 'Audit actor',
            });
            expect(reported.truncated).toBe(false);

            const capped = yield* TenantScope.open(
              access(team),
              facets(team, 1),
            );
            expect(capped.eventTypes).toHaveLength(1);
            expect(capped.actors).toHaveLength(1);
            expect(capped.truncated).toBe(true);
          }),
      );

      it.effect('flags a cap reached by either walk on its own', () =>
        Effect.gen(function* () {
          const actions = 'audit-facet-actions';
          yield* insertRawEvent(actions, 1, { eventType: 'audit.one' });
          yield* insertRawEvent(actions, 2, { eventType: 'audit.two' });
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
          const byActor = yield* TenantScope.open(
            access(actors),
            facets(actors, 1),
          );
          expect(byActor.eventTypes).toHaveLength(1);
          expect(byActor.actors).toHaveLength(1);
          expect(byActor.truncated).toBe(true);

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

            expect(
              yield* TenantScope.open(
                access(team),
                list(team, { beforeSequence: '1' }),
              ),
            ).toEqual([]);
          }),
      );

      it.effect(
        'accepts a filter on the longest event type the table can store',
        () =>
          Effect.gen(function* () {
            const team = 'audit-bounds';
            const longest = `audit.${'e'.repeat(122)}`;
            expect(longest).toHaveLength(128);
            yield* insertRawEvent(team, 1, { eventType: longest });

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

      it.effect(
        'closes the occurred_at window on the instant the next period begins',
        () =>
          Effect.gen(function* () {
            const team = 'audit-window';
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
            expect(withinDay.map((row) => row.sequence)).toEqual(['2', '1']);

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
          expect(found && Redacted.value(found.details)).toEqual({
            role: 'member',
          });

          expect(
            yield* TenantScope.open(access(team), get(team, randomUUID())),
          ).toBeNull();

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
