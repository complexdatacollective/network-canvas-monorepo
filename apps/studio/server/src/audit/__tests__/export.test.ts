import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import { stubAuthService } from '../../__tests__/support/auth.ts';
import { createHttpTestApp } from '../../__tests__/support/http-app.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import type { AuditExportArtifactStore } from '../../assets.ts';
import { loadTestKeys } from '../../pii/__tests__/fixtures.ts';
import type { AuditedCommandContext } from '../command.ts';
import {
  AuditExportAdapter,
  createAuditExportDispatcher,
  openAuditExportDownload,
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
    async putAuditExport(jobId, attemptId, chunks) {
      const values: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of chunks) {
        values.push(chunk);
        size += chunk.byteLength;
      }
      const bytes = Buffer.concat(values, size);
      const key = `audit-exports/${jobId}/${attemptId}.csv`;
      objects.set(key, bytes);
      return { key, size };
    },
    async getAuditExport(key) {
      const bytes = objects.get(key);
      return bytes
        ? { body: new Blob([bytes]).stream(), size: bytes.byteLength }
        : null;
    },
    async deleteAuditExport(key) {
      objects.delete(key);
    },
  };

  async function createReadyExport() {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const keys = await loadTestKeys();
    const result = await createAuditExportDispatcher({
      pool: maintenance,
      store,
      keys,
    }).runOnce();
    expect(result).toMatchObject({ completed: 1 });
    const status = await readAuditExportStatus(context, requested.jobId, keys);
    if (status.status !== 'ready') throw new Error('expected ready');
    return { requested, status, keys };
  }

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
    expect(recorded.rows[0]).toMatchObject({
      artifact_row_count: 1001,
      high_water_sequence: '1001',
    });
    const server = createHttpTestApp(undefined, {
      auth: stubAuthService({
        getSession: () => Promise.resolve(context.principal),
      }),
      pool: app,
      auditExportStore: store,
    });
    const response = await server.request(status.downloadPath, {
      headers: { 'x-studio-audit-export-handle': status.handle },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toBe(
      'text/csv; charset=utf-8',
    );
    const csv = await response.text();
    expect(csv.split('\r\n')).toHaveLength(1003);
    expect(csv).not.toContain('audit.export.started');
    await expect(
      openAuditExportDownload(context, requested.jobId, status.handle, store),
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

  it('rejects an invalid handle before opening an object stream', async () => {
    const { requested } = await createReadyExport();
    let reads = 0;
    const observedStore: AuditExportArtifactStore = {
      ...store,
      async getAuditExport(key) {
        reads += 1;
        return store.getAuditExport(key);
      },
    };
    await expect(
      openAuditExportDownload(
        context,
        requested.jobId,
        Buffer.alloc(32, 1).toString('base64url'),
        observedStore,
      ),
    ).rejects.toThrow('audit export unavailable');
    expect(reads).toBe(0);
  });

  it('rechecks administrator authority after opening and releases a refused stream', async () => {
    const { requested, status } = await createReadyExport();
    let cancellations = 0;
    const revokingStore: AuditExportArtifactStore = {
      ...store,
      async getAuditExport(key) {
        const stored = await store.getAuditExport(key);
        if (!stored) return null;
        await owner.query(
          `UPDATE team_members SET role='member' WHERE id='export-membership'`,
        );
        return {
          size: stored.size,
          body: new ReadableStream<Uint8Array>({
            cancel() {
              cancellations += 1;
            },
          }),
        };
      },
    };
    try {
      await expect(
        openAuditExportDownload(
          context,
          requested.jobId,
          status.handle,
          revokingStore,
        ),
      ).rejects.toThrow('audit export unavailable');
      await vi.waitFor(() => expect(cancellations).toBe(1));
      const row = await owner.query<{ handle_consumed_at: Date | null }>(
        'SELECT handle_consumed_at FROM audit_export_jobs WHERE id=$1',
        [requested.jobId],
      );
      expect(row.rows[0]?.handle_consumed_at).toBeNull();
    } finally {
      await owner.query(
        `UPDATE team_members SET role='owner' WHERE id='export-membership'`,
      );
    }
  });

  it('cancels an opened body when the consumption transaction throws', async () => {
    const { requested, status } = await createReadyExport();
    let cancellations = 0;
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        cancellations += 1;
      },
    });
    const throwingStore: AuditExportArtifactStore = {
      ...store,
      async getAuditExport(key) {
        const stored = await store.getAuditExport(key);
        return stored ? { ...stored, body: source } : null;
      },
    };
    let transactions = 0;
    const failingContext: AuditedCommandContext = {
      ...context,
      tenantDb: {
        ...context.tenantDb,
        transaction(work, options) {
          transactions += 1;
          if (transactions === 2)
            return Promise.reject(new Error('synthetic consume failure'));
          return context.tenantDb.transaction(work, options);
        },
      },
    };
    await expect(
      openAuditExportDownload(
        failingContext,
        requested.jobId,
        status.handle,
        throwingStore,
      ),
    ).rejects.toThrow('synthetic consume failure');
    await vi.waitFor(() => expect(cancellations).toBe(1));
    expect(source.locked).toBe(false);
  });

  it('releases a size-mismatched body without consuming the handle', async () => {
    const { requested, status } = await createReadyExport();
    let cancellations = 0;
    const oversizedStore: AuditExportArtifactStore = {
      ...store,
      async getAuditExport(key) {
        const stored = await store.getAuditExport(key);
        if (!stored?.size) return null;
        return {
          size: stored.size + 1,
          body: new ReadableStream<Uint8Array>({
            cancel() {
              cancellations += 1;
            },
          }),
        };
      },
    };
    await expect(
      openAuditExportDownload(
        context,
        requested.jobId,
        status.handle,
        oversizedStore,
      ),
    ).rejects.toThrow('audit export unavailable');
    await vi.waitFor(() => expect(cancellations).toBe(1));
    await expect(
      openAuditExportDownload(context, requested.jobId, status.handle, store),
    ).resolves.toMatchObject({ size: expect.any(Number) });
  });

  it('releases the source reader after EOF and consumer cancellation', async () => {
    const completed = await createReadyExport();
    let completedSource: ReadableStream<Uint8Array> | undefined;
    const completedStore: AuditExportArtifactStore = {
      ...store,
      async getAuditExport(key) {
        const stored = await store.getAuditExport(key);
        if (stored) completedSource = stored.body;
        return stored;
      },
    };
    const opened = await openAuditExportDownload(
      context,
      completed.requested.jobId,
      completed.status.handle,
      completedStore,
    );
    await new Response(opened.body).text();
    expect(completedSource?.locked).toBe(false);

    const canceled = await createReadyExport();
    const canceledSource = new ReadableStream<Uint8Array>();
    const canceledStore: AuditExportArtifactStore = {
      ...store,
      async getAuditExport(key) {
        const stored = await store.getAuditExport(key);
        return stored ? { ...stored, body: canceledSource } : null;
      },
    };
    const cancelable = await openAuditExportDownload(
      context,
      canceled.requested.jobId,
      canceled.status.handle,
      canceledStore,
    );
    await cancelable.body.cancel();
    expect(canceledSource.locked).toBe(false);
  });

  it('cancels a stream that exceeds its recorded size while downloading', async () => {
    const { requested, status } = await createReadyExport();
    let cancellations = 0;
    let source: ReadableStream<Uint8Array> | undefined;
    const overflowingStore: AuditExportArtifactStore = {
      ...store,
      async getAuditExport(key) {
        const stored = await store.getAuditExport(key);
        const size = stored?.size;
        if (!size) return null;
        source = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Buffer.alloc(size + 1));
          },
          cancel() {
            cancellations += 1;
          },
        });
        return {
          size,
          body: source,
        };
      },
    };
    const opened = await openAuditExportDownload(
      context,
      requested.jobId,
      status.handle,
      overflowingStore,
    );
    await expect(new Response(opened.body).text()).rejects.toThrow(
      'stored audit export exceeds limit',
    );
    await vi.waitFor(() => expect(cancellations).toBe(1));
    expect(source?.locked).toBe(false);
  });

  it('uses per-attempt keys and a stale owner cleans only its own artifact', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    let uploadedFirst: (() => void) | undefined;
    const firstUploaded = new Promise<void>((resolve) => {
      uploadedFirst = resolve;
    });
    let releaseFirst: (() => void) | undefined;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let uploadCount = 0;
    const racingStore: AuditExportArtifactStore = {
      ...store,
      async putAuditExport(jobId, attemptId, chunks) {
        uploadCount += 1;
        const written = await store.putAuditExport(jobId, attemptId, chunks);
        if (uploadCount === 1) {
          uploadedFirst?.();
          await firstMayFinish;
        }
        return written;
      },
    };
    const keys = await loadTestKeys();
    const staleRun = createAuditExportDispatcher({
      pool: maintenance,
      store: racingStore,
      keys,
      leaseMs: 30_000,
    }).runOnce();
    await firstUploaded;
    await owner.query(
      `UPDATE audit_export_jobs SET lease_expires_at=statement_timestamp()-interval '1 second'
       WHERE id=$1`,
      [requested.jobId],
    );
    const winner = await createAuditExportDispatcher({
      pool: maintenance,
      store: racingStore,
      keys,
      leaseMs: 30_000,
    }).runOnce();
    expect(winner).toMatchObject({ completed: 1 });
    releaseFirst?.();
    await expect(staleRun).resolves.toMatchObject({ leaseLost: 1 });
    const row = await owner.query<{ artifact_key: string }>(
      'SELECT artifact_key FROM audit_export_jobs WHERE id=$1',
      [requested.jobId],
    );
    expect(objects.has(row.rows[0]!.artifact_key)).toBe(true);
    expect(
      [...objects.keys()].filter((key) =>
        key.startsWith(`audit-exports/${requested.jobId}/`),
      ),
    ).toEqual([row.rows[0]!.artifact_key]);
  });

  it('fences expired-owner renewal and completion while cleanup owns the row', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const keys = await loadTestKeys();
    let deleting: (() => void) | undefined;
    const deleteStarted = new Promise<void>((resolve) => {
      deleting = resolve;
    });
    let releaseDelete: (() => void) | undefined;
    const mayDelete = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const blockingStore: AuditExportArtifactStore = {
      ...store,
      async deleteAuditExport(key) {
        deleting?.();
        await mayDelete;
        await store.deleteAuditExport(key);
      },
    };
    const adapter = new AuditExportAdapter(maintenance, blockingStore, keys, 0);
    const ownerId = randomUUID();
    const lease = { owner: ownerId, durationMs: 30_000 };
    const claim = await adapter.claim(lease, 8);
    if (!claim) throw new Error('expected claim');
    await adapter.deliver(claim);
    await owner.query(
      `UPDATE audit_export_jobs SET lease_expires_at=statement_timestamp()-interval '1 second'
       WHERE id=$1`,
      [claim.id],
    );
    const cleanup = adapter.suppressUndeliverable();
    await deleteStarted;
    const renewal = adapter.renewLease(claim, lease);
    const completion = adapter.recordComplete(claim, lease);
    releaseDelete?.();
    await expect(cleanup).resolves.toBe(1);
    await expect(renewal).resolves.toBe(false);
    await expect(completion).rejects.toThrow('audit export lease lost');
    await expect(
      owner.query<{ artifact_key: string | null; status: string }>(
        'SELECT artifact_key,status FROM audit_export_jobs WHERE id=$1',
        [claim.id],
      ),
    ).resolves.toHaveProperty('rows', [
      { artifact_key: null, status: 'generating' },
    ]);
    await owner.query('DELETE FROM audit_export_jobs WHERE id=$1', [claim.id]);
  });

  it('recovers a persisted attempt key after a crash immediately after upload', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const keys = await loadTestKeys();
    const crashingStore: AuditExportArtifactStore = {
      ...store,
      async putAuditExport(jobId, attemptId, chunks) {
        await store.putAuditExport(jobId, attemptId, chunks);
        throw new Error('synthetic crash after upload');
      },
    };
    const crashedOwner = randomUUID();
    const crashedAdapter = new AuditExportAdapter(
      maintenance,
      crashingStore,
      keys,
      0,
    );
    const claim = await crashedAdapter.claim(
      { owner: crashedOwner, durationMs: 30_000 },
      8,
    );
    if (!claim) throw new Error('expected claim');
    await expect(crashedAdapter.deliver(claim)).rejects.toThrow(
      'synthetic crash after upload',
    );
    const interrupted = await owner.query<{ artifact_key: string }>(
      'SELECT artifact_key FROM audit_export_jobs WHERE id=$1',
      [claim.id],
    );
    const interruptedKey = interrupted.rows[0]?.artifact_key;
    if (!interruptedKey) throw new Error('expected persisted artifact key');
    expect(interruptedKey).toContain(claim.id);
    expect(objects.has(interruptedKey)).toBe(true);

    await owner.query(
      `UPDATE audit_export_jobs SET lease_expires_at=statement_timestamp()-interval '1 second'
       WHERE id=$1`,
      [claim.id],
    );
    const restarted = await createAuditExportDispatcher({
      pool: maintenance,
      store,
      keys,
    }).runOnce();
    expect(restarted).toMatchObject({ completed: 1, suppressed: 1 });
    const ready = await owner.query<{ artifact_key: string; status: string }>(
      'SELECT artifact_key,status FROM audit_export_jobs WHERE id=$1',
      [claim.id],
    );
    expect(ready.rows[0]?.status).toBe('ready');
    expect(ready.rows[0]?.artifact_key).not.toBe(interruptedKey);
    expect(objects.has(interruptedKey)).toBe(false);
  });

  it('cleans an uploaded artifact when handle sealing fails', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const keys = await loadTestKeys();
    Object.defineProperty(keys, 'currentId', {
      value: () => 'missing-export-key',
    });
    const result = await createAuditExportDispatcher({
      pool: maintenance,
      store,
      keys,
    }).runOnce();
    expect(result).toMatchObject({ retried: 1 });
    expect(
      [...objects.keys()].some((key) =>
        key.startsWith(`audit-exports/${requested.jobId}/`),
      ),
    ).toBe(false);
  });

  it('persists a failed cleanup key and resumes deletion after restart', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const keys = await loadTestKeys();
    Object.defineProperty(keys, 'currentId', {
      value: () => 'missing-export-key',
    });
    let refuseDelete = true;
    const failingCleanupStore: AuditExportArtifactStore = {
      ...store,
      async deleteAuditExport(key) {
        if (key.includes(requested.jobId) && refuseDelete) {
          refuseDelete = false;
          throw new Error('synthetic cleanup outage');
        }
        await store.deleteAuditExport(key);
      },
    };
    await expect(
      createAuditExportDispatcher({
        pool: maintenance,
        store: failingCleanupStore,
        keys,
      }).runOnce(),
    ).rejects.toThrow('synthetic cleanup outage');
    const retained = await owner.query<{
      status: string;
      artifact_key: string;
    }>(`SELECT status,artifact_key FROM audit_export_jobs WHERE id=$1`, [
      requested.jobId,
    ]);
    expect(retained.rows[0]).toMatchObject({
      status: 'pending',
      artifact_key: expect.stringContaining(requested.jobId),
    });

    const restarted = await createAuditExportDispatcher({
      pool: maintenance,
      store: failingCleanupStore,
      keys: await loadTestKeys(),
    }).runOnce();
    expect(restarted.suppressed).toBe(1);
    await expect(
      owner.query<{ artifact_key: string | null }>(
        'SELECT artifact_key FROM audit_export_jobs WHERE id=$1',
        [requested.jobId],
      ),
    ).resolves.toHaveProperty('rows', [{ artifact_key: null }]);
    expect(
      [...objects.keys()].some((key) =>
        key.startsWith(`audit-exports/${requested.jobId}/`),
      ),
    ).toBe(false);
  });

  it('neutralizes whitespace-prefixed spreadsheet formulas', async () => {
    await owner.query(`INSERT INTO audit_events
      (id,team_id,team_label,sequence,event_type,event_version,category,outcome,
       actor_kind,actor_id,actor_label,request_id,details)
      VALUES (gen_random_uuid(),'export-team','Export Team',
       (SELECT max(sequence)+1 FROM audit_events WHERE team_id='export-team'),
       'formula.fixture',1,'audit','succeeded','user','export-owner',
       E'\\t=HYPERLINK("https://example.invalid")',gen_random_uuid(),'{}')`);
    const result = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      { eventTypes: ['formula.fixture'] },
    );
    if (result.deliveryMode !== 'direct') throw new Error('expected direct');
    expect(result.csv).toContain(
      `"'\t=HYPERLINK(""https://example.invalid"")"`,
    );
  });

  it('deletes consumed artifacts in a bounded audited cleanup pass', async () => {
    const { requested, status } = await createReadyExport();
    const opened = await openAuditExportDownload(
      context,
      requested.jobId,
      status.handle,
      store,
    );
    await new Response(opened.body).text();
    const dispatcher = createAuditExportDispatcher({
      pool: maintenance,
      store,
      keys: await loadTestKeys(),
      cleanupConsumedAfterMs: 0,
    });
    let suppressed = 0;
    for (let index = 0; index < 20; index += 1) {
      const result = await dispatcher.runOnce();
      suppressed += result.suppressed;
      const retained = await owner.query(
        'SELECT 1 FROM audit_export_jobs WHERE id=$1',
        [requested.jobId],
      );
      if (retained.rowCount === 0) break;
    }
    expect(suppressed).toBeGreaterThan(0);
    await expect(
      owner.query('SELECT 1 FROM audit_export_jobs WHERE id=$1', [
        requested.jobId,
      ]),
    ).resolves.toHaveProperty('rowCount', 0);
    await expect(
      owner.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM audit_events
         WHERE event_type='audit.export.cleaned' AND subject_id=$1`,
        [requested.jobId],
      ),
    ).resolves.toHaveProperty('rows', [{ count: 1 }]);
  });
});
