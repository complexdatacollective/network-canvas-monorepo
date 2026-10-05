import { randomUUID } from 'node:crypto';

import { Effect } from 'effect';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makeSyncServer, sectionExists } from '../server.ts';
import { Transaction } from '../tenant.ts';
import {
  assertLinearChain,
  dbAvailable,
  DEFAULT_SECTIONS,
  makeDraft,
  makeServer,
  makeSyncFacade,
  type RunTenant,
  type SyncFacade,
  TEST_TEAM_ID,
} from './helpers.ts';

const runFragment = (draftId: string, sectionId: string) =>
  Effect.gen(function* () {
    const open = yield* Transaction;
    return yield* open.tx.execute(
      sectionExists(draftId, sectionId, TEST_TEAM_ID),
      'objects',
    );
  });

describe.skipIf(!dbAvailable)('the transaction seam', () => {
  let db: Pool;
  let dispose: () => Promise<void>;
  let run: RunTenant;
  let server: SyncFacade;
  const sync = makeSyncServer();

  beforeAll(async () => {
    ({ db, run, server, dispose } = await makeServer('sync_transaction'));
  });

  afterAll(async () => {
    await dispose();
  });

  it('runs a whole open-and-edit sequence inside one transaction', async () => {
    const draftId = randomUUID();
    const chain = await run(
      Effect.gen(function* () {
        yield* sync.createDraft(draftId, DEFAULT_SECTIONS);
        const lease = yield* sync.acquire(draftId, 'stage-1', 'tab-A');
        if (lease === null) throw new Error('no lease');
        yield* sync.commit({
          draftId,
          sectionId: 'stage-1',
          owner: 'tab-A',
          epoch: lease.epoch,
          clientSeq: 1n,
          commands: [{ op: 'set', key: 'label', value: 'in one go' }],
        });
        return yield* sync.manifestChain(draftId);
      }),
    );
    expect(chain.map((entry) => entry.seq)).toEqual([0n, 1n]);
  });

  it('rolls the whole sequence back when the caller fails after it', async () => {
    const draftId = randomUUID();
    await expect(
      run(
        Effect.gen(function* () {
          yield* sync.createDraft(draftId, DEFAULT_SECTIONS);
          const lease = yield* sync.acquire(draftId, 'stage-1', 'tab-A');
          if (lease === null) throw new Error('no lease');
          yield* sync.commit({
            draftId,
            sectionId: 'stage-1',
            owner: 'tab-A',
            epoch: lease.epoch,
            clientSeq: 1n,
            commands: [{ op: 'set', key: 'label', value: 'never lands' }],
          });
          return yield* Effect.fail(new Error('the host changed its mind'));
        }),
      ),
    ).rejects.toThrow('the host changed its mind');

    for (const [table, column] of [
      ['drafts', 'id'],
      ['manifests', 'draft_id'],
      ['leases', 'draft_id'],
      ['command_log', 'draft_id'],
    ]) {
      const rows = await db.query(
        `SELECT count(*)::int AS c FROM ${table} WHERE ${column} = $1`,
        [draftId],
      );
      expect({ table, ...(rows.rows[0] as { c: number }) }).toEqual({
        table,
        c: 0,
      });
    }
  });

  it('refuses to run in a scope that stamps no team', async () => {
    await expect(
      run(sync.manifestChain(randomUUID()), { teamId: null }),
    ).rejects.toThrow(/may only run in a team-stamped transaction/);
  });

  describe('resume and the single snapshot', () => {
    it('refuses a read-committed transaction', async () => {
      const draft = await makeDraft(server);
      await expect(run(sync.resume(draft, 'tab-A'))).rejects.toThrow(
        /repeatable read/,
      );
    });

    it('accepts serializable, which is stricter', async () => {
      const draft = await makeDraft(server);
      const resumed = await run(sync.resume(draft, 'tab-A'), {
        isolation: 'serializable',
      });
      expect(resumed.head.seq).toBe(0n);
    });
  });

  describe('the shared section-exists fragment', () => {
    it('acquire, takeover and the standalone check agree on a boundary row', async () => {
      const draft = await makeDraft(server);
      const seed = (
        await db.query(
          `SELECT section_hashes FROM manifests WHERE draft_id = $1 AND seq = 0`,
          [draft],
        )
      ).rows[0] as { section_hashes: Record<string, string> };
      const headOnlyStage1 = Object.fromEntries(
        Object.entries(seed.section_hashes).filter(([id]) => id === 'stage-1'),
      );
      await db.query(
        `INSERT INTO manifests (draft_id, team_id, seq, hash, parent_hash, section_hashes)
         VALUES ($1, $2, 1, 'head-hash', NULL, $3)`,
        [draft, TEST_TEAM_ID, JSON.stringify(headOnlyStage1)],
      );
      await db.query(
        `UPDATE drafts SET head_seq = 1, head_manifest_hash = 'head-hash' WHERE id = $1`,
        [draft],
      );

      await db.query(
        `INSERT INTO leases (draft_id, team_id, section_id, owner, epoch, expires_at)
         VALUES ($1, $2, 'stage-2', 'squatter', 1, clock_timestamp() + interval '1 hour')`,
        [draft, TEST_TEAM_ID],
      );

      const standalone = await run(runFragment(draft, 'stage-2'));
      expect(standalone).toHaveLength(0);
      await expect(server.acquire(draft, 'stage-2', 'tab-A')).rejects.toThrow(
        /no section stage-2/,
      );
      await expect(server.takeover(draft, 'stage-2', 'tab-A')).rejects.toThrow(
        /no section stage-2/,
      );

      const present = await run(runFragment(draft, 'stage-1'));
      expect(present).toHaveLength(1);
      expect(await server.acquire(draft, 'stage-1', 'tab-A')).not.toBeNull();
      expect(await server.takeover(draft, 'stage-1', 'tab-B')).not.toBeNull();
    });
  });

  describe('zero-row outcomes', () => {
    it('acquire: no row when another owner holds a live lease', async () => {
      const draft = await makeDraft(server);
      await server.acquire(draft, 'stage-1', 'tab-A');
      expect(await server.acquire(draft, 'stage-1', 'tab-B')).toBeNull();
    });

    it('takeover: no row when the section has never been leased', async () => {
      const draft = await makeDraft(server);
      expect(await server.takeover(draft, 'stage-1', 'tab-A')).toBeNull();
      const rows = await db.query(
        `SELECT count(*)::int AS c FROM leases WHERE draft_id = $1`,
        [draft],
      );
      expect((rows.rows[0] as { c: number }).c).toBe(0);
    });

    it('renew: no row for the wrong owner or the wrong epoch', async () => {
      const draft = await makeDraft(server);
      const lease = await server.acquire(draft, 'stage-1', 'tab-A');
      expect(lease).not.toBeNull();
      expect(await server.renew(draft, 'stage-1', 'tab-B', 1n)).toBeNull();
      expect(await server.renew(draft, 'stage-1', 'tab-A', 99n)).toBeNull();
      expect(await server.renew(draft, 'stage-1', 'tab-A', 1n)).not.toBeNull();
    });

    it('release: releasing a lease one does not hold changes nothing', async () => {
      const draft = await makeDraft(server);
      const lease = await server.acquire(draft, 'stage-1', 'tab-A');
      const before = (
        await db.query(
          `SELECT expires_at FROM leases WHERE draft_id = $1 AND section_id = 'stage-1'`,
          [draft],
        )
      ).rows[0] as { expires_at: Date };

      await server.release(draft, 'stage-1', 'tab-B', lease!.epoch);
      await server.release(draft, 'stage-1', 'tab-A', 99n);

      const after = (
        await db.query(
          `SELECT owner, expires_at FROM leases WHERE draft_id = $1 AND section_id = 'stage-1'`,
          [draft],
        )
      ).rows[0] as { owner: string; expires_at: Date };
      expect(after.owner).toBe('tab-A');
      expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());

      await server.release(draft, 'stage-1', 'tab-A', lease!.epoch);
      expect((await server.acquire(draft, 'stage-1', 'tab-C'))?.epoch).toBe(2n);
    });
  });

  it('turns a validator refusal into a typed failure and rolls the commit back', async () => {
    const refused = makeSyncFacade(run, {
      validateSection: (sectionId) => {
        throw new Error(`refusing ${sectionId}`);
      },
    });
    const draft = await makeDraft(server);
    const lease = await server.acquire(draft, 'stage-1', 'tab-A');
    const failure = await run(
      Effect.flip(
        makeSyncServer({
          validateSection: (sectionId) => {
            throw new Error(`refusing ${sectionId}`);
          },
        }).commit({
          draftId: draft,
          sectionId: 'stage-1',
          owner: 'tab-A',
          epoch: lease!.epoch,
          clientSeq: 1n,
          commands: [{ op: 'set', key: 'label', value: 'refused' }],
        }),
      ),
    );
    expect(failure._tag).toBe('SectionRejectedError');
    expect(failure.message).toBe('refusing stage-1');

    await expect(
      refused.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-A',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'refused' }],
      }),
    ).rejects.toThrow('refusing stage-1');

    expect(await assertLinearChain(server, draft)).toBe(1);
  });

  describe('row shapes', () => {
    it('reads every int8 column as a bigint, with no conversion left', async () => {
      const draft = await makeDraft(server);
      const lease = await server.acquire(draft, 'stage-1', 'tab-A');
      await server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-A',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'shapes' }],
      });
      const resumed = await server.resume(draft, 'tab-A');
      expect(typeof resumed.head.seq).toBe('bigint');
      expect(typeof resumed.lastApplied['stage-1']?.epoch).toBe('bigint');
      expect(typeof resumed.lastApplied['stage-1']?.clientSeq).toBe('bigint');
      const chain = await server.manifestChain(draft);
      expect(chain.map((entry) => typeof entry.seq)).toEqual([
        'bigint',
        'bigint',
      ]);
      const commit = await server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-A',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'shapes' }],
      });
      expect(commit.deduped).toBe(true);
      expect(typeof commit.manifestSeq).toBe('bigint');
    });

    it('round-trips a jsonb document as an object, not a JSON string', async () => {
      const draft = await makeDraft(server, {
        'stage-1': { type: 'NameGenerator', label: 'People', prompts: [] },
      });
      const resumed = await server.resume(draft, 'tab-A');
      const doc = await server.getSection(resumed.sectionHashes['stage-1']!);
      expect(doc).toEqual({
        type: 'NameGenerator',
        label: 'People',
        prompts: [],
      });
    });

    it('stores the command log as jsonb the log itself replays', async () => {
      const draft = await makeDraft(server);
      const lease = await server.acquire(draft, 'stage-1', 'tab-A');
      await server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-A',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'logged' }],
      });
      const log = await db.query(
        `SELECT commands FROM command_log WHERE draft_id = $1`,
        [draft],
      );
      expect((log.rows[0] as { commands: unknown }).commands).toEqual([
        { op: 'set', key: 'label', value: 'logged' },
      ]);
    });
  });
});
