import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Effect, Exit, Fiber, Layer, Schema } from 'effect';
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

// `audited` is commit-then-fail, and every case below exists to hold one half
// of that against the other: the domain write must not survive an auditable
// failure, and the audit event must.
//
// It is measured against a real server because nothing about it is visible
// from the process. "The savepoint rolled back" is the database not having a
// row; "the outer transaction still holds its locks" is another connection
// being refused; and "the transaction committed before the command failed" is
// a row that is there after an effect that failed — and "the locks outlived
// the rolled-back body" is another connection that could only take them once
// the denial event had committed.

// A team per case, never reused. `audit_events` is append-only — its own
// sidecar trigger refuses a DELETE — so a case cannot tidy up after itself,
// and two cases sharing a team would read each other's history.
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

/** One event body, in the shape a command may write. */
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

/** A denial a command raises, carrying the event the team is entitled to see. */
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

/** A fresh team, seeded and returned as the access token that opens it. */
const seedTeam = Effect.fnUntraced(function* (name: string) {
  const harness = yield* TestDatabase;
  const team = newTeam();
  yield* harness.onOwner(
    harness.owner.sql`insert into teams (id, name, slug)
                      values (${team.teamId}, ${name}, ${team.teamId})`,
  );
  return team;
});

/** Every audit row this team has, oldest first, read as the connecting login. */
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

/** A marker row the body writes, so "the body's write was undone" is testable. */
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

/**
 * Forked from inside a command's body: takes one of the command's locks on the
 * second application client, and once it has it, counts the team's committed
 * audit rows. The count is the moment the lock came free — none if the
 * savepoint's rollback released it, the denial if only the commit did.
 */
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

/**
 * Returns once another backend is queued behind this transaction, so the body
 * fails only after the waiter is really waiting. Polled against the wall clock
 * rather than slept on: the layer runs under the test clock, and a loaded
 * server can be slow to give the second client its connection.
 */
const untilSomeoneWaits: Effect.Effect<void, unknown, Transaction> = Effect.gen(
  function* () {
    const { sql } = yield* Transaction;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const rows = yield* sql<{ waiting: boolean }>`select exists (
          select 1 from pg_stat_activity
           where pg_backend_pid() = any(pg_blocking_pids(pid))
        ) as waiting`;
      if (rows[0]?.waiting === true) return;
    }
    yield* Effect.die(new Error('the waiter never queued'));
  },
);

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
        // A command supplies none of these three; the combinator does, which is
        // what makes a forged context unrepresentable rather than merely
        // refused.
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
            // A rename committed *inside* the command must not change the
            // label: the event describes the team as it was when the command
            // took its lock.
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

    // ---------------------------------------------------------------------
    // The decider (#1927 section 21 F1, slice S4.4). Everything above would
    // also pass under the `tapError` shape the first draft proposed; this is
    // the case that does not.
    // ---------------------------------------------------------------------
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

          // It still fails, with the command's own error.
          assert.isTrue(Exit.isFailure(exit));

          // The body's write is gone: the savepoint rolled back.
          assert.strictEqual(yield* markerCount(marker), 0);

          // The denial event is not: the outer transaction committed it after
          // that rollback, which is the whole point of capturing the Exit
          // rather than letting it propagate.
          const rows = yield* auditRows(TEAM.teamId);
          assert.lengthOf(rows, 1);
          assert.strictEqual(
            rows[0]?.event_type,
            'team.member.role_change_denied',
          );
          assert.strictEqual(rows[0]?.outcome, 'denied');
        }),
    );

    // A subtransaction's rollback releases the locks taken inside it, and the
    // denial is appended after exactly that rollback — so both locks have to
    // be the outer transaction's. Each case queues a second connection behind
    // one of them and reads what it could see once it got through.
    for (const [lock, take] of [
      ['team advisory lock', lockTeam],
      ['team row lock', lockedTeamLabel],
    ] as const) {
      it.effect(`holds the ${lock} until the denial event has committed`, () =>
        Effect.gen(function* () {
          const TEAM = yield* seedTeam('Audited Team');
          let waiter: Fiber.Fiber<number, unknown> | undefined;

          const exit = yield* Effect.exit(
            audited(
              'team.updateMemberRole',
              TEAM,
              Effect.gen(function* () {
                waiter = yield* waitForLock(TEAM, take(TEAM.teamId));
                yield* untilSomeoneWaits;
                return yield* Effect.fail(denied());
              }),
            ),
          );
          // The denial itself, not a defect: a waiter that never queued dies
          // above, and the rollback that follows would read as a released
          // lock below.
          assert.isTrue(Exit.isFailure(exit) && !Exit.hasDies(exit));
          assert.isDefined(waiter);
          if (waiter === undefined) return;

          // The waiter got the lock only after the command committed, so it
          // saw the denial event. Released at the savepoint's rollback, it
          // would have got it first and seen nothing.
          assert.strictEqual(yield* Fiber.join(waiter), 1);
          assert.lengthOf(yield* auditRows(TEAM.teamId), 1);
        }),
      );
    }

    it.effect('rolls everything back when the failure is not auditable', () =>
      Effect.gen(function* () {
        const TEAM = yield* seedTeam('Audited Team');
        const marker = randomUUID();

        const exit = yield* Effect.exit(
          audited(
            'team.updateMemberRole',
            TEAM,
            Effect.flatMap(writeMarker(marker, TEAM.teamId), () =>
              // No marker: an ordinary failure, not a decision the team is
              // entitled to a record of.
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
              // Reachable only from an untyped caller; the tuple type is the
              // compile-time guard, and this is the runtime one.
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
        // Never seeded. An access token can outlive the team it names — a team
        // deleted between the membership check and the command — and the
        // locked read is what catches it.
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

          // The mechanism the pre-Effect suite used, kept verbatim: a trigger
          // that refuses the insert. What changed is only where the assertion
          // reads from — a recorded signal rather than a spy on `process`.
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
          // The action never commits without its record.
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

    // And nowhere else. That half is a *compile* assertion rather than a
    // runtime one, because it is the stronger statement: reading the context
    // outside a command leaves `AuditContext` in the effect's requirements,
    // and the layer does not provide it, so the code does not build. A runtime
    // check could only observe a failure that the compiler already forbids.
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
