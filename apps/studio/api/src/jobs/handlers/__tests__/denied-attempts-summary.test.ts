import { randomUUID } from 'node:crypto';

import {
  assert,
  describe,
  expect,
  it as vitestIt,
  layer,
} from '@effect/vitest';
import {
  Clock,
  Context,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
} from 'effect';
import { TestClock } from 'effect/testing';
import pg from 'pg';

import { JOB_SCHEDULES } from '@codaco/studio-sync/jobs';

import { ownerRows, testDb } from '../../../__tests__/support/database.ts';
import { reachableRedis } from '../../../__tests__/support/valkey.ts';
import {
  CLAIMED_SUFFIX,
  DeniedAttempts,
} from '../../../audit/denial-rate-limit.ts';
import { MaintenanceDatabase } from '../../../db/client.ts';
import { MaintenanceScope } from '../../../db/tenant.ts';
import { collectLogs } from '../../../platform/__tests__/support/logs.ts';
import { DENIED_SCOPE_COUNTS_KEY } from '../../../rate-limit/limiter.ts';
import { RateLimitStore } from '../../../rate-limit/store.ts';
import {
  DeliveryHarness,
  layerDeliveryHarness,
  layerJobs,
  onWorker,
} from '../../__tests__/support.ts';
import { causeError } from '../../errors.ts';
import { Jobs } from '../../jobs.ts';
import { resolvedQueue } from '../../queues.ts';
import type { HandledJob } from '../../worker.ts';
import { deniedAttemptsSummary } from '../denied-attempts-summary.ts';
import {
  DeniedAttemptsStore,
  DeniedAttemptsStoreFailed,
} from '../denied-attempts/store.ts';
import {
  DeniedAttemptsMemory,
  layerMemoryStore,
} from '../denied-attempts/testing.ts';

/** Not in support/valkey.ts's `REDIS_DATABASES`: index 9 is the first one free. */
const redisUrl = await reachableRedis(9);

const WINDOW_MS = 60_000;

const CASE_STEP = Duration.minutes(10);

const OPERATION = 'audit.read';

const pinnedAt =
  (ms: number) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Clock.clockWith((clock) =>
      Effect.provideService(effect, Clock.Clock, {
        currentTimeMillisUnsafe: () => ms,
        currentTimeMillis: Effect.succeed(ms),
        currentTimeNanosUnsafe: () => BigInt(ms) * 1_000_000n,
        currentTimeNanos: Effect.succeed(BigInt(ms) * 1_000_000n),
        monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
        monotonicTimeNanos: clock.monotonicTimeNanos,
        sleep: (duration) => clock.sleep(duration),
      }),
    );

const LATER = Duration.minutes(10);

const job = (): HandledJob<'denied-attempts-summary'> => ({
  id: randomUUID(),
  queue: 'denied-attempts-summary',
  payload: {},
  attempt: 1,
  finalAttempt: true,
});

type AuditRow = {
  readonly event_type: string;
  readonly outcome: string;
  readonly actor_id: string;
  readonly details: Record<string, unknown>;
};

describe('the summary queue declaration', () => {
  vitestIt('is a singleton on a one-minute schedule', () => {
    expect(resolvedQueue('denied-attempts-summary').policy).toBe('singleton');
    expect(
      JOB_SCHEDULES.find(({ queue }) => queue === 'denied-attempts-summary'),
    ).toMatchObject({ cron: '* * * * *' });
  });
});

const suiteLayer = Layer.mergeAll(layerMemoryStore, layerJobs).pipe(
  Layer.provideMerge(layerDeliveryHarness),
);

