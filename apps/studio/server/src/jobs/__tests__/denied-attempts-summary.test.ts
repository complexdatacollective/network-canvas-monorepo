import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { JOB_QUEUES, JOB_SCHEDULES } from '@codaco/studio-sync/jobs';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import {
  reachableRedis,
  REDIS_DATABASES,
} from '../../__tests__/support/valkey.ts';
import { DeniedAuditRateLimiter } from '../../audit/denial-rate-limit.ts';
import { DENIED_SCOPE_COUNTS_KEY } from '../../rate-limit.ts';
import {
  createRateLimitStore,
  type RateLimitStore,
} from '../../rate-limit/store.ts';
import { createDeniedAttemptsSummaryHandler } from '../handlers/denied-attempts-summary.ts';
import type { HandledJob } from '../handlers/job.ts';

// The job that turns what the limiters suppressed into the record of it
// (#1909). It replaces the flush the web process used to run at shutdown,
// which a container killed rather than stopped never got to.

const db = await reachableDb();
const redis = await reachableRedis(REDIS_DATABASES.summaryJob);

const WINDOW_MS = 60_000;
/**
 * A closed window, aligned to a window boundary. Far enough back that the job
 * will take it by any clock, and aligned because the cases below place their
 * suppressed attempts a few seconds apart: from an unaligned start those
 * seconds could cross into the next minute, which is a different key and a
 * different window, and the case would be asserting about two of them.
 */
const CLOSED_WINDOW_AT =
  Math.floor((Date.now() - 5 * WINDOW_MS) / WINDOW_MS) * WINDOW_MS;

const OPERATION = 'audit.read';

function job(): HandledJob {
  return { id: randomUUID(), data: {}, retryCount: 0, retryLimit: 0 };
}

describe('the summary queue declaration', () => {
  it('is a singleton on a one-minute schedule', () => {
    // Two runs at once would scan the same keys. The claim inside the job is
    // what makes a double write impossible; this is what makes a double run
    // unlikely in the first place, and it is the same policy the other
    // scanning job (protocol-store-gc) takes.
    const queue = JOB_QUEUES.find(
      ({ name }) => name === 'denied-attempts-summary',
    );
    expect(queue?.options.policy).toBe('singleton');
    expect(
      JOB_SCHEDULES.find(
        ({ queue: name }) => name === 'denied-attempts-summary',
      ),
    ).toMatchObject({ cron: '* * * * *' });
  });
});

