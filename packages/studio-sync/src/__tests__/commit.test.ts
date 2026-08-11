// The commit path: client_seq idempotency via the log's unique constraint,
// per-draft serialization via the draft-head row lock, and the
// disconnect-during-commit retransmission scenario.
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyCommands, contentHash } from '../apply.ts';
import { forceExpire, LeaseRejectedError, type SyncServer } from '../server.ts';
import {
  assertLinearChain,
  dbAvailable,
  DEFAULT_SECTIONS,
  makeDraft,
  makeServer,
} from './helpers.ts';

describe.skipIf(!dbAvailable)('commit path', () => {
  let db: Pool;
  let server: SyncServer;

  beforeAll(async () => {
    ({ db, server } = await makeServer('sync_commit'));
  });

  afterAll(async () => {
    await db.end();
  });
  it('advances the manifest and produces the hash the shared engine predicts', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    const commands = [
      { op: 'set', key: 'label', value: 'Renamed' } as const,
      {
        op: 'insertItem',
        key: 'prompts',
        index: 0,
        item: { id: 'p1' },
      } as const,
    ];
    const result = await server.commit({
      draftId: draft,
      sectionId: 'stage-1',
      owner: 'tab-A',
      epoch: a!.epoch,
      clientSeq: 1n,
      commands: [...commands],
    });
    const expected = contentHash(
      applyCommands(DEFAULT_SECTIONS['stage-1']!, [...commands]),
    );
    expect(result.sectionHash).toBe(expected);
    expect(result.manifestSeq).toBe(1n);
  });

  it('disconnect-during-commit: a retransmitted client_seq is deduplicated, not re-applied', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    const params = {
      draftId: draft,
      sectionId: 'stage-1',
      owner: 'tab-A',
      epoch: a!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'label', value: 'once' } as const],
    };

    // The client sends, the ack is lost, the client retransmits.
    const first = await server.commit({
      ...params,
      commands: [...params.commands],
    });
    const second = await server.commit({
      ...params,
      commands: [...params.commands],
    });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.manifestSeq).toBe(first.manifestSeq);
    expect(second.sectionHash).toBe(first.sectionHash);
  });

  it('a committed batch retried after lease loss is deduplicated, not rejected', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    const params = {
      draftId: draft,
      sectionId: 'stage-1',
      owner: 'tab-A',
      epoch: a!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'label', value: 'persisted' } as const],
    };

    // The commit lands but the acknowledgement is lost…
    const first = await server.commit({
      ...params,
      commands: [...params.commands],
    });

    // …and before the retry arrives, the lease expires and another tab
    // takes the section over (epoch bump).
    await forceExpire(db, draft, 'stage-1');
    const b = await server.acquire(draft, 'stage-1', 'tab-B');
    expect(b?.epoch).toBe(2n);

    // The exact retransmission must return the recorded result — treating
    // it as a lease rejection would make the client roll back a batch the
    // server has already persisted.
    const retry = await server.commit({
      ...params,
      commands: [...params.commands],
    });
    expect(retry.deduped).toBe(true);
    expect(retry.manifestSeq).toBe(first.manifestSeq);
    expect(retry.sectionHash).toBe(first.sectionHash);

    // NEW work under the stale lease is still fenced out.
    await expect(
      server.commit({
        ...params,
        clientSeq: 2n,
        commands: [{ op: 'set', key: 'label', value: 'stale' } as const],
      }),
    ).rejects.toThrow(LeaseRejectedError);

    const log = await db.query(
      `SELECT count(*)::int AS c FROM command_log WHERE draft_id = $1`,
      [draft],
    );
    expect((log.rows[0] as { c: number }).c).toBe(1);
    expect(await assertLinearChain(server, draft)).toBe(2); // seq 0 + one commit
  });

  it('concurrent identical retransmissions admit exactly one application', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    const make = () =>
      server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-A',
        epoch: a!.epoch,
        clientSeq: 7n,
        commands: [{ op: 'set', key: 'label', value: 'racing' }],
      });
    const results = await Promise.all([make(), make(), make(), make()]);
    const applied = results.filter((r) => !r.deduped);
    expect(applied).toHaveLength(1);
    expect(new Set(results.map((r) => String(r.manifestSeq))).size).toBe(1);
  });

  it('per-draft serialization: concurrent commits to different sections never fork the chain', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    const b = await server.acquire(draft, 'stage-2', 'tab-B');
    const c = await server.acquire(draft, 'codebook-person', 'tab-C');

    const N = 10;
    const work = [
      ...Array.from(
        { length: N },
        (_, i) => () =>
          server.commit({
            draftId: draft,
            sectionId: 'stage-1',
            owner: 'tab-A',
            epoch: a!.epoch,
            clientSeq: BigInt(i + 1),
            commands: [{ op: 'set', key: 'label', value: `A${i}` }],
          }),
      ),
      ...Array.from(
        { length: N },
        (_, i) => () =>
          server.commit({
            draftId: draft,
            sectionId: 'stage-2',
            owner: 'tab-B',
            epoch: b!.epoch,
            clientSeq: BigInt(i + 1),
            commands: [{ op: 'set', key: 'label', value: `B${i}` }],
          }),
      ),
      ...Array.from(
        { length: N },
        (_, i) => () =>
          server.commit({
            draftId: draft,
            sectionId: 'codebook-person',
            owner: 'tab-C',
            epoch: c!.epoch,
            clientSeq: BigInt(i + 1),
            commands: [{ op: 'set', key: 'name', value: `C${i}` }],
          }),
      ),
    ];
    // Shuffle then fire everything concurrently.
    work.sort(() => Math.random() - 0.5);
    await Promise.all(work.map((w) => w()));

    // 3N commits + the seed manifest, one linear chain, no gaps, no forks.
    expect(await assertLinearChain(server, draft)).toBe(3 * N + 1);
  });

  it('rejects a commit from a non-holder or wrong epoch', async () => {
    const draft = await makeDraft(server);
    await server.acquire(draft, 'stage-1', 'tab-A');
    await expect(
      server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-B',
        epoch: 1n,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'intruder' }],
      }),
    ).rejects.toThrow();
    await expect(
      server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-A',
        epoch: 2n,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'wrong epoch' }],
      }),
    ).rejects.toThrow();
  });
});
