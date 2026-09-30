import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { describe } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { appendDeniedAuditSummary } from '../denial-summary.ts';

// What a suppressed window becomes in the log. Who calls this changed with
// #1909 — it is the worker's summary job now, not the web process at shutdown
// (src/jobs/handlers/__tests__/denied-attempts-summary.test.ts covers that end
// to end) — and how it writes changed with #1927 stage 3: the node-postgres
// writer seam is gone, and the append goes through `audit/store.ts` on the
// worker's own maintenance client. What it writes did not change, and the row
// it writes is immutable, which is the property this file exists for.

const FIRST = '2026-08-31T10:00:10.000Z';
const LAST = '2026-08-31T10:00:30.000Z';

describe.skipIf(!testDb)('a denied-attempts summary', () => {
  layer(TestDatabaseLive)('on the maintenance client', (suite) => {
    suite.effect(
      'is one immutable event naming how many attempts were suppressed',
      () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = `denied-summary-${randomUUID().slice(0, 8)}`;
          yield* harness.onOwner(
            harness.owner.sql`insert into teams (id, name, slug)
                              values (${teamId}, 'Summary Team', ${teamId})`,
          );

          const actor: SessionPrincipal = {
            kind: 'user',
            userId: `actor-${randomUUID().slice(0, 8)}`,
            email: 'denied-summary@example.com',
            emailVerified: true,
            name: 'Denied Summary Actor',
            locale: null,
            // No session to name: the attempts this summarises were made in
            // sessions that ended before the window did.
            sessionId: '',
          };

          yield* appendDeniedAuditSummary({
            teamId,
            operation: 'team.updateMemberRole',
            actor,
            summary: {
              suppressedCount: 2,
              firstSuppressedAt: Date.parse(FIRST),
              lastSuppressedAt: Date.parse(LAST),
            },
          });

          const events = yield* harness.onOwner(
            harness.owner.sql<{
              id: string;
              event_type: string;
              category: string;
              outcome: string;
              actor_id: string;
              actor_label: string;
              team_label: string;
              details: Record<string, unknown>;
            }>`select id, event_type, category, outcome, actor_id, actor_label,
                      team_label, details
                 from audit_events where team_id = ${teamId}`,
          );
          assert.lengthOf(events, 1);
          const event = events[0]!;
          assert.strictEqual(
            event.event_type,
            'security.denied_attempts.rate_limited',
          );
          assert.strictEqual(event.category, 'security');
          assert.strictEqual(event.outcome, 'denied');
          assert.strictEqual(event.actor_id, actor.userId);
          assert.strictEqual(event.actor_label, actor.name);
          // The label read under `FOR UPDATE` by the same store function
          // `audited` uses, so a summary names its team exactly as every other
          // event in the log does.
          assert.strictEqual(event.team_label, 'Summary Team');
          assert.deepStrictEqual(event.details, {
            operation: 'team.updateMemberRole',
            suppressedCount: 2,
            firstSuppressedAt: FIRST,
            lastSuppressedAt: LAST,
          });

          const amended = yield* Effect.exit(
            harness.onOwner(
              harness.owner
                .sql`update audit_events set outcome = 'failed' where id = ${event.id}`,
            ),
          );
          assert.isTrue(Exit.isFailure(amended));
        }),
      { timeout: 30_000 },
    );
  });
});