describe.skipIf(!testDb)(
  'the denied-attempts summary job on the native queue',
  () => {
    layer(suiteLayer)('with Studio and the queue installed', (it) => {
      const startCase = Effect.fnUntraced(function* () {
        yield* TestClock.adjust(CASE_STEP);
        const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
        return {
          nowMs,
          closedAt: Math.floor((nowMs - 5 * WINDOW_MS) / WINDOW_MS) * WINDOW_MS,
          liveAt: Math.floor(nowMs / WINDOW_MS) * WINDOW_MS,
        };
      });

      const seedActor = Effect.fnUntraced(function* (
        name = 'Denied Researcher',
      ) {
        const teamId = `team-${randomUUID().slice(0, 8)}`;
        const actorId = `actor-${randomUUID().slice(0, 8)}`;
        yield* Effect.orDie(
          ownerRows(
            `INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1)
             ON CONFLICT (id) DO NOTHING`,
            [teamId],
          ),
        );
        yield* Effect.orDie(
          ownerRows(
            `INSERT INTO "user" (id, name, email, "emailVerified")
             VALUES ($1, $2, $3, true)`,
            [actorId, name, `${actorId}@example.org`],
          ),
        );
        return { teamId, actorId };
      });

      const keyFor = (
        keyPrefix: string,
        input: { teamId: string; actorId: string; operation: string },
        windowStart: number,
      ) =>
        Effect.flatMap(Effect.service(DeniedAttempts), (window) =>
          window.keyFor(input),
        ).pipe(
          Effect.provide(
            DeniedAttempts.layerWith({ keyPrefix, windowMs: WINDOW_MS }),
          ),
          Effect.provide(RateLimitStore.layerAbsent),
          pinnedAt(windowStart),
        );

      const seedWindow = Effect.fnUntraced(function* (input: {
        keyPrefix: string;
        teamId: string;
        actorId: string;
        operation?: string;
        count: number;
        windowStart: number;
      }) {
        const memory = yield* DeniedAttemptsMemory;
        const operation = input.operation ?? OPERATION;
        const key = yield* keyFor(
          input.keyPrefix,
          { teamId: input.teamId, actorId: input.actorId, operation },
          input.windowStart,
        );
        yield* memory.seed(key, {
          spent: '1',
          inflight: '0',
          suppressed: String(input.count),
          first: String(input.windowStart + 1_000),
          last: String(input.windowStart + 1_000 * input.count),
        });
        return key;
      });

      const suppressInValkey = Effect.fnUntraced(function* (input: {
        store: RateLimitStore['Service'];
        keyPrefix: string;
        teamId: string;
        actorId: string;
        count: number;
        windowStart: number;
      }) {
        const limiter = yield* Effect.service(DeniedAttempts).pipe(
          Effect.provide(
            DeniedAttempts.layerWith({
              limit: 1,
              windowMs: WINDOW_MS,
              keyPrefix: input.keyPrefix,
            }),
          ),
          Effect.provideService(RateLimitStore, input.store),
        );
        const subject = {
          teamId: input.teamId,
          actorId: input.actorId,
          operation: OPERATION,
        };
        const admitted = yield* limiter
          .reserve(subject)
          .pipe(pinnedAt(input.windowStart));
        if (!admitted.admitted) throw new Error('expected an admission');
        yield* admitted.complete('denied');
        for (let attempt = 0; attempt < input.count; attempt += 1) {
          const refused = yield* limiter
            .reserve(subject)
            .pipe(pinnedAt(input.windowStart + 1_000 * (attempt + 1)));
          assert.isFalse(refused.admitted);
        }
        return yield* limiter.keyFor(subject).pipe(pinnedAt(input.windowStart));
      });

      const openStore = Effect.map(
        Layer.build(RateLimitStore.layerOf(redisUrl!)),
        (context) => Context.get(context, RateLimitStore),
      );

      const runSummary = (keyPrefix: string) =>
        Effect.flatMap(DeliveryHarness, (harness) =>
          Effect.provideService(
            deniedAttemptsSummary({ keyPrefix, windowMs: WINDOW_MS })(job()),
            MaintenanceDatabase,
            harness.maintenance,
          ),
        );

      const summariesFor = Effect.fnUntraced(function* (teamId: string) {
        return yield* Effect.orDie(
          ownerRows<AuditRow>(
            `SELECT event_type, outcome, actor_id, details
               FROM audit_events WHERE team_id = $1`,
            [teamId],
          ),
        );
      });

      const refuseAuditInsert = Effect.fnUntraced(function* () {
        yield* Effect.orDie(
          ownerRows(`
            create or replace function refuse_summary_append()
              returns trigger as $refuse$
            begin raise exception 'summary append rejected'; end;
            $refuse$ language plpgsql`),
        );
        yield* Effect.orDie(
          ownerRows(`
            create or replace trigger refuse_summary_append
              before insert on audit_events
              for each row execute function refuse_summary_append()`),
        );
        return Effect.orDie(
          ownerRows('drop trigger refuse_summary_append on audit_events'),
        );
      });

      const dieAtCommitFor = Effect.fnUntraced(function* (teamId: string) {
        yield* Effect.orDie(
          ownerRows(`
            create or replace function die_at_commit()
              returns trigger as $die$
            begin raise exception 'the summary write has a bug'; end;
            $die$ language plpgsql`),
        );
        yield* Effect.orDie(
          ownerRows('drop trigger if exists die_at_commit on audit_events'),
        );
        yield* Effect.orDie(
          ownerRows(`
            create constraint trigger die_at_commit
              after insert on audit_events
              deferrable initially deferred
              for each row
              when (new.team_id = ${pg.escapeLiteral(teamId)})
              execute function die_at_commit()`),
        );
        return Effect.orDie(
          ownerRows('drop trigger die_at_commit on audit_events'),
        );
      });

      const onlySummary = Effect.fnUntraced(function* (teamId: string) {
        const rows = yield* summariesFor(teamId);
        assert.lengthOf(rows, 1);
        return rows[0]?.details ?? {};
      });

      it.effect('turns a suppressed burst into exactly one summary event', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          const { teamId, actorId } = yield* seedActor();
          const keyPrefix = `test-summary-${randomUUID()}`;
          const key = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 12,
            windowStart: at.closedAt,
          });

          assert.strictEqual(yield* runSummary(keyPrefix), 'completed');

          assert.deepStrictEqual(yield* summariesFor(teamId), [
            {
              event_type: 'security.denied_attempts.rate_limited',
              outcome: 'denied',
              actor_id: actorId,
              details: {
                operation: OPERATION,
                suppressedCount: 12,
                firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
                lastSuppressedAt: new Date(at.closedAt + 12_000).toISOString(),
              },
            },
          ]);
          assert.isFalse(yield* memory.exists(key));
          assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
          yield* runSummary(keyPrefix);
          assert.lengthOf(yield* summariesFor(teamId), 1);
        }),
      );

      it.effect('writes one event even when two workers run at once', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const { teamId, actorId } = yield* seedActor();
          const keyPrefix = `test-summary-${randomUUID()}`;
          yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 4,
            windowStart: at.closedAt,
          });

          yield* Effect.all([runSummary(keyPrefix), runSummary(keyPrefix)], {
            concurrency: 'unbounded',
          });

          assert.deepInclude(yield* onlySummary(teamId), {
            suppressedCount: 4,
          });
        }),
      );

      it.effect(
        'keeps the record when the audit write fails, and writes it once on the retry',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const { teamId, actorId } = yield* seedActor();
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* seedWindow({
              keyPrefix,
              teamId,
              actorId,
              count: 6,
              windowStart: at.closedAt,
            });

            const drop = yield* refuseAuditInsert();
            assert.strictEqual(
              yield* runSummary(keyPrefix).pipe(Effect.ensuring(drop)),
              'completed',
            );

            assert.deepStrictEqual(yield* summariesFor(teamId), []);
            assert.isFalse(yield* memory.exists(key));
            assert.isTrue(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));

            yield* TestClock.adjust(LATER);
            yield* runSummary(keyPrefix);
            assert.deepInclude(yield* onlySummary(teamId), {
              suppressedCount: 6,
            });
            assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));

            yield* TestClock.adjust(LATER);
            yield* runSummary(keyPrefix);
            assert.lengthOf(yield* summariesFor(teamId), 1);
          }),
      );

      it.effect(
        'writes one row when a claim is replayed after the row already exists',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const { teamId, actorId } = yield* seedActor();
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* seedWindow({
              keyPrefix,
              teamId,
              actorId,
              count: 3,
              windowStart: at.closedAt,
            });
            yield* runSummary(keyPrefix);
            assert.lengthOf(yield* summariesFor(teamId), 1);

            yield* memory.seed(`${key}${CLAIMED_SUFFIX}`, {
              spent: '1',
              suppressed: '3',
              first: String(at.closedAt + 1_000),
              last: String(at.closedAt + 3_000),
            });

            yield* TestClock.adjust(LATER);
            yield* runSummary(keyPrefix);
            assert.lengthOf(yield* summariesFor(teamId), 1);
            assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
          }),
      );

      it.effect('leaves a window whose minute has not ended alone', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          const { teamId, actorId } = yield* seedActor('Live Researcher');
          const keyPrefix = `test-summary-${randomUUID()}`;
          const closedKey = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 2,
            windowStart: at.closedAt,
          });
          const liveKey = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 5,
            windowStart: at.liveAt,
          });

          yield* runSummary(keyPrefix);

          assert.deepInclude(yield* onlySummary(teamId), {
            suppressedCount: 2,
            firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
          });
          assert.isFalse(yield* memory.exists(closedKey));

          const live = yield* memory.read(liveKey);
          assert.isNotNull(live);
          assert.strictEqual(live?.get('suppressed'), '5');
          assert.isFalse(live?.has('claimedAt') ?? true);
          assert.isFalse(yield* memory.exists(`${liveKey}${CLAIMED_SUFFIX}`));
        }),
      );

      it.effect(
        'summarises the subject-free limiter scopes as one line each',
        () =>
          Effect.gen(function* () {
            yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            yield* memory.seed(DENIED_SCOPE_COUNTS_KEY, {
              sign_in_address: '7',
              storage_read: '3',
            });

            const logs = collectLogs();
            yield* runSummary(`test-summary-${randomUUID()}`).pipe(
              Effect.provide(logs.layer),
            );

            assert.include(
              logs.messages.join('\n'),
              'Rate limit refused 7 call(s) in scope sign_in_address.',
            );
            assert.include(
              logs.messages.join('\n'),
              'Rate limit refused 3 call(s) in scope storage_read.',
            );
            assert.isFalse(yield* memory.exists(DENIED_SCOPE_COUNTS_KEY));
          }),
      );

      it.effect('completes and says so when no store is configured', () =>
        Effect.gen(function* () {
          yield* startCase();
          const logs = collectLogs();
          const outcome = yield* runSummary(
            `test-summary-${randomUUID()}`,
          ).pipe(
            Effect.provide(DeniedAttemptsStore.layer),
            Effect.provide(RateLimitStore.layerAbsent),
            Effect.provide(logs.layer),
          );
          assert.strictEqual(outcome, 'completed');
          assert.include(
            logs.messages.join('\n'),
            'no rate limit store is configured',
          );
        }),
      );

      it.effect(
        'discards a window whose operation this build does not know',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const { teamId, actorId } = yield* seedActor();
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* seedWindow({
              keyPrefix,
              teamId,
              actorId,
              operation: 'audit.invented-by-a-later-release',
              count: 5,
              windowStart: at.closedAt,
            });

            yield* runSummary(keyPrefix);

            assert.deepStrictEqual(yield* summariesFor(teamId), []);
            assert.isFalse(yield* memory.exists(key));
            assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
          }),
      );

      it.effect('discards a window whose actor no longer exists', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          const { teamId } = yield* seedActor();
          const keyPrefix = `test-summary-${randomUUID()}`;
          const key = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId: `actor-${randomUUID().slice(0, 8)}`,
            count: 9,
            windowStart: at.closedAt,
          });

          yield* runSummary(keyPrefix);

          assert.deepStrictEqual(yield* summariesFor(teamId), []);
          assert.isFalse(yield* memory.exists(key));
          assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
        }),
      );

      it.effect('fails the job when the store itself rejects', () =>
        Effect.gen(function* () {
          yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          yield* memory.failOn('drain');
          const exit = yield* Effect.exit(
            runSummary(`test-summary-${randomUUID()}`),
          );
          yield* memory.failOn(null);
          assert.isTrue(Exit.isFailure(exit));
          const failure = Exit.isFailure(exit) ? causeError(exit.cause) : null;
          if (!(failure instanceof DeniedAttemptsStoreFailed)) {
            throw new Error(
              `expected the store's own failure, got ${String(failure)}`,
            );
          }
          assert.strictEqual(failure._tag, 'DeniedAttemptsStoreFailed');
          assert.strictEqual(failure.operation, 'drain');
        }),
      );

      it.effect(
        'counts a summary it wrote even when the claim cannot be given up',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const { teamId, actorId } = yield* seedActor();
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* seedWindow({
              keyPrefix,
              teamId,
              actorId,
              count: 11,
              windowStart: at.closedAt,
            });

            const logs = collectLogs();
            yield* memory.failOn('del');
            const outcome = yield* runSummary(keyPrefix).pipe(
              Effect.provide(logs.layer),
            );
            yield* memory.failOn(null);

            assert.strictEqual(outcome, 'completed');
            assert.deepInclude(yield* onlySummary(teamId), {
              suppressedCount: 11,
            });
            assert.include(
              logs.messages.join('\n'),
              'attempt 1: summary events 1, limiter scopes 0',
            );
            assert.include(
              logs.messages.join('\n'),
              'stays claimed for a later run',
            );
            assert.isTrue(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));

            yield* TestClock.adjust(LATER);
            yield* runSummary(keyPrefix);
            assert.lengthOf(yield* summariesFor(teamId), 1);
            assert.isFalse(yield* memory.exists(`${key}${CLAIMED_SUFFIX}`));
          }),
      );

      it.effect(
        'skips only the window whose write died, and summarises the rest',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const memory = yield* DeniedAttemptsMemory;
            const first = yield* seedActor();
            const second = yield* seedActor('Second Researcher');
            const keyPrefix = `test-summary-${randomUUID()}`;
            const dyingKey = yield* seedWindow({
              keyPrefix,
              teamId: first.teamId,
              actorId: first.actorId,
              count: 2,
              windowStart: at.closedAt,
            });
            const nextKey = yield* seedWindow({
              keyPrefix,
              teamId: second.teamId,
              actorId: second.actorId,
              count: 7,
              windowStart: at.closedAt,
            });

            const logs = collectLogs();
            const drop = yield* dieAtCommitFor(first.teamId);
            const outcome = yield* runSummary(keyPrefix).pipe(
              Effect.provide(logs.layer),
              Effect.ensuring(drop),
            );
            assert.strictEqual(outcome, 'completed');

            assert.deepStrictEqual(yield* summariesFor(first.teamId), []);
            assert.deepInclude(yield* onlySummary(second.teamId), {
              suppressedCount: 7,
              firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
              lastSuppressedAt: new Date(at.closedAt + 7_000).toISOString(),
            });
            assert.isTrue(yield* memory.exists(`${dyingKey}${CLAIMED_SUFFIX}`));
            assert.isFalse(yield* memory.exists(`${nextKey}${CLAIMED_SUFFIX}`));
            assert.include(logs.messages.join('\n'), 'summary events 1');
            assert.include(
              logs.messages.join('\n'),
              'stays claimed for a later run',
            );
          }),
      );

      it.effect('runs as a job the worker claims and settles', () =>
        Effect.gen(function* () {
          const at = yield* startCase();
          const memory = yield* DeniedAttemptsMemory;
          const { teamId, actorId } = yield* seedActor();
          const keyPrefix = `test-summary-${randomUUID()}`;
          const key = yield* seedWindow({
            keyPrefix,
            teamId,
            actorId,
            count: 8,
            windowStart: at.closedAt,
          });

          const step = yield* onWorker((worker) =>
            Effect.gen(function* () {
              const jobs = yield* Jobs;
              yield* worker.work(
                'denied-attempts-summary',
                deniedAttemptsSummary({ keyPrefix, windowMs: WINDOW_MS }),
              );
              yield* MaintenanceScope.open(
                jobs.enqueue('denied-attempts-summary', {}),
              );
              return yield* worker.drainOnce('denied-attempts-summary');
            }),
          );

          assert.strictEqual(step._tag, 'settled');
          assert.deepInclude(yield* onlySummary(teamId), {
            suppressedCount: 8,
          });
          assert.isFalse(yield* memory.exists(key));
        }),
      );

      it.effect.skipIf(!redisUrl)(
        'summarises a window the limiter itself suppressed',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const { teamId, actorId } = yield* seedActor();
            const store = yield* openStore;
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* suppressInValkey({
              store,
              keyPrefix,
              teamId,
              actorId,
              count: 4,
              windowStart: at.closedAt,
            });

            const outcome = yield* runSummary(keyPrefix).pipe(
              Effect.provide(DeniedAttemptsStore.layer),
              Effect.provideService(RateLimitStore, store),
            );
            assert.strictEqual(outcome, 'completed');

            assert.deepInclude(yield* onlySummary(teamId), {
              operation: OPERATION,
              suppressedCount: 4,
              firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
              lastSuppressedAt: new Date(at.closedAt + 4_000).toISOString(),
            });

            const left = yield* store.run((redis) =>
              redis.exists(key, `${key}${CLAIMED_SUFFIX}`),
            );
            assert.strictEqual(left, 0);
          }),
      );

      it.effect.skipIf(!redisUrl)(
        'writes one event when two runs race the same window at a real Valkey',
        () =>
          Effect.gen(function* () {
            const at = yield* startCase();
            const { teamId, actorId } = yield* seedActor();
            const store = yield* openStore;
            const keyPrefix = `test-summary-${randomUUID()}`;
            const key = yield* suppressInValkey({
              store,
              keyPrefix,
              teamId,
              actorId,
              count: 3,
              windowStart: at.closedAt,
            });

            yield* Effect.all([runSummary(keyPrefix), runSummary(keyPrefix)], {
              concurrency: 'unbounded',
            }).pipe(
              Effect.provide(DeniedAttemptsStore.layer),
              Effect.provideService(RateLimitStore, store),
            );

            assert.deepInclude(yield* onlySummary(teamId), {
              suppressedCount: 3,
              firstSuppressedAt: new Date(at.closedAt + 1_000).toISOString(),
            });
            const left = yield* store.run((redis) =>
              redis.exists(key, `${key}${CLAIMED_SUFFIX}`),
            );
            assert.strictEqual(left, 0);
          }),
      );
    });
  },
);
