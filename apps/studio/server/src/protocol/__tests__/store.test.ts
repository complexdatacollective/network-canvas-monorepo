import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Effect, Exit } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';
import { SectionValidationFailedError } from '@codaco/studio-sync/section-validation';
import {
  LeaseRejectedError,
  SectionRejectedError,
  UnknownDraftError,
  UnknownSectionError,
} from '@codaco/studio-sync/server';

import { TestDatabase } from '../../__tests__/support/database.ts';
import { testCipher } from '../../__tests__/support/secrets.ts';
import { type ScopeOptions, Transaction } from '../../db/tenant.ts';
import { ASSET_KEY_PLACEHOLDER, openAssetKey } from '../asset-keys.ts';
import {
  DraftStructureError,
  addCodebookEntity,
  addStage,
  moveStage,
  removeCodebookEntity,
  removeStage,
} from '../draft-structure.ts';
import {
  createDraftFromVersion,
  createProtocol,
  discardDraft,
  getDraftDocument,
  getDraftSections,
  getProtocolDraftMetadata,
  getVersionDocument,
  publishDraft,
  validateDraft,
} from '../store.ts';
import { createProtocolSyncServer } from '../sync.ts';
import {
  TEST_TEAM_ID,
  baseProtocol,
  makeStoreSchema,
  makeTestSyncServer,
  type StoreSchema,
  storeDb,
  waitForLockWait,
} from './helpers.ts';

const { sections } = SYNC_TABLES;

