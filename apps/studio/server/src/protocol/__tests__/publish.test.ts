import { Effect } from 'effect';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testCipher } from '../../__tests__/support/secrets.ts';
import type { Transaction } from '../../db/tenant.ts';
import { openAssetKey, stripAssetKeyValues } from '../asset-keys.ts';
import {
  createDraftFromVersion,
  createProtocol,
  diffVersions,
  getDraftSections,
  getDraftDocument,
  getVersionDocument,
  listVersions,
  publishDraft,
  validateDraft,
} from '../store.ts';
import {
  FIXTURES,
  TEST_TEAM_ID,
  baseProtocol,
  makeStoreSchema,
  makeTestSyncServer,
  readFixtureProtocol,
  storeDb,
} from './helpers.ts';

/**
 * One settings edit through the sync server, in its own transaction — which
 * is what an editor's commit is. The server takes the caller's `Transaction`
 * now, so the scope is the suite's.
 */
const setDescription = (draftId: string, description: string) =>
  Effect.gen(function* () {
    const sync = makeTestSyncServer();
    const owner = `tab-${description}`;
    const lease = yield* sync.acquire(draftId, 'settings', owner);
    if (lease === null) throw new Error(`no lease on ${draftId}`);
    yield* sync.commit({
      draftId,
      sectionId: 'settings',
      owner,
      epoch: lease.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'description', value: description }],
    });
  });