describe.skipIf(!db || !redis)('the denied-attempts summary job', () => {
  let pool: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let store: RateLimitStore;

  beforeAll(async () => {
    if (!db || !redis) throw new Error('unreachable: the probes guaranteed');
    ({ pool, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    store = createRateLimitStore(redis);
  });

  afterAll(async () => {
    await store.close();
    await dispose();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A team, an actor, and a window of theirs that suppressed `count` attempts. */
  async function suppressedWindow(count: number) {
    const teamId = `team-${randomUUID().slice(0, 8)}`;
    const actorId = `actor-${randomUUID().slice(0, 8)}`;
    await seedTeam(pool, teamId);
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [actorId, 'Denied Researcher', `${actorId}@example.org`],
    );

    const keyPrefix = `test-summary-${randomUUID()}`;
    let clock = CLOSED_WINDOW_AT;
    const limiter = new DeniedAuditRateLimiter({
      store,
      limit: 1,
      windowMs: WINDOW_MS,
      keyPrefix,
      now: () => clock,
    });
    const input = { teamId, actorId, operation: OPERATION };

    const admitted = await limiter.reserve(input);
    if (!admitted.admitted) throw new Error('expected an admission');
    await admitted.complete('denied');

    for (let attempt = 0; attempt < count; attempt += 1) {
      clock = CLOSED_WINDOW_AT + 1_000 * (attempt + 1);
      expect((await limiter.reserve(input)).admitted).toBe(false);
    }

    return { teamId, actorId, keyPrefix, key: limiter.keyFor(input) };
  }

  const handlerFor = (keyPrefix: string) =>
    createDeniedAttemptsSummaryHandler({
      maintenancePool: maintenance,
      store,
      keyPrefix,
      windowMs: WINDOW_MS,
    });

  const summariesFor = (teamId: string) =>
    pool
      .query<{ event_type: string; outcome: string; details: unknown }>(
        `SELECT event_type, outcome, actor_id, details
           FROM audit_events WHERE team_id = $1`,
        [teamId],
      )
      .then((result) => result.rows);

  it('turns a suppressed burst into exactly one summary event', async () => {
    const { teamId, actorId, keyPrefix, key } = await suppressedWindow(12);

    await handlerFor(keyPrefix)([job()]);

    expect(await summariesFor(teamId)).toEqual([
      {
        event_type: 'security.denied_attempts.rate_limited',
        outcome: 'denied',
        actor_id: actorId,
        details: {
          operation: OPERATION,
          suppressedCount: 12,
          firstSuppressedAt: new Date(CLOSED_WINDOW_AT + 1_000).toISOString(),
          lastSuppressedAt: new Date(CLOSED_WINDOW_AT + 12_000).toISOString(),
        },
      },
    ]);
    // The window is drained, so a second run has nothing to say about it.
    expect(await store.run((client) => client.exists(key))).toBe(0);
    await handlerFor(keyPrefix)([job()]);
    expect(await summariesFor(teamId)).toHaveLength(1);
  });

  it('writes one event even when two workers run at once', async () => {
    // The claim is a read-and-delete in one Valkey execution, so only the run
    // that got the contents can write them. pg-boss's singleton policy makes
    // this rare; the claim makes it impossible.
    const { teamId, keyPrefix } = await suppressedWindow(4);

    await Promise.all([
      handlerFor(keyPrefix)([job()]),
      handlerFor(keyPrefix)([job()]),
    ]);

    const rows = await summariesFor(teamId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.details).toMatchObject({ suppressedCount: 4 });
  });

  it('leaves a window whose minute has not ended alone', async () => {
    const teamId = `team-${randomUUID().slice(0, 8)}`;
    const actorId = `actor-${randomUUID().slice(0, 8)}`;
    await seedTeam(pool, teamId);
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [actorId, 'Live Researcher', `${actorId}@example.org`],
    );
    const keyPrefix = `test-summary-${randomUUID()}`;
    // A window that has certainly not ended. The current minute would do, and
    // would be flaky for one second in every sixty: a case that runs as the
    // minute turns over would find the job entitled to the window after all.
    const limiter = new DeniedAuditRateLimiter({
      store,
      limit: 1,
      windowMs: WINDOW_MS,
      keyPrefix,
      now: () => Date.now() + WINDOW_MS,
    });
    const input = { teamId, actorId, operation: OPERATION };
    const admitted = await limiter.reserve(input);
    if (!admitted.admitted) throw new Error('expected an admission');
    await admitted.complete('denied');
    expect((await limiter.reserve(input)).admitted).toBe(false);

    await handlerFor(keyPrefix)([job()]);

    // Nothing written and nothing deleted: a live window is still collecting,
    // and summarising it now would report a burst that is still happening.
    expect(await summariesFor(teamId)).toEqual([]);
    expect(
      await store.run((client) => client.exists(limiter.keyFor(input))),
    ).toBe(1);
  });

  it('summarises the subject-free limiter scopes as one line each', async () => {
    // A refused sign-in is refused before anyone knows whose it was, and a
    // refused storage read belongs to no team. There is nowhere to write an
    // audit event, and the address is not something to write anywhere — so
    // the run says how many, per scope, and stops there.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await store.run((client) =>
      client.hset(DENIED_SCOPE_COUNTS_KEY, {
        sign_in_address: '7',
        storage_read: '3',
      }),
    );

    await handlerFor(`test-summary-${randomUUID()}`)([job()]);

    const lines = warn.mock.calls.map(([line]) => String(line));
    expect(lines).toContain(
      'Rate limit refused 7 call(s) in scope sign_in_address.',
    );
    expect(lines).toContain(
      'Rate limit refused 3 call(s) in scope storage_read.',
    );
    // Drained, so the next run does not report the same refusals again.
    expect(
      await store.run((client) => client.exists(DENIED_SCOPE_COUNTS_KEY)),
    ).toBe(0);
  });
});
