import { createHash, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TenantDb } from '@codaco/studio-sync/tenant';

import { gcProtocolStore } from '../gc.ts';
import { ProtocolStore } from '../store.ts';
import {
  GC_OPTS,
  TEST_TEAM_ID,
  ageQuarantine,
  baseProtocol,
  expireLease,
  makeStoreSchema,
  makeTestSyncServer,
  storeDb,
} from './helpers.ts';

async function commitDescription(
  db: TenantDb,
  draftId: string,
  value: string,
  clientSeq: bigint,
) {
  const sync = makeTestSyncServer(db);
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
    await expireLease(tenantDb, draftId, 'settings');
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

  it('keeps a section held only by a published template version', async () => {
    // A template version pins sections exactly as a protocol version does,
    // and its pins are immutable too. A section no protocol references but a
    // template does must therefore count as referenced: swept, it would hit
    // the pin's foreign key and abort the tenant's whole pass — on every pass
    // after, since the pin can never be retracted.
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await commitDescription(tenantDb, draftId, 'held by a template', 1n);
    const heldHash = (await store.getDraftSections(draftId)).sectionHashes
      .settings!;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const templateId = randomUUID();
      const versionId = randomUUID();
      await client.query(
        `INSERT INTO templates (id, team_id, kind, name)
         VALUES ($1, $2, 'protocol', 'Holds one section')`,
        [templateId, TEST_TEAM_ID],
      );
      await client.query(
        `INSERT INTO template_versions
           (id, team_id, template_id, version_number, manifest, manifest_hash,
            schema_version)
         VALUES ($1, $2, $3, 1, $4, $5, 8)`,
        [
          versionId,
          TEST_TEAM_ID,
          templateId,
          JSON.stringify({ settings: heldHash }),
          createHash('sha256').update(heldHash).digest('hex'),
        ],
      );
      await client.query(
        `INSERT INTO template_version_sections
           (version_id, team_id, section_id, section_hash)
         VALUES ($1, $2, 'settings', $3)`,
        [versionId, TEST_TEAM_ID, heldHash],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    // The draft moves on, so nothing but the template holds the section.
    await commitDescription(tenantDb, draftId, 'moved on', 2n);
    await expireLease(tenantDb, draftId, 'settings');
    await gcProtocolStore(maintenance, GC_OPTS);
    await ageQuarantine(db);
    await expect(gcProtocolStore(maintenance, GC_OPTS)).resolves.toBeDefined();
    expect(await sectionExists(db, heldHash)).toBe(true);
  });

  it('a live lease retains idempotency records, and dedup replay still works after GC', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = makeTestSyncServer(tenantDb);
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
    await expireLease(tenantDb, draftId, 'settings');
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
    const sync = makeTestSyncServer(tenantDb);
    const resumed = (await sync.resume(draftId, 'reader-tab')).sectionHashes
      .settings!;
    await db.query(
      `UPDATE sections SET created_at = created_at - interval '1 hour'`,
    );
    await commitDescription(tenantDb, draftId, 'superseding it', 41n);
    await expireLease(tenantDb, draftId, 'settings');

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
  // Bounds reject before connecting; this pool intentionally has no database.
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