describe.skipIf(!storeDb)('publishDraft', () => {
  let db: pg.Pool;
  let dispose: () => Promise<void>;
  let run: <A, E>(body: Effect.Effect<A, E, Transaction>) => Promise<A>;
  const cipher = testCipher();

  beforeAll(async () => {
    const schema = await makeStoreSchema();
    ({ db, dispose } = schema);
    run = (body) => schema.inTeam(TEST_TEAM_ID, body);
  });
  afterAll(async () => {
    await dispose();
  });

  it('freezes the head manifest verbatim into an immutable version', async () => {
    const { protocolId, draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const head = await run(getDraftSections(TEST_TEAM_ID, draftId));
    const result = await run(
      publishDraft(TEST_TEAM_ID, { draftId, label: 'first' }),
    );
    expect(result.status).toBe('published');
    if (result.status !== 'published') throw new Error('unreachable');
    expect(result.versionNumber).toBe(1);

    const versions = await run(listVersions(TEST_TEAM_ID, protocolId));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      versionNumber: 1,
      label: 'first',
      schemaVersion: 8,
      migratedFromVersionId: null,
    });

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

    expect(
      await run(getVersionDocument(TEST_TEAM_ID, result.versionId)),
    ).toEqual(baseProtocol());
  });

  it('returns invalid (writing nothing) when the assembled document fails validation', async () => {
    const protocol = baseProtocol();
    (protocol.stages[0] as { subject: { type: string } }).subject.type =
      'ghost';
    const { protocolId, draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol }),
    );
    const result = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('unreachable');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(await run(listVersions(TEST_TEAM_ID, protocolId))).toHaveLength(0);
  });

  it('rejects a stage whose document id was edited out from under its section key', async () => {
    const { draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const sync = makeTestSyncServer();
    await run(
      Effect.gen(function* () {
        const lease = yield* sync.acquire(
          draftId,
          'stage:nameGenerator1',
          'rename-tab',
        );
        if (lease === null) throw new Error('no lease');
        yield* sync.commit({
          draftId,
          sectionId: 'stage:nameGenerator1',
          owner: 'rename-tab',
          epoch: lease.epoch,
          clientSeq: 1n,
          commands: [{ op: 'set', key: 'id', value: 'renamed' }],
        });
      }),
    );

    const result = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('unreachable');
    expect(JSON.stringify(result.issues)).toContain('stage:nameGenerator1');

    const validation = await run(validateDraft(TEST_TEAM_ID, draftId));
    expect(validation.valid).toBe(false);
  });

  it('republishing identical content is an idempotent no-op', async () => {
    const { draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const first = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (first.status !== 'published') throw new Error(first.status);
    const again = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    expect(again).toEqual({
      status: 'unchanged',
      versionId: first.versionId,
      versionNumber: first.versionNumber,
    });
  });

  it('publishes changed content as the next version and branches from it', async () => {
    const { draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const first = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (first.status !== 'published') throw new Error(first.status);

    await run(setDescription(draftId, 'second edition'));
    const second = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (second.status !== 'published') throw new Error(second.status);
    expect(second.versionNumber).toBe(first.versionNumber + 1);
    expect(second.versionHash).not.toBe(first.versionHash);

    const branch = await run(
      createDraftFromVersion(TEST_TEAM_ID, { versionId: first.versionId }),
    );
    expect(await run(getDraftDocument(TEST_TEAM_ID, branch.draftId))).toEqual(
      baseProtocol(),
    );
  });

  it('diffs two published versions by the sections that changed', async () => {
    const { draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const first = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (first.status !== 'published') throw new Error(first.status);

    await run(setDescription(draftId, 'a described edition'));
    const second = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (second.status !== 'published') throw new Error(second.status);

    const changes = await run(
      diffVersions(TEST_TEAM_ID, first.versionId, second.versionId),
    );
    // One section changed, and the diff names that change and nothing else.
    expect(changes.map((change) => change.kind)).toEqual(['settings-changed']);

    // A version against itself is no change at all.
    await expect(
      run(diffVersions(TEST_TEAM_ID, first.versionId, first.versionId)),
    ).resolves.toEqual([]);
  });

  it('rejects a stale expectedManifestHash as a conflict', async () => {
    const { draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const head = await run(getDraftSections(TEST_TEAM_ID, draftId));
    const result = await run(
      publishDraft(TEST_TEAM_ID, { draftId, expectedManifestHash: 'stale' }),
    );
    expect(result).toEqual({
      status: 'conflict',
      headManifestHash: head.headManifestHash,
    });
  });

  it('serializes concurrent publishes into consecutive version numbers', async () => {
    const { draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const base = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (base.status !== 'published') throw new Error(base.status);

    const [a, b] = await Promise.all([
      run(createDraftFromVersion(TEST_TEAM_ID, { versionId: base.versionId })),
      run(createDraftFromVersion(TEST_TEAM_ID, { versionId: base.versionId })),
    ]);
    await run(setDescription(a.draftId, 'variant a'));
    await run(setDescription(b.draftId, 'variant b'));

    const results = await Promise.all([
      run(publishDraft(TEST_TEAM_ID, { draftId: a.draftId })),
      run(publishDraft(TEST_TEAM_ID, { draftId: b.draftId })),
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
    const { draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const result = await run(publishDraft(TEST_TEAM_ID, { draftId }));
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
    const pinnedHash = (pin.rows[0] as { section_hash: string }).section_hash;
    await expect(
      db.query(`DELETE FROM sections WHERE hash = $1`, [pinnedHash]),
    ).rejects.toThrow(/violates foreign key/);

    await expect(
      db.query(
        `INSERT INTO version_sections (version_id, team_id, section_id, section_hash)
         VALUES ($1, $2, 'stage:smuggled', $3)`,
        [result.versionId, TEST_TEAM_ID, pinnedHash],
      ),
    ).rejects.toThrow(/immutable/);
  });

  // Every other case here runs on the trimmed baseProtocol; these cover a real
  // protocol's shape, and a document that has to survive jsonb.
  for (const fixture of FIXTURES) {
    it(`publishes ${fixture} and reads it back unchanged but for its sealed API keys`, async () => {
      const protocol = readFixtureProtocol(fixture);
      const { protocolId, draftId } = await run(
        createProtocol(TEST_TEAM_ID, cipher, { protocol }),
      );
      const sectionCount = Object.keys(
        (await run(getDraftSections(TEST_TEAM_ID, draftId))).sections,
      ).length;

      const result = await run(publishDraft(TEST_TEAM_ID, { draftId }));
      if (result.status !== 'published') throw new Error(result.status);

      // A published document is what was imported, except that an API key's
      // value has been sealed out of it (#1900): the manifest keeps the entry
      // naming the asset, and the value lives in `protocol_asset_keys`. Two of
      // these fixtures carry a real Mapbox token, so this is the round trip
      // over a protocol that actually exercises it.
      const manifest = (protocol as unknown as Record<string, unknown>)
        .assetManifest;
      const { doc: redacted, values: keys } = stripAssetKeyValues(
        (manifest ?? {}) as Record<string, unknown>,
      );
      const expected =
        keys.size === 0 ? protocol : { ...protocol, assetManifest: redacted };
      expect(
        await run(getVersionDocument(TEST_TEAM_ID, result.versionId)),
      ).toEqual(expected);
      for (const [assetId, value] of keys) {
        await expect(
          run(
            openAssetKey(cipher, {
              teamId: TEST_TEAM_ID,
              protocolId,
              assetId,
            }),
          ),
        ).resolves.toBe(value);
      }
      const pins = await db.query<{ pins: number }>(
        `SELECT count(*)::int AS pins FROM version_sections WHERE version_id = $1`,
        [result.versionId],
      );
      expect(pins.rows[0]?.pins).toBe(sectionCount);
      expect(await run(publishDraft(TEST_TEAM_ID, { draftId }))).toMatchObject({
        status: 'unchanged',
        versionId: result.versionId,
      });
    });
  }
});
