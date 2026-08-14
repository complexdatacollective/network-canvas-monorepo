import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SyncServer } from '@codaco/studio-sync/server';

import { ProtocolStore } from '../store.ts';
import { baseProtocol, dbAvailable, makeStoreDb } from './helpers.ts';

async function setDescription(
  db: pg.Pool,
  draftId: string,
  description: string,
) {
  const sync = new SyncServer(db);
  const owner = `tab-${description}`;
  const lease = await sync.acquire(draftId, 'settings', owner);
  await sync.commit({
    draftId,
    sectionId: 'settings',
    owner,
    epoch: lease!.epoch,
    clientSeq: 1n,
    commands: [{ op: 'set', key: 'description', value: description }],
  });
}

describe.skipIf(!dbAvailable)('publishDraft', () => {
  let db: pg.Pool;
  let store: ProtocolStore;

  beforeAll(async () => {
    db = await makeStoreDb('protocol_store_publish_test');
    store = new ProtocolStore(db);
  });
  afterAll(async () => {
    await db.end();
  });

  it('freezes the head manifest verbatim into an immutable version', async () => {
    const { protocolId, draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const head = await store.getDraftSections(draftId);
    const result = await store.publishDraft({ draftId, label: 'first' });
    expect(result.status).toBe('published');
    if (result.status !== 'published') throw new Error('unreachable');
    expect(result.versionNumber).toBe(1);

    const versions = await store.listVersions(protocolId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      versionNumber: 1,
      label: 'first',
      schemaVersion: 8,
      migratedFromVersionId: null,
    });

    // The manifest column is the manifests row, verbatim.
    const stored = await db.query(
      `SELECT manifest FROM protocol_versions WHERE id = $1`,
      [result.versionId],
    );
    const manifest = (
      stored.rows[0] as {
        manifest: { hash: string; section_hashes: Record<string, string> };
      }
    ).manifest;
    expect(manifest.hash).toBe(head.headManifestHash);
    expect(manifest.section_hashes).toEqual(head.sectionHashes);

    const pins = await db.query(
      `SELECT count(*)::int AS pins FROM version_sections WHERE version_id = $1`,
      [result.versionId],
    );
    expect((pins.rows[0] as { pins: number }).pins).toBe(
      Object.keys(head.sectionHashes).length,
    );

    expect(await store.getVersionDocument(result.versionId)).toEqual(
      baseProtocol(),
    );
  });

  it('returns invalid (writing nothing) when the assembled document fails validation', async () => {
    const protocol = baseProtocol();
    (protocol.stages[0] as { subject: { type: string } }).subject.type =
      'ghost';
    const { protocolId, draftId } = await store.createProtocol({ protocol });
    const result = await store.publishDraft({ draftId });
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('unreachable');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(await store.listVersions(protocolId)).toHaveLength(0);
  });

  it('republishing identical content is an idempotent no-op', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const first = await store.publishDraft({ draftId });
    if (first.status !== 'published') throw new Error(first.status);
    const again = await store.publishDraft({ draftId });
    expect(again).toEqual({
      status: 'unchanged',
      versionId: first.versionId,
      versionNumber: first.versionNumber,
    });
  });

  it('publishes changed content as the next version and branches from it', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const first = await store.publishDraft({ draftId });
    if (first.status !== 'published') throw new Error(first.status);

    await setDescription(db, draftId, 'second edition');
    const second = await store.publishDraft({ draftId });
    if (second.status !== 'published') throw new Error(second.status);
    expect(second.versionNumber).toBe(first.versionNumber + 1);
    expect(second.versionHash).not.toBe(first.versionHash);

    const branch = await store.createDraftFromVersion({
      versionId: first.versionId,
    });
    expect(await store.getDraftDocument(branch.draftId)).toEqual(
      baseProtocol(),
    );
  });

  it('rejects a stale expectedManifestHash as a conflict', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const head = await store.getDraftSections(draftId);
    const result = await store.publishDraft({
      draftId,
      expectedManifestHash: 'stale',
    });
    expect(result).toEqual({
      status: 'conflict',
      headManifestHash: head.headManifestHash,
    });
  });

  it('serializes concurrent publishes into consecutive version numbers', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const base = await store.publishDraft({ draftId });
    if (base.status !== 'published') throw new Error(base.status);

    const [a, b] = await Promise.all([
      store.createDraftFromVersion({ versionId: base.versionId }),
      store.createDraftFromVersion({ versionId: base.versionId }),
    ]);
    await setDescription(db, a.draftId, 'variant a');
    await setDescription(db, b.draftId, 'variant b');

    const results = await Promise.all([
      store.publishDraft({ draftId: a.draftId }),
      store.publishDraft({ draftId: b.draftId }),
    ]);
    const numbers = results
      .map((result) => {
        if (result.status !== 'published') throw new Error(result.status);
        return result.versionNumber;
      })
      .toSorted((x, y) => x - y);
    expect(numbers).toEqual([base.versionNumber + 1, base.versionNumber + 2]);
  });

  it('published versions are immutable, and their sections cannot be deleted', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const result = await store.publishDraft({ draftId });
    if (result.status !== 'published') throw new Error(result.status);

    await expect(
      db.query(`UPDATE protocol_versions SET label = 'x' WHERE id = $1`, [
        result.versionId,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.query(`DELETE FROM protocol_versions WHERE id = $1`, [
        result.versionId,
      ]),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.query(`DELETE FROM version_sections WHERE version_id = $1`, [
        result.versionId,
      ]),
    ).rejects.toThrow(/immutable/);

    const pin = await db.query(
      `SELECT section_hash FROM version_sections WHERE version_id = $1 LIMIT 1`,
      [result.versionId],
    );
    await expect(
      db.query(`DELETE FROM sections WHERE hash = $1`, [
        (pin.rows[0] as { section_hash: string }).section_hash,
      ]),
    ).rejects.toThrow(/violates foreign key/);
  });
});
