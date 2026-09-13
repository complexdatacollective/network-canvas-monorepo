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
import { createRpcClient } from '../../__tests__/support/rpc.ts';
import type { AuditExportArtifactStore } from '../../assets.ts';
import { readEnv } from '../../env.ts';
import { loadTestKeys } from '../../pii/__tests__/fixtures.ts';
import type { AuditedCommandContext } from '../command.ts';
import {
  AuditExportAdapter,
  createAuditExportDispatcher,
  openAuditExportDownload,
  readAuditExportStatus,
  requestAuditExport as requestAuditExportWithAvailability,
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
    async putAuditExport(jobId, attemptId, chunks, options) {
      if (!(await options.recordUploadId(`upload-${attemptId}`)))
        throw new Error('audit export lease lost');
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
    async cleanupAuditExport(key) {
      objects.delete(key);
      return true;
    },
  };

  const requestAuditExport = (
    commandContext: AuditedCommandContext,
    filters: Parameters<typeof requestAuditExportWithAvailability>[1],
  ) =>
    requestAuditExportWithAvailability(commandContext, filters, {
      stagedAvailable: true,
    });

  async function createReadyExport() {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const keys = await loadTestKeys();
    const dispatcher = createAuditExportDispatcher({
      pool: maintenance,
      store,
      keys,
    });
    let status = await readAuditExportStatus(context, requested.jobId, keys);
    for (let i = 0; i < 20 && status.status !== 'ready'; i += 1) {
      await dispatcher.runOnce();
      status = await readAuditExportStatus(context, requested.jobId, keys);
    }
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

  it('rejects unavailable staging without committing a job or started event, while direct export still works', async () => {
    const requestId = randomUUID();
    const priorJobs = await owner.query(
      'SELECT id FROM audit_export_jobs ORDER BY id',
    );
    const rpc = createRpcClient(
      createHttpTestApp(
        { ...readEnv(), s3: undefined },
        {
          pool: app,
          encryptionKeys: await loadTestKeys(),
          auth: stubAuthService({
            getSession: () => Promise.resolve(context.principal),
            getMembership: () => Promise.resolve({ role: 'owner' }),
          }),
        },
      ),
    );
    await expect(
      rpc.audit.export({ teamId: 'export-team' }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    await expect(
      requestAuditExportWithAvailability(
        { ...context, requestId },
        {},
        { stagedAvailable: false },
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(
      await owner.query('SELECT id FROM audit_events WHERE request_id=$1', [
        requestId,
      ]),
    ).toHaveProperty('rowCount', 0);
    expect(
      await owner.query('SELECT id FROM audit_export_jobs ORDER BY id'),
    ).toHaveProperty('rows', priorJobs.rows);
    await expect(
      requestAuditExportWithAvailability(
        { ...context, requestId: randomUUID() },
        { eventTypes: ['absent.fixture'] },
        { stagedAvailable: false },
      ),
    ).resolves.toMatchObject({ deliveryMode: 'direct', rowCount: 0 });
  });

  it('returns the same typed absence for missing and another actor export jobs', async () => {
    const keys = await loadTestKeys();
    await expect(
      readAuditExportStatus(context, randomUUID(), keys),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const request = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (request.deliveryMode !== 'staged') throw new Error('expected staged');
    await owner.query(
      "INSERT INTO \"user\" (id,name,email,\"emailVerified\") VALUES ('other-export-owner','Other','other-export@example.test',true)",
    );
    await owner.query(`INSERT INTO team_members (id,team_id,user_id,role)
      VALUES ('other-export-admin','export-team','other-export-owner','admin')`);
    const otherActor = {
      ...context,
      principal: { ...context.principal, userId: 'other-export-owner' },
    };
    await expect(
      readAuditExportStatus(otherActor, request.jobId, keys),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await owner.query('DELETE FROM audit_export_jobs WHERE id=$1', [
      request.jobId,
    ]);
  });

  it('drops per-attempt memory when lease loss aborts an upload before finalization', async () => {
    const controller = new AbortController();
    const abortedStore: AuditExportArtifactStore = {
      ...store,
      async putAuditExport(_jobId, _attemptId, _chunks, options) {
        controller.abort(new Error('lease lost during upload'));
        options.signal.throwIfAborted();
        throw new Error('expected abort');
      },
    };
    const adapter = new AuditExportAdapter(
      maintenance,
      abortedStore,
      await loadTestKeys(),
      0,
    );
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const claim = await adapter.claim(
      { owner: randomUUID(), durationMs: 30_000 },
      8,
    );
    if (!claim) throw new Error('expected claim');
    await expect(adapter.deliver(claim, controller.signal)).rejects.toThrow(
      'lease lost during upload',
    );
    // The dispatcher deliberately skips recordFailure after losing its lease.
    expect(Reflect.get(adapter, 'generated')).toHaveProperty('size', 0);
    await owner.query('DELETE FROM audit_export_jobs WHERE id=$1', [
      requested.jobId,
    ]);
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

  it('uses a fresh durable attempt key for every retry under one dispatcher owner', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const adapter = new AuditExportAdapter(
      maintenance,
      store,
      await loadTestKeys(),
      0,
    );
    const lease = { owner: randomUUID(), durationMs: 30_000 };
    const first = await adapter.claim(lease, 8);
    if (!first?.attemptId || !first.artifactKey)
      throw new Error('expected attempt');
    await expect(
      adapter.recordFailure(first, lease, new Error('retry'), 0),
    ).resolves.toBe(true);
    const second = await adapter.claim(lease, 8);
    if (!second?.attemptId || !second.artifactKey)
      throw new Error('expected retry attempt');
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(second.artifactKey).not.toBe(first.artifactKey);
    await owner.query(
      `UPDATE audit_export_jobs SET lease_expires_at=statement_timestamp()-interval '1 second'
       WHERE id=$1`,
      [second.id],
    );
    await adapter.suppressUndeliverable();
  });

  it('retains cleanup through two empty scans and removes a later remote effect after restart', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    let releaseCreate: (() => void) | undefined;
    const mayCreate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    let createStarted: (() => void) | undefined;
    const atCreate = new Promise<void>((resolve) => {
      createStarted = resolve;
    });
    const lateEffects = new Set<string>();
    const scans: string[] = [];
    const delayedStore: AuditExportArtifactStore = {
      ...store,
      async putAuditExport(jobId, attemptId) {
        createStarted?.();
        await mayCreate;
        const key = `audit-exports/${jobId}/${attemptId}.csv`;
        lateEffects.add(key);
        objects.set(key, Buffer.from('late'));
        throw new Error('client aborted while remote create completed');
      },
      async cleanupAuditExport(key) {
        scans.push(key);
        const pendingFound = lateEffects.delete(key);
        const objectFound = objects.delete(key);
        const found = pendingFound || objectFound;
        return !found;
      },
    };
    const adapter = new AuditExportAdapter(
      maintenance,
      delayedStore,
      await loadTestKeys(),
      0,
    );
    const lease = { owner: randomUUID(), durationMs: 30_000 };
    const claim = await adapter.claim(lease, 8);
    if (!claim?.attemptId || !claim.artifactKey)
      throw new Error('expected claim');
    const delivery = adapter.deliver(claim);
    await atCreate;
    await owner.query(
      `UPDATE audit_export_jobs SET lease_expires_at=statement_timestamp()-interval '1 second'
       WHERE id=$1`,
      [claim.id],
    );
    await owner.query(
      `UPDATE audit_export_artifact_attempts SET next_sweep_at=statement_timestamp()+interval '1 day'
       WHERE state='retired'`,
    );
    await adapter.suppressUndeliverable();
    await owner.query(
      `UPDATE audit_export_artifact_attempts SET next_sweep_at=CASE WHEN id=$1
         THEN statement_timestamp()-interval '1 second'
         ELSE statement_timestamp()+interval '1 day' END WHERE state='retired'`,
      [claim.attemptId],
    );
    await adapter.suppressUndeliverable();
    expect(scans).toEqual([claim.artifactKey, claim.artifactKey]);

    releaseCreate?.();
    await expect(delivery).rejects.toThrow(
      'client aborted while remote create completed',
    );
    expect(objects.has(claim.artifactKey)).toBe(true);
    await owner.query(
      `UPDATE audit_export_artifact_attempts SET next_sweep_at=CASE WHEN id=$1
         THEN statement_timestamp()-interval '1 second'
         ELSE statement_timestamp()+interval '1 day' END WHERE state='retired'`,
      [claim.attemptId],
    );
    const restarted = new AuditExportAdapter(
      maintenance,
      delayedStore,
      await loadTestKeys(),
      0,
    );
    await restarted.suppressUndeliverable();
    expect(objects.has(claim.artifactKey)).toBe(false);
    await expect(
      owner.query<{ state: string; sweep_count: number }>(
        `SELECT state,sweep_count FROM audit_export_artifact_attempts WHERE id=$1`,
        [claim.attemptId],
      ),
    ).resolves.toHaveProperty('rows', [{ state: 'retired', sweep_count: 3 }]);
  });

  it('sweeps an old retired attempt without deleting the newer ready artifact', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const adapter = new AuditExportAdapter(
      maintenance,
      store,
      await loadTestKeys(),
      0,
    );
    const lease = { owner: randomUUID(), durationMs: 30_000 };
    const old = await adapter.claim(lease, 8);
    if (!old?.attemptId || !old.artifactKey)
      throw new Error('expected old attempt');
    objects.set(old.artifactKey, Buffer.from('old'));
    await adapter.recordFailure(old, lease, new Error('retry'), 0);
    const current = await adapter.claim(lease, 8);
    if (!current?.artifactKey) throw new Error('expected current attempt');
    await adapter.deliver(current);
    await adapter.recordComplete(current, lease);
    await owner.query(
      `UPDATE audit_export_artifact_attempts SET next_sweep_at=CASE WHEN id=$1
         THEN statement_timestamp()-interval '1 second'
         ELSE statement_timestamp()+interval '1 day' END WHERE state='retired'`,
      [old.attemptId],
    );
    await adapter.suppressUndeliverable();
    expect(objects.has(old.artifactKey)).toBe(false);
    expect(objects.has(current.artifactKey)).toBe(true);
  });

  it('retains cleanup responsibility after its job and team are deleted', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    const adapter = new AuditExportAdapter(
      maintenance,
      store,
      await loadTestKeys(),
      0,
    );
    const claim = await adapter.claim(
      { owner: randomUUID(), durationMs: 30_000 },
      8,
    );
    if (!claim?.attemptId) throw new Error('expected claim');
    await owner.query("DELETE FROM teams WHERE id='export-team'");
    await expect(
      owner.query(`SELECT id FROM audit_export_jobs WHERE id=$1`, [claim.id]),
    ).resolves.toHaveProperty('rowCount', 0);
    await expect(
      owner.query<{ state: string; job_id: string }>(
        `SELECT state,job_id FROM audit_export_artifact_attempts WHERE id=$1`,
        [claim.attemptId],
      ),
    ).resolves.toHaveProperty('rows', [{ state: 'retired', job_id: claim.id }]);
    await owner.query(
      `INSERT INTO teams (id,name,slug) VALUES ('export-team','Export Team','export-team');
       INSERT INTO team_members (id,team_id,user_id,role)
       VALUES ('export-membership','export-team','export-owner','owner')`,
    );
    const secondRequest = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (secondRequest.deliveryMode !== 'staged')
      throw new Error('expected staged');
    const second = await adapter.claim(
      { owner: randomUUID(), durationMs: 30_000 },
      8,
    );
    if (!second?.attemptId) throw new Error('expected second claim');
    await owner.query('DELETE FROM audit_export_jobs WHERE id=$1', [second.id]);
    await expect(
      owner.query<{ state: string }>(
        `SELECT state FROM audit_export_artifact_attempts WHERE id=$1`,
        [second.attemptId],
      ),
    ).resolves.toHaveProperty('rows', [{ state: 'retired' }]);
  });

  it('leases retired cleanup to one owner and backs off retained tombstones', async () => {
    const requested = await requestAuditExport(
      { ...context, requestId: randomUUID() },
      {},
    );
    if (requested.deliveryMode !== 'staged') throw new Error('expected staged');
    let cleanupCalls = 0;
    let enteredCleanup: (() => void) | undefined;
    const cleanupEntered = new Promise<void>((resolve) => {
      enteredCleanup = resolve;
    });
    let releaseCleanup: (() => void) | undefined;
    const cleanupMayFinish = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const blocking: AuditExportArtifactStore = {
      ...store,
      async cleanupAuditExport() {
        cleanupCalls += 1;
        enteredCleanup?.();
        await cleanupMayFinish;
        return true;
      },
    };
    const keys = await loadTestKeys();
    const initial = new AuditExportAdapter(maintenance, store, keys, 0);
    const claim = await initial.claim(
      { owner: randomUUID(), durationMs: 30_000 },
      8,
    );
    if (!claim?.attemptId) throw new Error('expected claim');
    await owner.query(
      `UPDATE audit_export_jobs SET lease_expires_at=statement_timestamp()-interval '1 second'
       WHERE id=$1`,
      [claim.id],
    );
    await owner.query(
      `UPDATE audit_export_artifact_attempts SET next_sweep_at=statement_timestamp()+interval '1 day'
       WHERE state='retired'`,
    );
    await initial.suppressUndeliverable();
    await owner.query(
      `UPDATE audit_export_artifact_attempts SET next_sweep_at=CASE WHEN id=$1
         THEN statement_timestamp()-interval '1 second'
         ELSE statement_timestamp()+interval '1 day' END WHERE state='retired'`,
      [claim.attemptId],
    );
    cleanupCalls = 0;
    const adapter = new AuditExportAdapter(maintenance, blocking, keys, 0);
    const other = new AuditExportAdapter(maintenance, blocking, keys, 0);
    const first = adapter.suppressUndeliverable();
    await cleanupEntered;
    const second = other.suppressUndeliverable();
    expect(cleanupCalls).toBe(1);
    releaseCleanup?.();
    await Promise.all([first, second]);
    const retained = await owner.query<{
      sweep_count: number;
      next_sweep_at: Date;
      last_sweep_at: Date;
    }>(
      `SELECT sweep_count,next_sweep_at,last_sweep_at
       FROM audit_export_artifact_attempts WHERE id=$1`,
      [claim.attemptId],
    );
    expect(retained.rows[0]!.sweep_count).toBe(2);
    expect(retained.rows[0]!.next_sweep_at.getTime()).toBeGreaterThan(
      retained.rows[0]!.last_sweep_at.getTime(),
    );
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
