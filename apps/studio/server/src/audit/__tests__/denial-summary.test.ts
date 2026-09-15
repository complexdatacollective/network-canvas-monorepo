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
import { createDeniedAuditSummaryWriter } from '../denial-summary.ts';

// What a suppressed window becomes in the log. Who calls this changed with
// #1909 — it is the worker's summary job now, not the web process at shutdown
// (src/jobs/__tests__/denied-attempts-summary.test.ts covers that end to end)
// — but what it writes did not, and the row it writes is immutable, which is
// the property this file exists for.

const db = await reachableDb();

describe.skipIf(!db)('a denied-attempts summary', () => {
  let pool: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: the probe guaranteed a database');
    ({ pool, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
  });

  afterAll(async () => {
    await dispose();
  });

  it('is one immutable event naming how many attempts were suppressed', async () => {
    const teamId = `denied-summary-${randomUUID().slice(0, 8)}`;
    await seedTeam(pool, teamId);
    const principal: SessionPrincipal = {
      kind: 'user',
      userId: `actor-${randomUUID().slice(0, 8)}`,
      email: 'denied-summary@example.com',
      emailVerified: true,
      name: 'Denied Summary Actor',
      locale: null,
      sessionId: '',
    };

    // The maintenance pool, because a summary is written into a team no
    // request pinned — the attempts it describes are minutes old and the
    // sessions that made them are gone.
    const write = createDeniedAuditSummaryWriter(
      {
        tenantDb: createTenantDb(maintenance, teamId),
        principal,
        requestId: randomUUID(),
      },
      'team.updateMemberRole',
    );
    await write({
      suppressedCount: 2,
      firstSuppressedAt: Date.parse('2026-08-31T10:00:10.000Z'),
      lastSuppressedAt: Date.parse('2026-08-31T10:00:30.000Z'),
    });

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
