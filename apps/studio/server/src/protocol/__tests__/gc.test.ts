import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SyncServer, forceExpire } from '@codaco/studio-sync/server';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { gcProtocolStore } from '../gc.ts';
import { ProtocolStore } from '../store.ts';
import {
  GC_OPTS,
  ageQuarantine,
  baseProtocol,
  makeStoreSchema,
  storeDb,
} from './helpers.ts';

async function commitDescription(
  db: TenantDb,
  draftId: string,
  value: string,
  clientSeq: bigint,
) {
  const sync = new SyncServer(db);
  const owner = 'gc-tab';
  const lease = await sync.acquire(draftId, 'settings', owner);
  await sync.commit({
    draftId,
    sectionId: 'settings',
    owner,
    epoch: lease!.epoch,
    clientSeq,
    commands: [{ op: 'set', key: 'description', value }],
  });
}

async function sectionExists(db: pg.Pool, hash: string): Promise<boolean> {
  const res = await db.query(`SELECT 1 FROM sections WHERE hash = $1`, [hash]);
  return res.rowCount === 1;
}

describe.skipIf(!storeDb)('gcProtocolStore', () => {
  let db: pg.Pool;
  let maintenance: pg.Pool;
  let tenantDb: TenantDb;
  let dispose: () => Promise<void>;
  let store: ProtocolStore;

  beforeAll(async () => {
    ({ db, maintenance, tenantDb, dispose } = await makeStoreSchema());
    store = new ProtocolStore(tenantDb);
  });
  afterAll(async () => {
    await dispose();
  });

  it('sweeps unpinned superseded sections, keeps version pins and the head', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const publishedSettingsHash = (await store.getDraftSections(draftId))
      .sectionHashes.settings!;
    const published = await store.publishDraft({ draftId });
    if (published.status !== 'published') throw new Error(published.status);

    await commitDescription(tenantDb, draftId, 'intermediate', 1n);
    const intermediateSettingsHash = (await store.getDraftSections(draftId))
      .sectionHashes.settings!;
    await commitDescription(tenantDb, draftId, 'final', 2n);
    const head = await store.getDraftSections(draftId);

    // Expire the live lease: this case is about the manifest/section window.
    await forceExpire(tenantDb, draftId, 'settings');
    const marked = await gcProtocolStore(maintenance, GC_OPTS);

    expect(marked.manifestsDeleted).toBe(2);
    expect(marked.commandLogDeleted).toBe(1);
    const manifests = await db.query(
      `SELECT seq FROM manifests WHERE draft_id = $1 ORDER BY seq`,
      [draftId],
    );
    expect(manifests.rows).toEqual([{ seq: String(head.headSeq) }]);

    expect(marked.sectionsDeleted).toBe(0);
    expect(await sectionExists(db, intermediateSettingsHash)).toBe(true);

    await ageQuarantine(db);
    const swept = await gcProtocolStore(maintenance, GC_OPTS);
    expect(swept.sectionsDeleted).toBe(1);
    expect(await sectionExists(db, intermediateSettingsHash)).toBe(false);
    expect(await sectionExists(db, publishedSettingsHash)).toBe(true);
    for (const hash of Object.values(head.sectionHashes)) {
      expect(await sectionExists(db, hash)).toBe(true);
    }

    expect(await store.getVersionDocument(published.versionId)).toEqual(
      baseProtocol(),
    );
  });

  it('a live lease retains idempotency records, and dedup replay still works after GC', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'settings', 'retry-tab');
    await sync.commit({
      draftId,
      sectionId: 'settings',
      owner: 'retry-tab',
      epoch: lease!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'description', value: 'first' }],
    });
    await sync.commit({
      draftId,
      sectionId: 'settings',
      owner: 'retry-tab',
      epoch: lease!.epoch,
      clientSeq: 2n,
      commands: [{ op: 'set', key: 'description', value: 'second' }],
    });

    const result = await gcProtocolStore(maintenance, GC_OPTS);
    expect(result.commandLogDeleted).toBe(0);

    const replay = await sync.commit({
      draftId,
      sectionId: 'settings',
      owner: 'retry-tab',
      epoch: lease!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'description', value: 'first' }],
    });
    expect(replay.deduped).toBe(true);
    expect(replay.manifestSeq).toBe(1n);
  });

  it('the retry horizon retains idempotency records after lease expiry', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await commitDescription(tenantDb, draftId, 'kept', 30n);
    await forceExpire(tenantDb, draftId, 'settings');
    const result = await gcProtocolStore(maintenance, {
      ...GC_OPTS,
      commandRetryHorizonMs: 60_000,
    });
    expect(result.commandLogDeleted).toBe(0);
  });

  it('a hash a client resumed on stays fetchable for the grace window', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await commitDescription(tenantDb, draftId, 'the resumed head', 40n);
    const sync = new SyncServer(tenantDb);
    const resumed = (await sync.resume(draftId, 'reader-tab')).sectionHashes
      .settings!;
    await db.query(
      `UPDATE sections SET created_at = created_at - interval '1 hour'`,
    );
    await commitDescription(tenantDb, draftId, 'superseding it', 41n);
    await forceExpire(tenantDb, draftId, 'settings');

    await gcProtocolStore(maintenance, GC_OPTS);
    expect(await sync.getSection(resumed)).toMatchObject({
      description: 'the resumed head',
    });
  });

  it('re-adopting a quarantined section clears its mark', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const hash = (await store.getDraftSections(draftId)).sectionHashes
      .settings!;
    await db.query(
      `UPDATE sections SET unreferenced_at = now() - interval '1 hour' WHERE hash = $1`,
      [hash],
    );

    await store.createProtocol({ protocol: baseProtocol() });
    const mark = await db.query(
      `SELECT unreferenced_at IS NULL AS cleared FROM sections WHERE hash = $1`,
      [hash],
    );
    expect((mark.rows[0] as { cleared: boolean }).cleared).toBe(true);
    expect((await gcProtocolStore(maintenance, GC_OPTS)).sectionsDeleted).toBe(
      0,
    );
  });

  it('the grace window protects freshly unreferenced sections', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await commitDescription(tenantDb, draftId, 'about to be superseded', 10n);
    await commitDescription(tenantDb, draftId, 'head', 11n);

    const result = await gcProtocolStore(maintenance, GC_OPTS);
    expect(result.sectionsDeleted).toBe(0);
  });

  it('the retained window keeps recent manifests and their sections', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await commitDescription(tenantDb, draftId, 'kept in window', 20n);
    const superseded = (await store.getDraftSections(draftId)).sectionHashes
      .settings!;
    await commitDescription(tenantDb, draftId, 'newest', 21n);

    await gcProtocolStore(maintenance, {
      ...GC_OPTS,
      retainManifestsPerDraft: 1,
    });
    await ageQuarantine(db);
    await gcProtocolStore(maintenance, {
      ...GC_OPTS,
      retainManifestsPerDraft: 1,
    });
    expect(await sectionExists(db, superseded)).toBe(true);
  });

  it('rejects an update to a stored section document', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const hash = (await store.getDraftSections(draftId)).sectionHashes
      .settings!;
    await expect(
      db.query(`UPDATE sections SET doc = '{}'::jsonb WHERE hash = $1`, [hash]),
    ).rejects.toThrow(/immutable/);
  });
});

