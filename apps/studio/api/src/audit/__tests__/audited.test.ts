import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Fiber, Layer, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { describe } from 'vitest';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { Database } from '../../db/client.ts';
import {
  type TeamAccess,
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';
import { RequestId } from '../../http/middleware/request-id.ts';
import {
  audited,
  type AuditEvents,
  auditable,
  changed,
  unchanged,
} from '../audited.ts';
import { AuditContext } from '../context.ts';
import { AuditSignal, RecordedSignals } from '../signal.ts';
import { lockedTeamLabel, lockTeam } from '../store.ts';

const newTeam = () =>
  unsafeMakeTeamAccess(`audited-${randomUUID().slice(0, 8)}`, 'owner');

const REQUEST_ID = '00000000-0000-4000-8000-00000000000a';

const principal = Principal.of({
  kind: 'user',
  userId: Schema.decodeSync(UserId)('audited-actor'),
  email: 'actor@example.test',
  emailVerified: true,
  name: 'Audited Actor',
  locale: null,
  sessionId: 'audited-session',
});

const ROLE_CHANGED: AuditEvents = [
  {
    eventType: 'team.member.role_changed',
    eventVersion: 1,
    category: 'team_access',
    subjectType: 'team_member',
    subjectId: 'subject-user',
    subjectLabel: 'Subject User',
    resourceType: null,
    resourceId: null,
    resourceLabel: null,
    details: { previousRoles: ['member'], newRoles: ['admin'] },
  },
];

class RoleChangeDenied extends Error {
  constructor() {
    super('role change denied');
    this.name = 'RoleChangeDenied';
  }
}

const denied = () =>
  auditable(new RoleChangeDenied(), {
    outcome: 'denied',
    events: [
      {
        eventType: 'team.member.role_change_denied',
        eventVersion: 1,
        category: 'team_access',
        subjectType: 'team_member',
        subjectId: 'subject-user',
        subjectLabel: 'Subject User',
        resourceType: null,
        resourceId: null,
        resourceLabel: null,
        details: {
          requestedRoles: ['owner'],
          reason: 'insufficient_permission',
        },
      },
    ],
  });

const Harness = Layer.mergeAll(
  TestDatabaseLive,
  AuditSignal.layerRecording,
  Layer.succeed(Principal, principal),
  Layer.succeed(RequestId, RequestId.of(REQUEST_ID)),
);

const seedTeam = Effect.fnUntraced(function* (name: string) {
  const harness = yield* TestDatabase;
  const team = newTeam();
  yield* harness.onOwner(
    harness.owner.sql`insert into teams (id, name, slug)
                      values (${team.teamId}, ${name}, ${team.teamId})`,
  );
  return team;
});

const auditRows = Effect.fnUntraced(function* (teamId: string) {
  const harness = yield* TestDatabase;
  return yield* harness.onOwner(
    harness.owner.sql<{
      event_type: string;
      outcome: string;
      team_label: string;
      actor_label: string;
      request_id: string;
    }>`select event_type, outcome, team_label, actor_label, request_id
         from audit_events
        where team_id = ${teamId}
        order by sequence`,
  );
});

const markerCount = Effect.fnUntraced(function* (id: string) {
  const harness = yield* TestDatabase;
  const rows = yield* harness.onOwner(
    harness.owner.sql<{
      n: number;
    }>`select count(*)::int as n from protocols where id = ${id}`,
  );
  return rows[0]?.n ?? 0;
});

const writeMarker = (id: string, teamId: string) =>
  Effect.flatMap(
    Transaction,
    ({ sql }) =>
      sql`insert into protocols (id, team_id, name) values (${id}, ${teamId}, 'marker')`,
  );

const waitForLock = (
  access: TeamAccess,
  take: Effect.Effect<unknown, unknown, Transaction>,
) =>
  Effect.flatMap(TestDatabase, (harness) =>
    Effect.forkDetach(
      Effect.provideService(
        TenantScope.open(
          access,
          Effect.gen(function* () {
            yield* take;
            const { sql } = yield* Transaction;
            const rows = yield* sql<{
              n: number;
            }>`select count(*)::int as n from audit_events
                where team_id = ${access.teamId}`;
            return rows[0]?.n ?? -1;
          }),
        ),
        Database,
        harness.secondApp,
      ),
    ),
  );

const untilSomeoneWaits = (
  waiter: Fiber.Fiber<number, unknown>,
): Effect.Effect<void, unknown, Transaction> =>
  Effect.gen(function* () {
    const { sql } = yield* Transaction;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const rows = yield* sql<{ waiting: boolean }>`select exists (
          select 1 from pg_stat_activity
           where pg_backend_pid() = any(pg_blocking_pids(pid))
        ) as waiting`;
      if (rows[0]?.waiting === true) return;
      const ended = waiter.pollUnsafe();
      if (ended !== undefined) {
        yield* Effect.die(
          new Error(
            `the waiter ended without queueing: ${Exit.isFailure(ended) ? Cause.pretty(ended.cause) : 'it took the lock'}`,
          ),
        );
      }
    }
    yield* Effect.die(new Error('the waiter never queued'));
  });

