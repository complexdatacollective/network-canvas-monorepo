import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SyncServer, forceExpire } from '@codaco/studio-sync/server';

import { gcProtocolStore } from '../gc.ts';
import { ProtocolStore } from '../store.ts';
import { baseProtocol, makeStoreSchema, storeDb } from './helpers.ts';

async function commitDescription(
  db: pg.Pool,
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
  let dispose: () => Promise<void>;
  let store: ProtocolStore;

  beforeAll(async () => {
    ({ db, dispose } = await makeStoreSchema());
    store = new ProtocolStore(db);
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

    // Two superseded settings docs: the intermediate one is referenced by no
    // version and, after pruning, by no surviving manifest.
    await commitDescription(db, draftId, 'intermediate', 1n);
    const intermediateSettingsHash = (await store.getDraftSections(draftId))
      .sectionHashes.settings!;
    await commitDescription(db, draftId, 'final', 2n);
    const head = await store.getDraftSections(draftId);

    // The settings lease is still live, which would (correctly) retain the
    // idempotency records; this test is about the manifest/section window,
    // so expire it and use a zero retry horizon.
    await forceExpire(db, draftId, 'settings');
    const result = await gcProtocolStore(db, {
      retainManifestsPerDraft: 0,
      sectionGraceMs: 0,
      commandRetryHorizonMs: 0,
    });

    // Manifests seq 0 and 1 pruned, their command_log rows with them.
    expect(result.manifestsDeleted).toBe(2);
    expect(result.commandLogDeleted).toBe(1);
    const manifests = await db.query(
      `SELECT seq FROM manifests WHERE draft_id = $1 ORDER BY seq`,
      [draftId],
    );
    expect(manifests.rows).toEqual([{ seq: String(head.headSeq) }]);

    expect(await sectionExists(db, intermediateSettingsHash)).toBe(false);
    // The v1 settings doc survives: pinned by the published version.
    expect(await sectionExists(db, publishedSettingsHash)).toBe(true);
    for (const hash of Object.values(head.sectionHashes)) {
      expect(await sectionExists(db, hash)).toBe(true);
    }

    // The published version still assembles.
    expect(await store.getVersionDocument(published.versionId)).toEqual(
      baseProtocol(),
    );
  });

  it('rejects negative or non-finite bounds', async () => {
    await expect(
      gcProtocolStore(db, {
        retainManifestsPerDraft: 0,
        sectionGraceMs: -1,
        commandRetryHorizonMs: 0,
      }),
    ).rejects.toThrow(/sectionGraceMs/);
    await expect(
      gcProtocolStore(db, {
        retainManifestsPerDraft: 0,
        sectionGraceMs: Number.NaN,
        commandRetryHorizonMs: 0,
      }),
    ).rejects.toThrow(/sectionGraceMs/);
    await expect(
      gcProtocolStore(db, {
        retainManifestsPerDraft: 0,
        sectionGraceMs: 0,
        commandRetryHorizonMs: -1,
      }),
    ).rejects.toThrow(/commandRetryHorizonMs/);
    await expect(
      gcProtocolStore(db, {
        retainManifestsPerDraft: 0.5,
        sectionGraceMs: 0,
        commandRetryHorizonMs: 0,
      }),
    ).rejects.toThrow(/retainManifestsPerDraft/);
  });

  it('a live lease retains idempotency records, and dedup replay still works after GC', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(db);
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

    const result = await gcProtocolStore(db, {
      retainManifestsPerDraft: 0,
      sectionGraceMs: 0,
      commandRetryHorizonMs: 0,
    });
    expect(result.commandLogDeleted).toBe(0);

    // A lost-acknowledgement retransmission must find its recorded result —
    // including the manifest it points at, which GC must not have pruned.
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
    await commitDescription(db, draftId, 'kept', 30n);
    await forceExpire(db, draftId, 'settings');
    const result = await gcProtocolStore(db, {
      retainManifestsPerDraft: 0,
      sectionGraceMs: 0,
      commandRetryHorizonMs: 60_000,
    });
    expect(result.commandLogDeleted).toBe(0);
  });

  it('re-adopting an existing section refreshes created_at, restarting the grace window', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const hash = (await store.getDraftSections(draftId)).sectionHashes
      .settings!;
    await db.query(
      `UPDATE sections SET created_at = now() - interval '1 hour' WHERE hash = $1`,
      [hash],
    );

    // A second protocol with identical settings content re-adopts the row via
    // the upsert; the refresh is what keeps an old-but-just-reused row out of
    // reach of a concurrent GC's grace predicate.
    await store.createProtocol({ protocol: baseProtocol() });
    const age = await db.query(
      `SELECT (now() - created_at) < interval '1 minute' AS fresh
       FROM sections WHERE hash = $1`,
      [hash],
    );
    expect((age.rows[0] as { fresh: boolean }).fresh).toBe(true);
  });

  it('the grace window protects freshly written sections', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await commitDescription(db, draftId, 'about to be superseded', 10n);
    await commitDescription(db, draftId, 'head', 11n);

    const result = await gcProtocolStore(db, {
      retainManifestsPerDraft: 0,
      sectionGraceMs: 60_000,
      commandRetryHorizonMs: 0,
    });
    expect(result.sectionsDeleted).toBe(0);
  });

  it('the retained window keeps recent manifests and their sections', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await commitDescription(db, draftId, 'kept in window', 20n);
    const superseded = (await store.getDraftSections(draftId)).sectionHashes
      .settings!;
    await commitDescription(db, draftId, 'newest', 21n);

    await gcProtocolStore(db, {
      retainManifestsPerDraft: 1,
      sectionGraceMs: 0,
      commandRetryHorizonMs: 0,
    });
    // seq cutoff keeps the head and one predecessor; the superseded settings
    // doc is still referenced by the retained predecessor manifest.
    expect(await sectionExists(db, superseded)).toBe(true);
  });
});