describe.skipIf(!storeDb)('ProtocolStore drafts', () => {
  let store: StoreSchema;
  /** One team-stamped transaction on the Effect application client. */
  let run: <A, E>(
    body: Effect.Effect<A, E, Transaction>,
    options?: ScopeOptions,
  ) => Promise<A>;
  let runExit: <A, E>(
    body: Effect.Effect<A, E, Transaction>,
  ) => Promise<Exit.Exit<A, unknown>>;
  const cipher = testCipher();

  beforeAll(async () => {
    store = await makeStoreSchema();
    run = (body, options) => store.inTeam(TEST_TEAM_ID, body, options);
    runExit = (body) => store.exitInTeam(TEST_TEAM_ID, body);
  });
  afterAll(async () => {
    await store.dispose();
  });

  const create = (protocol: CurrentProtocol, ids?: Record<string, string>) =>
    run(createProtocol(TEST_TEAM_ID, cipher, { protocol, ...ids }));

  it('createProtocol round-trips through getDraftDocument', async () => {
    const { draftId } = await create(baseProtocol());
    expect(await run(getDraftDocument(TEST_TEAM_ID, draftId))).toEqual(
      baseProtocol(),
    );
  });

  it('createProtocol returns the same draft for a repeated creation identity', async () => {
    const protocolId = randomUUID();
    const draftId = randomUUID();
    const params = { protocol: baseProtocol(), protocolId, draftId };

    await expect(
      run(createProtocol(TEST_TEAM_ID, cipher, params)),
    ).resolves.toEqual({ protocolId, draftId, created: true });
    await expect(
      run(createProtocol(TEST_TEAM_ID, cipher, params)),
    ).resolves.toEqual({ protocolId, draftId, created: false });

    const rows = await store.rows(
      `SELECT count(*)::int AS count FROM protocol_drafts
       WHERE protocol_id = $1 AND draft_id = $2`,
      [protocolId, draftId],
    );
    expect(rows[0]).toEqual({ count: 1 });
  });

  it('createProtocol reports idempotence twice inside one transaction', async () => {
    const protocolId = randomUUID();
    const draftId = randomUUID();
    const params = { protocol: baseProtocol(), protocolId, draftId };

    const both = await run(
      Effect.gen(function* () {
        const first = yield* createProtocol(TEST_TEAM_ID, cipher, params);
        const second = yield* createProtocol(TEST_TEAM_ID, cipher, params);
        return { first, second };
      }),
    );
    expect(both.first).toEqual({ protocolId, draftId, created: true });
    expect(both.second).toEqual({ protocolId, draftId, created: false });

    expect(await run(getDraftDocument(TEST_TEAM_ID, draftId))).toEqual(
      baseProtocol(),
    );
  });

  it('createProtocol rolls back with the transaction it ran in', async () => {
    const protocolId = randomUUID();
    const draftId = randomUUID();

    const exit = await runExit(
      Effect.gen(function* () {
        yield* createProtocol(TEST_TEAM_ID, cipher, {
          protocol: baseProtocol(),
          protocolId,
          draftId,
        });
        return yield* Effect.fail(new Error('rollback create'));
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);

    await expect(
      run(getProtocolDraftMetadata(TEST_TEAM_ID, protocolId, draftId)),
    ).rejects.toThrow(/no draft/);
  });

  it('reads protocol draft metadata without loading section documents', async () => {
    const { protocolId, draftId } = await create(baseProtocol());

    // The mechanism changed with the port: the store is module functions now,
    // so there is no instance method to spy on. The invariant is the same one
    // and pinned harder — the metadata read is made in a transaction in which
    // every section row of the team has been deleted, which `getDraftSections`
    // could not survive. The transaction then fails, so nothing is kept.
    let metadata: unknown;
    let sectionsFailed: boolean | undefined;
    const exit = await runExit(
      Effect.gen(function* () {
        const { tx } = yield* Transaction;
        yield* tx
          .delete(sections)
          .where(eq(sections.teamId, TEST_TEAM_ID))
          .returning({ hash: sections.hash });
        metadata = yield* getProtocolDraftMetadata(
          TEST_TEAM_ID,
          protocolId,
          draftId,
        );
        // The same transaction cannot read a draft's documents any more, so
        // the read above demonstrably made no attempt to.
        sectionsFailed = Exit.isFailure(
          yield* Effect.exit(getDraftSections(TEST_TEAM_ID, draftId)),
        );
        return yield* Effect.fail(new Error('rollback metadata probe'));
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(metadata).toMatchObject({ id: protocolId, draftId });
    expect(sectionsFailed).toBe(true);

    // And the delete went with the rolled-back transaction.
    expect(await run(getDraftDocument(TEST_TEAM_ID, draftId))).toEqual(
      baseProtocol(),
    );
  });

  it('createProtocol rejects a section that fails write-time validation', async () => {
    const protocol = baseProtocol();
    (protocol.stages[0] as { label?: string }).label = '';
    await expect(create(protocol)).rejects.toThrow(
      SectionValidationFailedError,
    );
  });

  it('sync-engine edits are visible through getDraftDocument', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    const lease = await run(
      sync.acquire(draftId, 'stage:nameGenerator1', 'tab-1'),
    );
    expect(lease).not.toBeNull();
    await run(
      sync.commit({
        draftId,
        sectionId: 'stage:nameGenerator1',
        owner: 'tab-1',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'Renamed' }],
      }),
    );
    const document = (await run(getDraftDocument(TEST_TEAM_ID, draftId))) as {
      stages: { id: string; label: string }[];
    };
    expect(document.stages[0]!.label).toBe('Renamed');
  });

  it('sync commits can share an existing transaction and preserve deduplication', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    const lease = await run(
      sync.acquire(draftId, 'settings', 'transaction-tab'),
    );
    expect(lease).not.toBeNull();
    const params = {
      draftId,
      sectionId: 'settings',
      owner: 'transaction-tab',
      epoch: lease!.epoch,
      clientSeq: 1n,
      commands: [
        { op: 'set' as const, key: 'description', value: 'Transactional' },
      ],
    };

    // The commit runs in the caller's transaction now rather than opening one
    // of its own, so a caller that fails takes the commit with it — which is
    // what the rolled-back scope below asserts.
    let firstAttempt: boolean | undefined;
    const rolledBack = await runExit(
      Effect.gen(function* () {
        const result = yield* sync.commit(params);
        firstAttempt = result.deduped;
        return yield* Effect.fail(new Error('rollback commit'));
      }),
    );
    expect(Exit.isFailure(rolledBack)).toBe(true);
    expect(firstAttempt).toBe(false);

    const committed = await run(sync.commit(params));
    expect(committed.deduped).toBe(false);
    const replayed = await run(sync.commit(params));
    expect(replayed).toEqual({ ...committed, deduped: true });
  });

  it('addStage inserts section and order entry in one manifest advance', async () => {
    const { draftId } = await create(baseProtocol());
    const before = await run(getDraftSections(TEST_TEAM_ID, draftId));
    const result = await run(
      addStage(TEST_TEAM_ID, {
        draftId,
        stage: {
          id: 'info1',
          type: 'Information',
          label: 'About',
          title: 'About this study',
          items: [{ id: 'item1', type: 'text', content: 'Welcome.' }],
        },
        index: 1,
      }),
    );
    expect(result.manifestSeq).toBe(before.headSeq + 1n);

    const after = await run(getDraftSections(TEST_TEAM_ID, draftId));
    for (const [id, hash] of Object.entries(before.sectionHashes)) {
      if (id !== 'stageOrder') expect(after.sectionHashes[id]).toBe(hash);
    }
    const document = (await run(getDraftDocument(TEST_TEAM_ID, draftId))) as {
      stages: { id: string }[];
    };
    expect(document.stages.map((stage) => stage.id)).toEqual([
      'nameGenerator1',
      'info1',
      'sociogram1',
    ]);
  });

  it('structural mutations can share an existing transaction', async () => {
    const { draftId } = await create(baseProtocol());

    const result = await run(
      Effect.gen(function* () {
        const added = yield* addStage(TEST_TEAM_ID, {
          draftId,
          stage: {
            id: 'transactionalInfo',
            type: 'Information',
            label: 'Transactional',
            title: 'Transactional',
            items: [],
          },
          index: 1,
        });
        const moved = yield* moveStage(TEST_TEAM_ID, {
          draftId,
          stageId: 'transactionalInfo',
          toIndex: 0,
          expectedRevision: added.manifestSeq,
        });
        const unchanged = yield* moveStage(TEST_TEAM_ID, {
          draftId,
          stageId: 'transactionalInfo',
          toIndex: 0,
          expectedRevision: moved.manifestSeq,
        });
        return { added, moved, unchanged };
      }),
    );

    expect(result.moved.manifestSeq).toBe(result.added.manifestSeq + 1n);
    expect(result.unchanged).toEqual(result.moved);
    const document = (await run(getDraftDocument(TEST_TEAM_ID, draftId))) as {
      stages: { id: string }[];
    };
    expect(document.stages.map((stage) => stage.id)).toEqual([
      'transactionalInfo',
      'nameGenerator1',
      'sociogram1',
    ]);
  });

  it('addStage refuses duplicates, bad indexes, and invalid stages', async () => {
    const { draftId } = await create(baseProtocol());
    await expect(
      run(
        addStage(TEST_TEAM_ID, {
          draftId,
          stage: baseProtocol().stages[0]!,
        }),
      ),
    ).rejects.toThrow(/already exists/);
    await expect(
      run(
        addStage(TEST_TEAM_ID, {
          draftId,
          stage: {
            id: 'info2',
            type: 'Information',
            label: 'X',
            title: 'X',
            items: [{ id: 'item1', type: 'text', content: 'Y.' }],
          },
          index: 99,
        }),
      ),
    ).rejects.toThrow(/out of range/);
    await expect(
      run(
        addStage(TEST_TEAM_ID, {
          draftId,
          stage: { id: 'bad', type: 'Information' },
        }),
      ),
    ).rejects.toThrow(SectionValidationFailedError);
    for (const index of [1.5, Number.NaN]) {
      await expect(
        run(
          addStage(TEST_TEAM_ID, {
            draftId,
            stage: {
              id: 'info3',
              type: 'Information',
              label: 'X',
              title: 'X',
              items: [{ id: 'item1', type: 'text', content: 'Y.' }],
            },
            index,
          }),
        ),
      ).rejects.toThrow(/out of range/);
    }
  });

  it('removeStage drops the section from the manifest but keeps the row', async () => {
    const { draftId } = await create(baseProtocol());
    const before = await run(getDraftSections(TEST_TEAM_ID, draftId));
    const removedHash = before.sectionHashes['stage:sociogram1'];
    await run(removeStage(TEST_TEAM_ID, { draftId, stageId: 'sociogram1' }));

    const document = (await run(getDraftDocument(TEST_TEAM_ID, draftId))) as {
      stages: { id: string }[];
    };
    expect(document.stages.map((stage) => stage.id)).toEqual([
      'nameGenerator1',
    ]);
    const row = await store.rows(`SELECT 1 FROM sections WHERE hash = $1`, [
      removedHash,
    ]);
    expect(row).toHaveLength(1);

    await expect(
      run(removeStage(TEST_TEAM_ID, { draftId, stageId: 'sociogram1' })),
    ).rejects.toThrow(DraftStructureError);
  });

  it('adds and removes codebook entities', async () => {
    const { draftId } = await create(baseProtocol());
    await run(
      addCodebookEntity(TEST_TEAM_ID, {
        draftId,
        ref: { entity: 'node', typeId: 'place' },
        definition: {
          name: 'Place',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
        },
      }),
    );
    let document = (await run(getDraftDocument(TEST_TEAM_ID, draftId))) as {
      codebook: { node: Record<string, unknown> };
    };
    expect(Object.keys(document.codebook.node).toSorted()).toEqual([
      'person',
      'place',
    ]);

    await expect(
      run(
        addCodebookEntity(TEST_TEAM_ID, {
          draftId,
          ref: { entity: 'node', typeId: 'place' },
          definition: {
            name: 'Place',
            color: 'node-color-seq-3',
            shape: { default: 'square' },
          },
        }),
      ),
    ).rejects.toThrow(/already exists/);

    await run(
      removeCodebookEntity(TEST_TEAM_ID, {
        draftId,
        ref: { entity: 'node', typeId: 'place' },
      }),
    );
    document = (await run(getDraftDocument(TEST_TEAM_ID, draftId))) as {
      codebook: { node: Record<string, unknown> };
    };
    expect(Object.keys(document.codebook.node)).toEqual(['person']);
  });

  it('refuses a codebook type id the assembled protocol could never validate', async () => {
    const { draftId } = await create(baseProtocol());
    await expect(
      run(
        addCodebookEntity(TEST_TEAM_ID, {
          draftId,
          ref: { entity: 'node', typeId: 'person type' },
          definition: {
            name: 'Person Type',
            color: 'node-color-seq-3',
            shape: { default: 'square' },
          },
        }),
      ),
    ).rejects.toThrow(DraftStructureError);
    const document = (await run(getDraftDocument(TEST_TEAM_ID, draftId))) as {
      codebook: { node: Record<string, unknown> };
    };
    expect(Object.keys(document.codebook.node)).toEqual(['person']);
  });

  it('a validating sync server rejects a lease commit that would wedge the draft', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = createProtocolSyncServer();
    const lease = await run(sync.acquire(draftId, 'stageOrder', 'tab-1'));
    const before = await run(getDraftSections(TEST_TEAM_ID, draftId));

    await expect(
      run(
        sync.commit({
          draftId,
          sectionId: 'stageOrder',
          owner: 'tab-1',
          epoch: lease!.epoch,
          clientSeq: 1n,
          commands: [{ op: 'unset', key: 'stages' }],
        }),
      ),
    ).rejects.toThrow(SectionRejectedError);

    const after = await run(getDraftSections(TEST_TEAM_ID, draftId));
    expect(after.headManifestHash).toBe(before.headManifestHash);
    expect(await run(getDraftDocument(TEST_TEAM_ID, draftId))).toEqual(
      baseProtocol(),
    );
  });

  it('a validating sync server rejects a stage rename of its own id', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = createProtocolSyncServer();
    const lease = await run(sync.acquire(draftId, 'stage:sociogram1', 'tab-1'));

    await expect(
      run(
        sync.commit({
          draftId,
          sectionId: 'stage:sociogram1',
          owner: 'tab-1',
          epoch: lease!.epoch,
          clientSeq: 1n,
          commands: [{ op: 'set', key: 'id', value: 'renamed' }],
        }),
      ),
    ).rejects.toThrow(SectionRejectedError);
    expect(await run(validateDraft(TEST_TEAM_ID, draftId))).toEqual({
      valid: true,
    });
  });

  it('structural ops fence the stageOrder lease, rejecting stale positional commits', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    const lease = await run(sync.acquire(draftId, 'stageOrder', 'editor-tab'));
    expect(lease).not.toBeNull();

    await run(
      addStage(TEST_TEAM_ID, {
        draftId,
        stage: {
          id: 'infoFence',
          type: 'Information',
          label: 'Fence',
          title: 'Fence',
          items: [{ id: 'item1', type: 'text', content: 'Z.' }],
        },
        index: 0,
      }),
    );

    // The pending moveItem describes indices of the pre-insertion list.
    await expect(
      run(
        sync.commit({
          draftId,
          sectionId: 'stageOrder',
          owner: 'editor-tab',
          epoch: lease!.epoch,
          clientSeq: 1n,
          commands: [{ op: 'moveItem', key: 'stages', from: 0, to: 1 }],
        }),
      ),
    ).rejects.toThrow(LeaseRejectedError);
  });

  it('removal fences the section lease, so a re-added section rejects stale edits (ABA)', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    const lease = await run(
      sync.acquire(draftId, 'codebook:edge:knows', 'editor-tab'),
    );
    expect(lease).not.toBeNull();

    await run(
      removeCodebookEntity(TEST_TEAM_ID, {
        draftId,
        ref: { entity: 'edge', typeId: 'knows' },
      }),
    );
    await run(
      addCodebookEntity(TEST_TEAM_ID, {
        draftId,
        ref: { entity: 'edge', typeId: 'knows' },
        definition: { name: 'Knows', color: 'edge-color-seq-2' },
      }),
    );

    await expect(
      run(
        sync.commit({
          draftId,
          sectionId: 'codebook:edge:knows',
          owner: 'editor-tab',
          epoch: lease!.epoch,
          clientSeq: 1n,
          commands: [{ op: 'set', key: 'name', value: 'Stale' }],
        }),
      ),
    ).rejects.toThrow(LeaseRejectedError);
  });

  it('a structural op that waits for a commit sees the manifest that commit wrote', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    const lease = await run(sync.acquire(draftId, 'settings', 'commit-tab'));

    // The blocker is one owner transaction held open across the steps below:
    // it takes the row lock, writes a newer head once the case has read the
    // current one, and commits only when the case says so.
    const locked = Promise.withResolvers<void>();
    const headRead = Promise.withResolvers<{
      headSeq: bigint;
      headManifestHash: string;
      advanced: Record<string, string>;
    }>();
    const written = Promise.withResolvers<void>();
    const commit = Promise.withResolvers<void>();
    const blocker = store.run(
      Effect.gen(function* () {
        const harness = yield* TestDatabase;
        const { sql } = harness.owner;
        yield* harness.onOwner(
          Effect.gen(function* () {
            yield* sql.unsafe(`SELECT 1 FROM drafts WHERE id = $1 FOR UPDATE`, [
              draftId,
            ]);
            locked.resolve();
            const { headSeq, headManifestHash, advanced } =
              yield* Effect.promise(() => headRead.promise);
            yield* sql.unsafe(
              `INSERT INTO sections (team_id, hash, doc)
               VALUES ($1, 'advanced-hash', '{}'::jsonb)`,
              [TEST_TEAM_ID],
            );
            yield* sql.unsafe(
              `INSERT INTO manifests (draft_id, team_id, seq, hash, parent_hash, section_hashes)
               VALUES ($1, $5, $2, 'advanced-manifest', $3, $4::jsonb)`,
              [
                draftId,
                String(headSeq + 1n),
                headManifestHash,
                JSON.stringify(advanced),
                TEST_TEAM_ID,
              ],
            );
            yield* sql.unsafe(
              `UPDATE drafts SET head_seq = $2, head_manifest_hash = 'advanced-manifest'
               WHERE id = $1`,
              [draftId, String(headSeq + 1n)],
            );
            written.resolve();
            yield* Effect.promise(() => commit.promise);
          }),
        );
      }),
    );
    // A blocker that fails rejects the step the case is waiting on, rather
    // than leaving it to hang until the timeout.
    const step = (gate: Promise<void>) => Promise.race([gate, blocker]);

    await step(locked.promise);
    const head = await run(getDraftSections(TEST_TEAM_ID, draftId));
    const advanced = { ...head.sectionHashes, settings: 'advanced-hash' };
    headRead.resolve({
      headSeq: head.headSeq,
      headManifestHash: head.headManifestHash,
      advanced,
    });
    await step(written.promise);

    const pending = run(
      removeStage(TEST_TEAM_ID, { draftId, stageId: 'sociogram1' }),
    );
    await store.run(waitForLockWait());
    commit.resolve();
    await blocker;

    const result = await pending;
    expect(result.manifestSeq).toBe(head.headSeq + 2n);
    await run(sync.release(draftId, 'settings', 'commit-tab', lease!.epoch));
  });

  it('a validating sync server rejects a stage order the draft cannot assemble', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = createProtocolSyncServer();
    const lease = await run(sync.acquire(draftId, 'stageOrder', 'tab-1'));
    const before = await run(getDraftSections(TEST_TEAM_ID, draftId));

    for (const stages of [
      ['nameGenerator1', 'sociogram1', 'ghost'],
      ['nameGenerator1'],
      ['nameGenerator1', 'sociogram1', 'sociogram1'],
    ]) {
      await expect(
        run(
          sync.commit({
            draftId,
            sectionId: 'stageOrder',
            owner: 'tab-1',
            epoch: lease!.epoch,
            clientSeq: 1n,
            commands: [{ op: 'set', key: 'stages', value: stages }],
          }),
        ),
      ).rejects.toThrow(SectionRejectedError);
    }

    const after = await run(getDraftSections(TEST_TEAM_ID, draftId));
    expect(after.headManifestHash).toBe(before.headManifestHash);
    expect(await run(getDraftDocument(TEST_TEAM_ID, draftId))).toEqual(
      baseProtocol(),
    );
  });

  it('reports an unassemblable draft as invalid rather than throwing', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    const lease = await run(sync.acquire(draftId, 'stageOrder', 'tab-1'));
    await run(
      sync.commit({
        draftId,
        sectionId: 'stageOrder',
        owner: 'tab-1',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'stages', value: ['ghost'] }],
      }),
    );

    const validation = await run(validateDraft(TEST_TEAM_ID, draftId));
    expect(validation.valid).toBe(false);
    const published = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    expect(published.status).toBe('invalid');
  });

  it('refuses to take over a lease whose section has been removed', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    await run(sync.acquire(draftId, 'stage:sociogram1', 'editor-tab'));
    await run(removeStage(TEST_TEAM_ID, { draftId, stageId: 'sociogram1' }));

    await expect(
      run(sync.takeover(draftId, 'stage:sociogram1', 'other-tab')),
    ).rejects.toThrow(UnknownSectionError);
  });

  it('a discarded draft rejects a queued commit and refuses to resume', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    const lease = await run(sync.acquire(draftId, 'settings', 'editor-tab'));
    await run(discardDraft(TEST_TEAM_ID, draftId));

    await expect(
      run(
        sync.commit({
          draftId,
          sectionId: 'settings',
          owner: 'editor-tab',
          epoch: lease!.epoch,
          clientSeq: 1n,
          commands: [{ op: 'set', key: 'description', value: 'orphan' }],
        }),
      ),
    ).rejects.toThrow(LeaseRejectedError);
    // `resume` reads twice and refuses to do it outside one snapshot, so its
    // scope names the isolation level the caller is now responsible for.
    await expect(
      run(sync.resume(draftId, 'editor-tab'), {
        isolation: 'repeatable read',
      }),
    ).rejects.toThrow(UnknownDraftError);
  });

  it('discardDraft removes every draft row', async () => {
    const { draftId } = await create(baseProtocol());
    const sync = makeTestSyncServer();
    await run(sync.acquire(draftId, 'settings', 'tab-1'));
    await run(discardDraft(TEST_TEAM_ID, draftId));

    for (const table of [
      'drafts',
      'manifests',
      'protocol_drafts',
      'command_log',
      'leases',
    ]) {
      const column = table === 'drafts' ? 'id' : 'draft_id';
      const res = await store.rows(
        `SELECT 1 FROM ${table} WHERE ${column} = $1`,
        [draftId],
      );
      expect(res, table).toHaveLength(0);
    }
  });

  describe('API-key assets (#1900)', () => {
    // Not Mapbox-token shaped, so `pnpm check:mapbox-tokens` does not read it
    // as a committed access token; see the guard's own comment.
    const KEY = 'map-key-not-a-real-key';

    function protocolWithKey(): CurrentProtocol {
      return {
        ...baseProtocol(),
        assetManifest: {
          mapKey: { name: 'Mapbox token', type: 'apikey', value: KEY },
        },
      } as unknown as CurrentProtocol;
    }

    it('seals the key and stores a manifest that does not carry it', async () => {
      const { protocolId, draftId } = await create(protocolWithKey());

      const document = await run(getDraftDocument(TEST_TEAM_ID, draftId));
      const manifest = document.assetManifest as Record<
        string,
        Record<string, unknown>
      >;
      expect(manifest.mapKey).toEqual({
        name: 'Mapbox token',
        type: 'apikey',
      });

      const sealed = await store.rows(
        `SELECT key_id FROM protocol_asset_keys
         WHERE team_id = $1 AND protocol_id = $2 AND asset_id = $3`,
        [TEST_TEAM_ID, protocolId, 'mapKey'],
      );
      expect(sealed).toHaveLength(1);
      await expect(
        run(
          openAssetKey(cipher, {
            teamId: TEST_TEAM_ID,
            protocolId,
            assetId: 'mapKey',
          }),
        ),
      ).resolves.toBe(KEY);
    });

    it('never writes the key into any section row', async () => {
      await create(protocolWithKey());

      // The whole table, because a key must not be at rest in any revision of
      // any section — not only in the manifest the draft happens to point at.
      const docs = await store.rows<{ doc: string }>(
        `SELECT doc::text AS doc FROM sections`,
      );
      const all = docs.map((row) => row.doc).join('\n');
      expect(all).not.toContain(KEY);
    });

    it('still refuses an import whose apikey asset has no value', async () => {
      // Stripping must not become a way to smuggle an invalid manifest past
      // the write-time section validation.
      await expect(
        create({
          ...baseProtocol(),
          assetManifest: {
            mapKey: { name: 'Mapbox token', type: 'apikey', value: '' },
          },
        } as unknown as CurrentProtocol),
      ).rejects.toThrow(SectionValidationFailedError);
    });

    it('publishes a draft whose key is sealed, validating against the placeholder', async () => {
      const { draftId } = await create(protocolWithKey());

      await expect(run(validateDraft(TEST_TEAM_ID, draftId))).resolves.toEqual({
        valid: true,
      });
      const published = await run(publishDraft(TEST_TEAM_ID, { draftId }));
      expect(published.status).toBe('published');
    });

    it('refuses a sync commit that would write a key into the assets section', async () => {
      // The client route for a key is `resources.stage`, which promotes it
      // through the host and seals it. A commit carrying one is refused rather
      // than stripped, so the editor is told instead of silently losing it.
      const { draftId } = await create(baseProtocol());
      const sync = createProtocolSyncServer();
      const lease = await run(sync.acquire(draftId, 'assets', 'tab-1'));
      const before = await run(getDraftSections(TEST_TEAM_ID, draftId));

      await expect(
        run(
          sync.commit({
            draftId,
            sectionId: 'assets',
            owner: 'tab-1',
            epoch: lease!.epoch,
            clientSeq: 1n,
            commands: [
              {
                op: 'set',
                key: 'mapKey',
                value: { name: 'Mapbox token', type: 'apikey', value: KEY },
              },
            ],
          }),
        ),
      ).rejects.toThrow(SectionRejectedError);

      const after = await run(getDraftSections(TEST_TEAM_ID, draftId));
      expect(after.headManifestHash).toBe(before.headManifestHash);
    });

    it('admits a sync commit that writes a file asset', async () => {
      // The refusal has to be about keys, not about the assets section: a
      // researcher adding a geojson through the same path must still work.
      const { draftId } = await create(baseProtocol());
      const sync = createProtocolSyncServer();
      const lease = await run(sync.acquire(draftId, 'assets', 'tab-2'));

      await expect(
        run(
          sync.commit({
            draftId,
            sectionId: 'assets',
            owner: 'tab-2',
            epoch: lease!.epoch,
            clientSeq: 1n,
            commands: [
              {
                op: 'set',
                key: 'map',
                value: {
                  name: 'Districts',
                  type: 'geojson',
                  source: 'districts.geojson',
                },
              },
            ],
          }),
        ),
      ).resolves.toBeDefined();
    });

    it('admits a sync commit on the assets section of a protocol with a sealed key', async () => {
      // The stored manifest carries the key entry WITHOUT its value, and
      // schema 8 requires an `apikey` asset to have one. Validating the merged
      // section as it is stored therefore refused every later edit of the
      // assets section — adding a geojson beside a promoted key — with an
      // issue at [mapKey, value] that no client could ever satisfy.
      const { draftId } = await create(protocolWithKey());
      const sync = createProtocolSyncServer();
      const lease = await run(sync.acquire(draftId, 'assets', 'tab-3'));

      await expect(
        run(
          sync.commit({
            draftId,
            sectionId: 'assets',
            owner: 'tab-3',
            epoch: lease!.epoch,
            clientSeq: 1n,
            commands: [
              {
                op: 'set',
                key: 'map',
                value: {
                  name: 'Districts',
                  type: 'geojson',
                  source: 'districts.geojson',
                },
              },
            ],
          }),
        ),
      ).resolves.toBeDefined();

      // And the commit did not put the key back: the merged document the
      // validator saw carried a placeholder, which is never written. The whole
      // table, because the commit wrote a new revision of the section.
      const docs = await store.rows<{ doc: string }>(
        `SELECT doc::text AS doc FROM sections`,
      );
      const all = docs.map((row) => row.doc).join('\n');
      expect(all).not.toContain(KEY);
      expect(all).not.toContain(ASSET_KEY_PLACEHOLDER);
    });

    it('returns the redacted manifest from a published version too', async () => {
      const { draftId } = await create(protocolWithKey());
      const published = await run(publishDraft(TEST_TEAM_ID, { draftId }));
      if (published.status !== 'published') {
        throw new Error(`expected a publication, got ${published.status}`);
      }

      const document = await run(
        getVersionDocument(TEST_TEAM_ID, published.versionId),
      );
      expect(JSON.stringify(document)).not.toContain(KEY);
    });
  });

  it('unknown drafts and versions surface as errors', async () => {
    await expect(
      run(getDraftDocument(TEST_TEAM_ID, randomUUID())),
    ).rejects.toThrow(/no draft/);
    await expect(
      run(getVersionDocument(TEST_TEAM_ID, randomUUID())),
    ).rejects.toThrow(/no version/);
    await expect(
      run(createDraftFromVersion(TEST_TEAM_ID, { versionId: randomUUID() })),
    ).rejects.toThrow(/no version/);
  });
});
