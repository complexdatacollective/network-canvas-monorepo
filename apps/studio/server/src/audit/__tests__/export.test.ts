import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import type { AuditExportArtifactStore } from '../../assets.ts';
import { loadTestKeys } from '../../pii/__tests__/fixtures.ts';
import type { AuditedCommandContext } from '../command.ts';
import {
  createAuditExportDispatcher,
  downloadAuditExport,
  readAuditExportStatus,
  requestAuditExport,
} from '../export.ts';

const db = await reachableDb();

describe.skipIf(!db)('staged audit export', () => {
  let owner: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let context: AuditedCommandContext;
  const objects = new Map<string, Uint8Array>();
  const store: AuditExportArtifactStore = {
    async putAuditExport(jobId, chunks) {
      const values: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of chunks) {
        values.push(chunk);
        size += chunk.byteLength;
      }
      const bytes = Buffer.concat(values, size);
      const key = `audit-exports/${jobId}.csv`;
      objects.set(key, bytes);
      return { key, size };
    },
    async getAuditExport(key) {
      const bytes = objects.get(key);
      return bytes ? new Blob([bytes]).stream() : null;
    },
    async deleteAuditExport(key) {
      objects.delete(key);
    },
  };

  beforeAll(async () => {
    if (!db) throw new Error('database required');
    ({
      pool: owner,
      app,
      maintenance,
      dispose,
    } = await createScratchSchema(db));
    await provisionScratchSchema(owner);
    await owner.query(`INSERT INTO "user" (id,name,email,"emailVerified")
      VALUES ('export-owner','Export Owner','owner@example.test',true);
      INSERT INTO teams (id,name,slug) VALUES ('export-team','Export Team','export-team');
      INSERT INTO team_members (id,team_id,user_id,role)
      VALUES ('export-membership','export-team','export-owner','owner');
      INSERT INTO audit_events (id,team_id,team_label,sequence,event_type,event_version,
        category,outcome,actor_kind,actor_id,actor_label,request_id,details)
      SELECT gen_random_uuid(),'export-team','Export Team',n,'fixture.event',1,'audit',
        'succeeded','user','export-owner','Export Owner',gen_random_uuid(),'{}'::jsonb
      FROM generate_series(1,1001) n`);
    context = {
      tenantDb: createTenantDb(app, 'export-team'),
      principal: {
        kind: 'user',
        userId: 'export-owner',
        email: 'owner@example.test',
        emailVerified: true,
        name: 'Export Owner',
        locale: null,
        sessionId: 'export-session',
      },
      requestId: randomUUID(),
    };
  });
  afterAll(async () => {
    await dispose();
  });

  it('commits producer, streams below high-water, finalizes, and consumes once', async () => {
    const requested = await requestAuditExport(context, {});
    expect(requested).toMatchObject({
      deliveryMode: 'staged',
      status: 'pending',
    });
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const visible = await context.tenantDb.transaction((client) =>
      client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM audit_events WHERE sequence <= 1001`,
      ),
    );
    expect(visible.rows[0]?.count).toBe(1001);
    const keys = await loadTestKeys();
    const dispatched = await createAuditExportDispatcher({
      pool: maintenance,
      store,
      keys,
    }).runOnce();
    expect(dispatched).toMatchObject({ claimed: 1, completed: 1 });
    const recorded = await owner.query<{
      artifact_row_count: number;
      artifact_byte_count: string;
      high_water_sequence: string;
    }>(
      `SELECT artifact_row_count,artifact_byte_count::text,high_water_sequence::text FROM audit_export_jobs WHERE id=$1`,
      [requested.jobId],
    );
    const status = await readAuditExportStatus(context, requested.jobId, keys);
    expect(status.status).toBe('ready');
    if (status.status !== 'ready') throw new Error('expected ready');
    const downloaded = await downloadAuditExport(
      context,
      requested.jobId,
      status.handle,
      store,
    );
    expect(recorded.rows[0]).toMatchObject({
      artifact_row_count: 1001,
      high_water_sequence: '1001',
    });
    expect(downloaded.csv.split('\r\n')).toHaveLength(1003);
    expect(downloaded.csv).not.toContain('audit.export.started');
    await expect(
      downloadAuditExport(context, requested.jobId, status.handle, store),
    ).rejects.toThrow('audit export unavailable');
  });

  it('releases its lease and retains a retryable job after storage failure', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const failedStore: AuditExportArtifactStore = {
      ...store,
      putAuditExport: async () => {
        throw new Error('synthetic storage outage');
      },
    };
    const result = await createAuditExportDispatcher({
      pool: maintenance,
      store: failedStore,
      keys: await loadTestKeys(),
    }).runOnce();
    expect(result).toMatchObject({ claimed: 1, retried: 1, completed: 0 });
    const row = await owner.query<{
      status: string;
      lease_owner: string | null;
      lease_expires_at: Date | null;
      last_error: string;
    }>(
      `SELECT status,lease_owner,lease_expires_at,last_error
       FROM audit_export_jobs WHERE id=$1`,
      [requested.jobId],
    );
    expect(row.rows[0]).toMatchObject({
      status: 'pending',
      lease_owner: null,
      lease_expires_at: null,
      last_error: 'synthetic storage outage',
    });
  });
});
