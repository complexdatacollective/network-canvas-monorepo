import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { DeniedAuditRateLimiter } from '../denial-rate-limit.ts';
import { createDeniedAuditSummaryWriter } from '../denial-summary.ts';

const db = await reachableDb();

describe.skipIf(!db)('denied audit summary', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
  });

  afterAll(async () => {
    await dispose();
  });

  it('flushes one immutable pending summary before shutdown', async () => {
    const teamId = 'denied-summary-team';
    await seedTeam(pool, teamId);
    const principal: SessionPrincipal = {
      kind: 'user',
      userId: 'denied-summary-actor',
      email: 'denied-summary@example.com',
      emailVerified: true,
      name: 'Denied Summary Actor',
      locale: null,
      sessionId: 'denied-summary-session',
    };
    let now = Date.parse('2026-08-31T10:00:00.000Z');
    let scheduled: (() => void) | undefined;
    let summaryTimerCancelled = false;
    let summaryTransactionCount = 0;
    const tenantDb = createTenantDb(app, teamId);
    const summaryWritten = Promise.withResolvers<void>();
    const writer = createDeniedAuditSummaryWriter(
      {
        tenantDb: {
          ...tenantDb,
          transaction: async (work, options) => {
            summaryTransactionCount += 1;
            return tenantDb.transaction(work, options);
          },
        },
        principal,
        requestId: randomUUID(),
      },
      'team.updateMemberRole',
    );
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => now,
      schedule: (task) => {
        scheduled = task;
        return () => {
          summaryTimerCancelled = true;
        };
      },
      onSummaryError: summaryWritten.reject,
    });
    const first = await limiter.reserve('actor/team/operation');
    if (!first.admitted) throw new Error('expected admitted reservation');
    first.complete('denied');

    now += 10_000;
    expect(
      await limiter.reserve('actor/team/operation', async (summary) => {
        await writer(summary);
        summaryWritten.resolve();
      }),
    ).toEqual({ admitted: false, reason: 'rate_limited' });
    now += 20_000;
    expect(await limiter.reserve('actor/team/operation')).toEqual({
      admitted: false,
      reason: 'rate_limited',
    });

    expect(summaryTransactionCount).toBe(0);
    if (!scheduled) throw new Error('expected a scheduled summary');
    await expect(limiter.flush()).resolves.toBe(true);
    await summaryWritten.promise;

    expect(summaryTimerCancelled).toBe(true);
    expect(summaryTransactionCount).toBe(1);
    const events = await pool.query<{
      id: string;
      event_type: string;
      category: string;
      outcome: string;
      actor_id: string;
      details: unknown;
    }>(
      `SELECT id, event_type, category, outcome, actor_id, details
         FROM audit_events WHERE team_id = $1`,
      [teamId],
    );
    expect(events.rows).toEqual([
      {
        id: expect.any(String),
        event_type: 'security.denied_attempts.rate_limited',
        category: 'security',
        outcome: 'denied',
        actor_id: principal.userId,
        details: {
          operation: 'team.updateMemberRole',
          suppressedCount: 2,
          firstSuppressedAt: '2026-08-31T10:00:10.000Z',
          lastSuppressedAt: '2026-08-31T10:00:30.000Z',
        },
      },
    ]);
    await expect(
      pool.query(`UPDATE audit_events SET outcome = 'failed' WHERE id = $1`, [
        events.rows[0]!.id,
      ]),
    ).rejects.toThrow('audit events are immutable');
  });
});