describe('gcProtocolStore bounds', () => {
  const unconnected = new pg.Pool();

  it('rejects negative or non-finite bounds', async () => {
    await expect(
      gcProtocolStore(unconnected, {
        retainManifestsPerDraft: 0,
        sectionGraceMs: -1,
        commandRetryHorizonMs: 0,
      }),
    ).rejects.toThrow(/sectionGraceMs/);
    await expect(
      gcProtocolStore(unconnected, {
        retainManifestsPerDraft: 0,
        sectionGraceMs: Number.NaN,
        commandRetryHorizonMs: 0,
      }),
    ).rejects.toThrow(/sectionGraceMs/);
    await expect(
      gcProtocolStore(unconnected, {
        retainManifestsPerDraft: 0,
        sectionGraceMs: 1,
        commandRetryHorizonMs: -1,
      }),
    ).rejects.toThrow(/commandRetryHorizonMs/);
    await expect(
      gcProtocolStore(unconnected, {
        retainManifestsPerDraft: 0.5,
        sectionGraceMs: 1,
        commandRetryHorizonMs: 0,
      }),
    ).rejects.toThrow(/retainManifestsPerDraft/);
    await expect(
      gcProtocolStore(unconnected, {
        retainManifestsPerDraft: 0,
        sectionGraceMs: 0,
        commandRetryHorizonMs: 0,
      }),
    ).rejects.toThrow(/sectionGraceMs/);
  });
});