describe.skipIf(!testDb)('audited', () => {
  layer(Harness)((it) => {
    it.effect('appends a success event and commits the body', () =>
      Effect.gen(function* () {
        const TEAM = yield* seedTeam('Audited Team');
        const marker = randomUUID();

        const value = yield* audited(
          'team.updateMemberRole',
          TEAM,
          Effect.as(
            writeMarker(marker, TEAM.teamId),
            changed('ok', ROLE_CHANGED),
          ),
        );

        assert.strictEqual(value, 'ok');
        assert.strictEqual(yield* markerCount(marker), 1);
        const rows = yield* auditRows(TEAM.teamId);
        assert.lengthOf(rows, 1);
        assert.strictEqual(rows[0]?.event_type, 'team.member.role_changed');
        assert.strictEqual(rows[0]?.outcome, 'succeeded');
      }),
    );

    it.effect('stamps the actor and request the combinator owns', () =>
      Effect.gen(function* () {
        const TEAM = yield* seedTeam('Audited Team');
        yield* audited(
          'team.updateMemberRole',
          TEAM,
          Effect.succeed(changed('ok', ROLE_CHANGED)),
        );
        const rows = yield* auditRows(TEAM.teamId);
        assert.strictEqual(rows[0]?.actor_label, 'Audited Actor');
        assert.strictEqual(rows[0]?.request_id, REQUEST_ID);
        assert.strictEqual(rows[0]?.team_label, 'Audited Team');
      }),
    );

    it.effect('labels the event with the team name it locked', () =>
      Effect.gen(function* () {
        const TEAM = yield* seedTeam('Before The Rename');
        const harness = yield* TestDatabase;

        yield* audited(
          'team.updateMemberRole',
          TEAM,
          Effect.gen(function* () {
            const { sql } = yield* Transaction;
            yield* sql`update teams set name = 'After The Rename' where id = ${TEAM.teamId}`;
            return changed('ok', ROLE_CHANGED);
          }),
        );

        const rows = yield* auditRows(TEAM.teamId);
        assert.strictEqual(rows[0]?.team_label, 'Before The Rename');
        const after = yield* harness.onOwner(
          harness.owner.sql<{
            name: string;
          }>`select name from teams where id = ${TEAM.teamId}`,
        );
        assert.strictEqual(after[0]?.name, 'After The Rename');
      }),
    );

    it.effect('appends nothing when the command changed nothing', () =>
      Effect.gen(function* () {
        const TEAM = yield* seedTeam('Audited Team');
        const value = yield* audited(
          'team.acceptInvitation',
          TEAM,
          Effect.succeed(unchanged('replayed')),
        );
        assert.strictEqual(value, 'replayed');
        assert.lengthOf(yield* auditRows(TEAM.teamId), 0);
      }),
    );

    it.effect(
      'commits the denial event while rolling the body back, then fails',
      () =>
        Effect.gen(function* () {
          const TEAM = yield* seedTeam('Audited Team');
          const marker = randomUUID();

          const exit = yield* Effect.exit(
            audited(
              'team.updateMemberRole',
              TEAM,
              Effect.flatMap(writeMarker(marker, TEAM.teamId), () =>
                Effect.fail(denied()),
              ),
            ),
          );

          assert.isTrue(Exit.isFailure(exit));

          assert.strictEqual(yield* markerCount(marker), 0);

          const rows = yield* auditRows(TEAM.teamId);
          assert.lengthOf(rows, 1);
          assert.strictEqual(
            rows[0]?.event_type,
            'team.member.role_change_denied',
          );
          assert.strictEqual(rows[0]?.outcome, 'denied');
        }),
    );

    for (const [lock, take] of [
      ['team advisory lock', lockTeam],
      ['team row lock', lockedTeamLabel],
    ] as const) {
      // On the live clock: the waiter's connect runs inside the driver's own
      // timers, which the test clock would never fire.
      it.effect(`holds the ${lock} until the denial event has committed`, () =>
        TestClock.withLive(
          Effect.gen(function* () {
            const TEAM = yield* seedTeam('Audited Team');
            const { secondApp } = yield* TestDatabase;
            yield* secondApp.sql`select 1`;
            let waiter: Fiber.Fiber<number, unknown> | undefined;

            const exit = yield* Effect.exit(
              audited(
                'team.updateMemberRole',
                TEAM,
                Effect.gen(function* () {
                  waiter = yield* waitForLock(TEAM, take(TEAM.teamId));
                  yield* untilSomeoneWaits(waiter);
                  return yield* Effect.fail(denied());
                }),
              ),
            );
            assert.isTrue(Exit.isFailure(exit) && !Exit.hasDies(exit));
            assert.isDefined(waiter);
            if (waiter === undefined) return;

            assert.strictEqual(yield* Fiber.join(waiter), 1);
            assert.lengthOf(yield* auditRows(TEAM.teamId), 1);
          }),
        ),
      );
    }

    it.effect('appends no denial event for a marker carried on a defect', () =>
      Effect.gen(function* () {
        const TEAM = yield* seedTeam('Audited Team');
        const marker = randomUUID();

        const exit = yield* Effect.exit(
          audited(
            'team.updateMemberRole',
            TEAM,
            Effect.flatMap(writeMarker(marker, TEAM.teamId), () =>
              Effect.die(denied()),
            ),
          ),
        );

        assert.isTrue(Exit.hasDies(exit));
        assert.strictEqual(yield* markerCount(marker), 0);
        assert.lengthOf(yield* auditRows(TEAM.teamId), 0);
      }),
    );

    it.effect('rolls everything back when the failure is not auditable', () =>
      Effect.gen(function* () {
        const TEAM = yield* seedTeam('Audited Team');
        const marker = randomUUID();

        const exit = yield* Effect.exit(
          audited(
            'team.updateMemberRole',
            TEAM,
            Effect.flatMap(writeMarker(marker, TEAM.teamId), () =>
              Effect.fail(new Error('the database was unreachable')),
            ),
          ),
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.strictEqual(yield* markerCount(marker), 0);
        assert.lengthOf(yield* auditRows(TEAM.teamId), 0);
      }),
    );

    it.effect('dies rather than commit a change it cannot describe', () =>
      Effect.gen(function* () {
        const TEAM = yield* seedTeam('Audited Team');
        const marker = randomUUID();

        const exit = yield* Effect.exit(
          audited(
            'team.updateMemberRole',
            TEAM,
            Effect.as(writeMarker(marker, TEAM.teamId), {
              _tag: 'Changed' as const,
              value: 'ok',
              events: [] as unknown as AuditEvents,
            }),
          ),
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.strictEqual(yield* markerCount(marker), 0);
        assert.lengthOf(yield* auditRows(TEAM.teamId), 0);
      }),
    );

    it.effect('refuses a team that is not there', () =>
      Effect.gen(function* () {
        const TEAM = newTeam();

        const exit = yield* Effect.exit(
          audited(
            'team.updateMemberRole',
            TEAM,
            Effect.succeed(changed('ok', ROLE_CHANGED)),
          ),
        );
        assert.isTrue(Exit.isFailure(exit));
      }),
    );

    it.effect(
      'signals the operator when a required append cannot be written',
      () =>
        Effect.gen(function* () {
          const TEAM = yield* seedTeam('Audited Team');
          const harness = yield* TestDatabase;
          const marker = randomUUID();

          yield* harness.onOwner(
            harness.owner.sql.unsafe(`
            create or replace function refuse_audit_append() returns trigger as $refuse$
            begin raise exception 'audit insert rejected'; end;
            $refuse$ language plpgsql`),
          );
          yield* harness.onOwner(
            harness.owner.sql.unsafe(`
            create or replace trigger refuse_audit_append
              before insert on audit_events
              for each row execute function refuse_audit_append()`),
          );

          const exit = yield* Effect.exit(
            audited(
              'team.updateMemberRole',
              TEAM,
              Effect.as(
                writeMarker(marker, TEAM.teamId),
                changed('ok', ROLE_CHANGED),
              ),
            ),
          );

          yield* harness.onOwner(
            harness.owner.sql.unsafe(
              'drop trigger refuse_audit_append on audit_events',
            ),
          );

          assert.isTrue(Exit.isFailure(exit));
          assert.strictEqual(yield* markerCount(marker), 0);

          const recorded = yield* Effect.flatMap(
            RecordedSignals,
            (signals) => signals.signals,
          );
          assert.deepStrictEqual(
            recorded.map((signal) => signal.code),
            ['STUDIO_AUDIT_APPEND_FAILED'],
          );
        }),
    );

    it.effect(
      'provides the audit context only inside the locked transaction',
      () =>
        Effect.gen(function* () {
          const TEAM = yield* seedTeam('Audited Team');
          const seen = yield* audited(
            'team.updateMemberRole',
            TEAM,
            Effect.map(AuditContext, (context) =>
              changed(context.teamLabel, ROLE_CHANGED),
            ),
          );
          assert.strictEqual(seen, 'Audited Team');
        }),
    );
  });
});
