import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { stubAuthService } from '../../__tests__/support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { createRpcClient } from '../../__tests__/support/rpc.ts';
import { createApp } from '../../app.ts';
import type { AssetStore } from '../../assets.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { stampFingerprint } from '../../db/schema.ts';
import { seed } from '../../db/seed.ts';
import { readEnv } from '../../env.ts';
import { BoundedProbe, withProbeClient } from '../bounded-probe.ts';
import { createOperationalLogger } from '../logger.ts';
import { createQueueProbe } from '../queues.ts';
import { createReadiness } from '../readiness.ts';
import { createObservability } from '../runtime.ts';

const db = await reachableDb();
const store: AssetStore = {
  checkHealth: async () => {},
  put: async () => {
    throw new Error('unused');
  },
  get: async () => null,
};
const CANARY = 'participant@example.test-Token-Answer-Protocol-Export';

describe.skipIf(!db)(
  'operational probes against isolated PostgreSQL schemas',
  () => {
    let scratch: Awaited<ReturnType<typeof createScratchSchema>>;
    beforeAll(async () => {
      if (!db) throw new Error('unreachable');
      scratch = await createScratchSchema(db);
      await provisionScratchSchema(scratch.pool);
    });
    afterAll(async () => {
      await scratch?.dispose();
    });

    it('checks the current fingerprint on subsequent probes and never changes liveness', async () => {
      const runtime = createObservability({
        pool: scratch.app,
        assetStore: store,
        cacheMs: 0,
      });
      const app = createApp(readEnv(), {
        pool: scratch.app,
        assetStore: store,
        observability: runtime,
      });
      try {
        expect((await app.request('/readyz')).status).toBe(200);
        await stampFingerprint(scratch.pool, CANARY);
        const stale = await app.request('/readyz');
        expect(stale.status).toBe(503);
        expect(await stale.json()).toEqual({
          status: 'not_ready',
          checks: { database: 'ok', object_store: 'ok', schema: 'stale' },
        });
        expect((await app.request('/healthz')).status).toBe(200);
      } finally {
        await stampFingerprint(scratch.pool, SCHEMA_FINGERPRINT);
      }
      expect((await app.request('/readyz')).status).toBe(200);
      runtime.stop();
    });

    it('fails readiness when object storage fails or is not configured', async () => {
      const failing = createReadiness({
        pool: scratch.app,
        assetStore: {
          ...store,
          checkHealth: () => Promise.reject(new Error(CANARY)),
        },
        cacheMs: 0,
      });
      expect(await failing.check()).toEqual({
        status: 'not_ready',
        checks: { database: 'ok', object_store: 'failed', schema: 'current' },
      });
      const missing = createReadiness({ pool: scratch.app });
      expect((await missing.check()).checks.object_store).toBe('unconfigured');
      failing.stop();
      missing.stop();
    });

    it('reports an absent schema and a closed database as not ready', async () => {
      if (!db) throw new Error('unreachable');
      const empty = await createScratchSchema(db);
      const readiness = createReadiness({
        pool: empty.pool,
        assetStore: store,
        cacheMs: 0,
      });
      try {
        expect(await readiness.check()).toEqual({
          status: 'not_ready',
          checks: { database: 'ok', object_store: 'ok', schema: 'absent' },
        });
        await empty.pool.end();
        expect(await readiness.check()).toEqual({
          status: 'not_ready',
          checks: { database: 'failed', object_store: 'ok', schema: 'failed' },
        });
      } finally {
        readiness.stop();
        // pg rejects a second end; disposal still owns all the other resources.
        const end = vi.spyOn(empty.pool, 'end').mockResolvedValue(undefined);
        await empty.dispose();
        end.mockRestore();
      }
    });

    it('cancels a running PostgreSQL query at its deadline and releases the slot', async () => {
      const probe = new BoundedProbe(
        (signal) =>
          withProbeClient(scratch.app, signal, (client) =>
            client.query('SELECT pg_sleep(10)'),
          ),
        25,
        0,
      );
      expect(await probe.check()).toEqual({ status: 'timeout' });
      await vi.waitFor(() =>
        expect(scratch.app.totalCount - scratch.app.idleCount).toBe(0),
      );
      expect(
        (
          await createReadiness({
            pool: scratch.app,
            assetStore: store,
            cacheMs: 0,
          }).check()
        ).status,
      ).toBe('ready');
      probe.stop();
    });

    it('holds at most one waiting pool checkout across repeated timed-out readiness requests', async () => {
      const occupied = await Promise.all(
        Array.from({ length: scratch.app.options.max! }, () =>
          scratch.app.connect(),
        ),
      );
      const readiness = createReadiness({
        pool: scratch.app,
        assetStore: store,
        timeoutMs: 20,
        cacheMs: 0,
      });
      try {
        expect((await readiness.check()).checks.database).toBe('timeout');
        expect(scratch.app.waitingCount).toBe(1);
        for (let attempt = 0; attempt < 30; attempt += 1) {
          expect((await readiness.check()).status).toBe('not_ready');
          expect(scratch.app.waitingCount).toBe(1);
        }
      } finally {
        for (const client of occupied) client.release();
      }
      await vi.waitFor(() => expect(scratch.app.waitingCount).toBe(0));
      await vi.waitFor(async () =>
        expect((await readiness.check()).status).toBe('ready'),
      );
      readiness.stop();
    });

    it('refuses application-role queue reads and collects all actual empty schema shapes as zero', async () => {
      const denied = createQueueProbe(scratch.app, 2000, 0);
      expect(await denied.check()).toEqual({ status: 'failed' });
      const result = await createQueueProbe(
        scratch.maintenance,
        2000,
        0,
      ).check();
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') throw new Error('queue collection failed');
      expect(result.value.map((row) => row.queue).toSorted()).toEqual([
        'audit_alert_outbox',
        'audit_export_jobs',
        'message_deliveries',
        'study_stage_rollups',
        'study_wave_rollups',
        'team_invitation_deliveries',
        'webhook_deliveries',
      ]);
      for (const row of result.value)
        expect(row).toEqual({
          queue: row.queue,
          pending: 0,
          ready: 0,
          oldest_ready_seconds: 0,
          last_failure_timestamp_seconds: 0,
          leased: 0,
          expired_leases: 0,
          failed: 0,
          uncertain: 0,
          suppressed: 0,
        });
    });

    it('maps each durable queue and both dirty rollup worklists without exporting payloads', async () => {
      // Existing realistic synthetic fixtures supply the relational parents.
      // They are confined to this newly-created scratch schema.
      await seed(scratch.pool, { scale: 'tiny' });
      const expected = new Map<
        string,
        {
          pending: number;
          ready: number;
          leased: number;
          failed: number;
          uncertain: number;
        }
      >();
      for (const queue of [
        'message_deliveries',
        'webhook_deliveries',
      ] as const) {
        const result = await scratch.pool.query<{ id: string }>(
          `UPDATE ${queue} SET ${queue === 'message_deliveries' ? 'sent_at = NULL, suppressed_at = NULL, uncertain_at = NULL' : 'delivered_at = NULL'}, failed_at = NULL, lease_owner = NULL, lease_expires_at = NULL, available_at = now() - interval '10 minutes', last_error = $1 RETURNING id`,
          [CANARY],
        );
        expect(result.rows.length).toBeGreaterThan(4);
        const ids = result.rows.map((row) => row.id);
        await scratch.pool.query(
          `UPDATE ${queue} SET failed_at = now() WHERE id = $1`,
          [ids[0]],
        );
        await scratch.pool.query(
          `UPDATE ${queue} SET lease_owner = $2, lease_expires_at = now() + interval '1 hour' WHERE id = $1`,
          [ids[1], randomUUID()],
        );
        await scratch.pool.query(
          `UPDATE ${queue} SET available_at = now() + interval '1 day' WHERE id = $1`,
          [ids[2]],
        );
        const uncertain = queue === 'message_deliveries' ? 1 : 0;
        if (uncertain)
          await scratch.pool.query(
            'UPDATE message_deliveries SET uncertain_at = now() WHERE id = $1',
            [ids[3]],
          );
        expected.set(queue, {
          pending: ids.length - 1 - uncertain,
          ready: ids.length - 3 - uncertain,
          leased: 1,
          failed: 1,
          uncertain,
        });
      }
      for (const queue of [
        'study_wave_rollups',
        'study_stage_rollups',
      ] as const) {
        const updated = await scratch.pool.query(
          `UPDATE ${queue} SET stale_at = now() - interval '10 minutes'`,
        );
        expect(updated.rowCount).toBeGreaterThan(0);
        expected.set(queue, {
          pending: updated.rowCount!,
          ready: updated.rowCount!,
          leased: 0,
          failed: 0,
          uncertain: 0,
        });
      }
      await scratch.pool.query(
        `INSERT INTO audit_export_jobs (id, team_id, actor_kind, actor_id, start_event_id, start_event_sequence, high_water_sequence, filters, row_limit, byte_limit, preflight_row_count, preflight_byte_count, available_at)
      VALUES ($1, 'operator-test-team', 'user', $2, $3, 1, 10, '{}', 1000, 1000000, 10, 2048, now() - interval '10 minutes')`,
        [randomUUID(), CANARY, randomUUID()],
      );
      expected.set('audit_export_jobs', {
        pending: 1,
        ready: 1,
        leased: 0,
        failed: 0,
        uncertain: 0,
      });
      await scratch.pool.query(
        `INSERT INTO audit_alert_outbox (id, team_id, audit_event_id, audit_event_sequence, event_type, event_version, alert_policy_key, available_at)
      SELECT $1, team_id, id, sequence, event_type, event_version, 'operator-test', now() - interval '10 minutes' FROM audit_events LIMIT 1`,
        [randomUUID()],
      );
      expected.set('audit_alert_outbox', {
        pending: 1,
        ready: 1,
        leased: 0,
        failed: 0,
        uncertain: 0,
      });

      const invitation = await scratch.pool.query<{
        id: string;
        team_id: string;
        email: string;
        role: string;
        expires_at: Date;
      }>(
        `INSERT INTO team_invitations (id, team_id, email, role, status, expires_at, inviter_id) SELECT $1, team_id, $2, 'member', 'pending', now() + interval '1 day', user_id FROM team_members WHERE role = 'owner' LIMIT 1 RETURNING id, team_id, email, role, expires_at`,
        [randomUUID(), CANARY],
      );
      const row = invitation.rows[0];
      expect(row).toBeDefined();
      if (!row) throw new Error('seed must include an invitation');
      await scratch.pool.query(
        `INSERT INTO team_invitation_deliveries (id, invitation_id, team_id, email, role, team_label, inviter_label, expires_at, available_at, uncertain_at, last_error)
      VALUES ($1, $2, $3, $4, $5, 'team', 'inviter', $6, now() - interval '10 minutes', now(), $7)`,
        [
          randomUUID(),
          row.id,
          row.team_id,
          row.email,
          row.role,
          row.expires_at,
          CANARY,
        ],
      );
      expected.set('team_invitation_deliveries', {
        pending: 0,
        ready: 0,
        leased: 0,
        failed: 0,
        uncertain: 1,
      });

      const result = await createQueueProbe(
        scratch.maintenance,
        2000,
        0,
      ).check();
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') throw new Error('queue collection failed');
      expect(result.value).toHaveLength(expected.size);
      for (const snapshot of result.value) {
        expect(snapshot).toMatchObject(expected.get(snapshot.queue)!);
        if (snapshot.ready > 0)
          expect(snapshot.oldest_ready_seconds).toBeGreaterThanOrEqual(600);
        else expect(snapshot.oldest_ready_seconds).toBe(0);
      }
      const runtime = createObservability({
        pool: scratch.app,
        maintenancePool: scratch.maintenance,
        assetStore: store,
        cacheMs: 0,
      });
      const metrics = await runtime.metrics.scrape();
      expect(metrics.body).toContain(
        'studio_outbox_jobs{queue="team_invitation_deliveries",state="uncertain"} 1',
      );
      expect(metrics.body).toContain('studio_outbox_collection_success 1');
      expect(metrics.body).not.toContain(CANARY);
      expect(metrics.body).not.toContain(row.email);
      const down = vi
        .spyOn(scratch.maintenance, 'connect')
        .mockRejectedValue(new Error(CANARY));
      try {
        const failed = await runtime.metrics.scrape();
        expect(failed.body).toContain('studio_outbox_collection_success 0');
        expect(failed.body).not.toContain('studio_outbox_jobs{');
        expect(failed.body).not.toContain(CANARY);
      } finally {
        down.mockRestore();
      }
      runtime.stop();
    });

    it('reports durable failure time across restart and retains old failures without restamping them', async () => {
      if (!db) throw new Error('unreachable');
      const isolated = await createScratchSchema(db);
      let runtime: ReturnType<typeof createObservability> | undefined;
      try {
        await provisionScratchSchema(isolated.pool);
        const failure = await isolated.pool.query<{ failed_at: Date }>(
          `INSERT INTO audit_export_jobs (id, team_id, actor_kind, actor_id, start_event_id, start_event_sequence, high_water_sequence, filters, row_limit, byte_limit, preflight_row_count, preflight_byte_count, status, failure_event_id, failed_at)
          VALUES ($1, 'operational-failure-team', 'user', $2, $3, 1, 10, '{}', 1000, 1000000, 10, 2048, 'failed', $4, date_trunc('second', now()) - interval '1 minute') RETURNING failed_at`,
          [randomUUID(), CANARY, randomUUID(), randomUUID()],
        );
        // A retained older row must not hide the newest failure, regardless
        // of insertion order or how many historical failures remain.
        await isolated.pool.query(
          `INSERT INTO audit_export_jobs (id, team_id, actor_kind, actor_id, start_event_id, start_event_sequence, high_water_sequence, filters, row_limit, byte_limit, preflight_row_count, preflight_byte_count, status, failure_event_id, failed_at)
          SELECT $1, team_id, actor_kind, actor_id, start_event_id, start_event_sequence, high_water_sequence, filters, row_limit, byte_limit, preflight_row_count, preflight_byte_count, status, failure_event_id, failed_at - interval '1 day' FROM audit_export_jobs`,
          [randomUUID()],
        );
        const failedAt = failure.rows[0]?.failed_at;
        expect(failedAt).toBeInstanceOf(Date);
        if (!failedAt) throw new Error('expected one durable failure');
        const openRuntime = () =>
          createObservability({
            pool: isolated.app,
            maintenancePool: isolated.maintenance,
            assetStore: store,
            cacheMs: 0,
          });
        const sample = `studio_outbox_last_failure_timestamp_seconds{queue="audit_export_jobs"} ${failedAt.getTime() / 1000}`;
        runtime = openRuntime();
        const initial = (await runtime.metrics.scrape()).body;
        expect(initial).toContain(sample);
        expect(initial).toContain(
          'studio_outbox_jobs{queue="audit_export_jobs",state="failed"} 2',
        );
        expect(initial).not.toContain('studio_outbox_dispatch_results_total{');
        expect(initial).not.toContain(CANARY);
        expect(initial).not.toMatch(
          /team_id|request_id|participant_id|actor_id|message_id/,
        );
        runtime.stop();
        runtime = openRuntime();
        expect((await runtime.metrics.scrape()).body).toContain(sample);

        const aged = await isolated.pool.query<{ failed_at: Date }>(
          `UPDATE audit_export_jobs SET failed_at = date_trunc('second', now()) - interval '1 day' RETURNING failed_at`,
        );
        const old = aged.rows[0]?.failed_at;
        expect(old).toBeInstanceOf(Date);
        if (!old) throw new Error('expected retained old failure');
        const retained = (await runtime.metrics.scrape()).body;
        expect(retained).toContain(
          `studio_outbox_last_failure_timestamp_seconds{queue="audit_export_jobs"} ${old.getTime() / 1000}`,
        );
        expect(retained).toContain(
          'studio_outbox_jobs{queue="audit_export_jobs",state="failed"} 2',
        );
        expect(retained).not.toContain(sample);
        const future = await isolated.pool.query<{ failed_at: Date }>(
          `UPDATE audit_export_jobs SET failed_at = date_trunc('second', now()) + interval '1 hour' RETURNING failed_at`,
        );
        const ahead = future.rows[0]?.failed_at;
        expect(ahead).toBeInstanceOf(Date);
        if (!ahead) throw new Error('expected clock-skew fixture');
        expect(ahead.getTime()).toBeGreaterThan(Date.now());
        expect((await runtime.metrics.scrape()).body).toContain(
          `studio_outbox_last_failure_timestamp_seconds{queue="audit_export_jobs"} ${ahead.getTime() / 1000}`,
        );
        const unavailable = vi
          .spyOn(isolated.maintenance, 'connect')
          .mockRejectedValue(new Error(CANARY));
        try {
          const down = (await runtime.metrics.scrape()).body;
          expect(down).toContain('studio_outbox_collection_success 0');
          expect(down).not.toContain(
            'studio_outbox_last_failure_timestamp_seconds{',
          );
          expect(down).not.toContain(CANARY);
        } finally {
          unavailable.mockRestore();
        }
      } finally {
        runtime?.stop();
        await isolated.dispose();
      }
    });

    it('correlates authorized team RPCs with the same id stored in immutable audit history', async () => {
      const teamId = `observability-${randomUUID()}`;
      const userId = `actor-${randomUUID()}`;
      await scratch.pool.query(
        'INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1)',
        [teamId],
      );
      await scratch.pool.query(
        'INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)',
        [userId, CANARY, `${randomUUID()}@example.test`],
      );
      await scratch.pool.query(
        "INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, 'owner')",
        [randomUUID(), teamId, userId],
      );
      const lines: Record<string, unknown>[] = [];
      const logger = createOperationalLogger({
        write(line) {
          lines.push(JSON.parse(line) as Record<string, unknown>);
        },
      });
      const app = createApp(readEnv(), {
        pool: scratch.app,
        logger,
        auth: stubAuthService({
          getSession: () =>
            Promise.resolve({
              kind: 'user',
              userId,
              name: CANARY,
              email: CANARY,
              emailVerified: true,
              sessionId: CANARY,
              locale: 'en',
            }),
          getMembership: (_user, team) =>
            Promise.resolve(team === teamId ? { role: 'owner' } : null),
        }),
      });
      const rpc = createRpcClient(app, {
        'x-team-id': CANARY,
        'x-request-id': randomUUID(),
      });
      await expect(
        rpc.studies.list({ teamId: 'forged-team' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(lines[0]).not.toHaveProperty('team_id');
      await rpc.studies.create({
        teamId,
        studyId: randomUUID(),
        protocolId: randomUUID(),
        draftId: randomUUID(),
        name: 'Operational test study',
      });
      const logged = lines.at(-1)!;
      expect(logged).toMatchObject({
        team_id: teamId,
        status: 200,
        route: '/rpc/studies/create',
      });
      const events = await scratch.pool.query<{ request_id: string }>(
        'SELECT request_id FROM audit_events WHERE team_id = $1',
        [teamId],
      );
      expect(events.rows).toHaveLength(2);
      expect(events.rows).toEqual([
        { request_id: logged.request_id },
        { request_id: logged.request_id },
      ]);
      expect(JSON.stringify(lines)).not.toContain(CANARY);
    });
  },
);
