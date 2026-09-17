// The lease state machine's specified failure modes, each exercised against
// real atomic conditional statements on Postgres. Time passage (a slept
// laptop) is simulated by forceExpire, which touches only expires_at.
import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LeaseRejectedError,
  SectionRejectedError,
  UnknownSectionError,
} from '../server.ts';
import {
  assertLinearChain,
  dbAvailable,
  expireLease,
  makeDraft,
  makeServer,
  type RunTenant,
  type SyncFacade,
} from './helpers.ts';

describe.skipIf(!dbAvailable)('lease state machine', () => {
  let db: Pool;
  let dispose: () => Promise<void>;
  let run: RunTenant;
  let server: SyncFacade;

  beforeAll(async () => {
    ({ db, run, server, dispose } = await makeServer('sync_lease'));
  });

  afterAll(async () => {
    await dispose();
  });
  it('acquires a free lease at epoch 1 and refuses a second owner', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    expect(a?.epoch).toBe(1n);
    const b = await server.acquire(draft, 'stage-1', 'tab-B');
    expect(b).toBeNull();
  });

  it("re-acquiring one's own active lease is idempotent (lost acquire response)", async () => {
    const draft = await makeDraft(server);
    const first = await server.acquire(draft, 'stage-1', 'tab-A');
    expect(first?.epoch).toBe(1n);
    // The response was lost; the same tab retries. It must get its lease
    // back immediately — same epoch, refreshed TTL — not read the section
    // as unavailable until expiry.
    const retry = await server.acquire(draft, 'stage-1', 'tab-A');
    expect(retry?.epoch).toBe(1n);
    // Another owner is still refused.
    expect(await server.acquire(draft, 'stage-1', 'tab-B')).toBeNull();
  });

  it("re-acquiring one's own expired lease still bumps the epoch", async () => {
    const draft = await makeDraft(server);
    const first = await server.acquire(draft, 'stage-1', 'tab-A');
    expect(first?.epoch).toBe(1n);
    await expireLease(run, draft, 'stage-1');
    // The same owner after expiry is a fresh claim: pre-sleep in-flight
    // commits must be fenced out, so the epoch advances.
    const again = await server.acquire(draft, 'stage-1', 'tab-A');
    expect(again?.epoch).toBe(2n);
  });

  it('sleep/wake takeover: expired lease is taken over with a bumped epoch; the sleeper is fenced out', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    expect(a?.epoch).toBe(1n);

    // Laptop A sleeps past expiry; B observes the lease as free and takes over.
    await expireLease(run, draft, 'stage-1');
    const b = await server.acquire(draft, 'stage-1', 'tab-B');
    expect(b?.epoch).toBe(2n);

    // A wakes: heartbeat fails…
    expect(await server.renew(draft, 'stage-1', 'tab-A', 1n)).toBeNull();
    // …and a commit under the old (owner, epoch) is rejected.
    await expect(
      server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-A',
        epoch: 1n,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'stale write' }],
      }),
    ).rejects.toThrow(LeaseRejectedError);

    // B's writes proceed under epoch 2.
    const ok = await server.commit({
      draftId: draft,
      sectionId: 'stage-1',
      owner: 'tab-B',
      epoch: 2n,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'label', value: 'B owns this' }],
    });
    expect(ok.manifestSeq).toBe(1n);
  });

  it('late heartbeat cannot resurrect an expired lease', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    await expireLease(run, draft, 'stage-1');

    // The late heartbeat arrives before any takeover — it must still fail:
    // another client may already have observed the lease as free.
    expect(await server.renew(draft, 'stage-1', 'tab-A', a!.epoch)).toBeNull();

    // The lease is still free for a successor.
    const b = await server.acquire(draft, 'stage-1', 'tab-B');
    expect(b?.epoch).toBe(2n);
  });

  it('expiry-window write: commit after expiry but before takeover is rejected (epoch alone is not sufficient)', async () => {
    const draft = await makeDraft(server);
    await server.acquire(draft, 'stage-1', 'tab-A');
    await expireLease(run, draft, 'stage-1');

    // No takeover has happened — owner and epoch still match. Only the
    // commit-time expires_at check stands between a slept laptop and a
    // silent write.
    await expect(
      server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'tab-A',
        epoch: 1n,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'expiry-window write' }],
      }),
    ).rejects.toThrow(LeaseRejectedError);
  });

  it('duplicate-tab takeover: explicit takeover of an ACTIVE lease bumps the epoch and fences the first tab', async () => {
    const draft = await makeDraft(server);
    const tab1 = await server.acquire(draft, 'stage-1', 'user1-tab1');
    expect(tab1?.epoch).toBe(1n);

    // Second tab of the same user: read-only by default; the explicit
    // "take over editing" action performs an epoch-bumping takeover.
    const tab2 = await server.takeover(draft, 'stage-1', 'user1-tab2');
    expect(tab2?.epoch).toBe(2n);

    // Tab 1's in-flight commit (sent before it learned of the takeover)
    // must be rejected — two tabs cannot silently interleave writes.
    await expect(
      server.commit({
        draftId: draft,
        sectionId: 'stage-1',
        owner: 'user1-tab1',
        epoch: 1n,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'label', value: 'tab1 write' }],
      }),
    ).rejects.toThrow(LeaseRejectedError);

    const ok = await server.commit({
      draftId: draft,
      sectionId: 'stage-1',
      owner: 'user1-tab2',
      epoch: 2n,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'label', value: 'tab2 write' }],
    });
    expect(ok.deduped).toBe(false);
  });

  it('clean release keeps the epoch monotonic for the next holder', async () => {
    const draft = await makeDraft(server);
    const a = await server.acquire(draft, 'stage-1', 'tab-A');
    await server.release(draft, 'stage-1', 'tab-A', a!.epoch);
    const b = await server.acquire(draft, 'stage-1', 'tab-B');
    expect(b?.epoch).toBe(2n);
  });

  it('refuses a lease for a section the draft does not contain', async () => {
    const draft = await makeDraft(server);
    await expect(
      server.acquire(draft, 'stage-does-not-exist', 'tab-A'),
    ).rejects.toThrow(UnknownSectionError);
    // And leaves nothing behind: an unconditional insert would accumulate
    // meaningless rows for every arbitrary id a client sends.
    const rows = await db.query(
      `SELECT count(*)::int AS c FROM leases WHERE draft_id = $1`,
      [draft],
    );
    expect((rows.rows[0] as { c: number }).c).toBe(0);
  });

  it('refuses a lease for a draft that does not exist', async () => {
    await expect(
      server.acquire(randomUUID(), 'stage-1', 'tab-A'),
    ).rejects.toThrow(UnknownSectionError);
  });

  it('racing acquires on an expired lease admit exactly one winner', async () => {
    const draft = await makeDraft(server);
    await server.acquire(draft, 'stage-1', 'tab-A');
    await expireLease(run, draft, 'stage-1');

    const contenders = Array.from({ length: 8 }, (_, i) => `contender-${i}`);
    const results = await Promise.all(
      contenders.map((owner) => server.acquire(draft, 'stage-1', owner)),
    );
    const winners = results.filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.epoch).toBe(2n);
    await assertLinearChain(server, draft);
  });

  // The four outcomes acquire's single INSERT … ON CONFLICT DO UPDATE decides
  // between, each asserted on BOTH what the caller is handed and the row the
  // statement leaves behind. The cases above reach them one at a time and
  // mostly through the returned epoch alone, so a rewrite that collapsed
  // "same owner, live" into "same owner, expired" — or that refreshed the TTL
  // of a lease it refused — could still satisfy several of them. These four
  // are the statement's truth table, and they are what a rewrite is checked
  // against.
  describe('the acquire CAS truth table', () => {
    type LeaseRow = { owner: string; epoch: string; expires_at: Date };

    const leaseRow = async (draft: string): Promise<LeaseRow> => {
      const res = await db.query(
        `SELECT owner, epoch, expires_at FROM leases
         WHERE draft_id = $1 AND section_id = 'stage-1'`,
        [draft],
      );
      const row = res.rows[0] as LeaseRow | undefined;
      if (row === undefined) throw new Error('no lease row');
      return row;
    };

    it('case 1 — same owner, live lease: keeps its epoch and refreshes the TTL', async () => {
      const draft = await makeDraft(server);
      const first = await server.acquire(draft, 'stage-1', 'tab-A');
      expect(first?.epoch).toBe(1n);
      const before = await leaseRow(draft);

      const again = await server.acquire(draft, 'stage-1', 'tab-A');
      expect(again?.epoch).toBe(1n); // NOT bumped: this is the idempotent retry
      const after = await leaseRow(draft);
      expect(after.epoch).toBe(before.epoch);
      expect(after.owner).toBe('tab-A');
      // The TTL really moved, and the row and the returned lease agree on it.
      expect(after.expires_at.getTime()).toBeGreaterThan(
        before.expires_at.getTime(),
      );
      expect(again?.expiresAt.getTime()).toBe(after.expires_at.getTime());
    });

    it('case 2 — same owner, expired lease: bumps the epoch', async () => {
      const draft = await makeDraft(server);
      expect((await server.acquire(draft, 'stage-1', 'tab-A'))?.epoch).toBe(1n);
      await expireLease(run, draft, 'stage-1');
      const before = await leaseRow(draft);

      const again = await server.acquire(draft, 'stage-1', 'tab-A');
      // Bumped, which is what fences the owner's own pre-sleep in-flight
      // commits: they carry epoch 1 and the lease is now epoch 2.
      expect(again?.epoch).toBe(2n);
      const after = await leaseRow(draft);
      expect(after.owner).toBe('tab-A');
      expect(after.epoch).toBe('2');
      expect(after.expires_at.getTime()).toBeGreaterThan(
        before.expires_at.getTime(),
      );
    });

    it('case 3 — another owner, expired lease: takes over and bumps the epoch', async () => {
      const draft = await makeDraft(server);
      expect((await server.acquire(draft, 'stage-1', 'tab-A'))?.epoch).toBe(1n);
      await expireLease(run, draft, 'stage-1');

      const b = await server.acquire(draft, 'stage-1', 'tab-B');
      expect(b?.epoch).toBe(2n);
      const after = await leaseRow(draft);
      expect(after.owner).toBe('tab-B');
      expect(after.epoch).toBe('2');
    });

    it('case 4 — another owner, live lease: refused, and the held lease is untouched', async () => {
      const draft = await makeDraft(server);
      expect((await server.acquire(draft, 'stage-1', 'tab-A'))?.epoch).toBe(1n);
      const before = await leaseRow(draft);

      expect(await server.acquire(draft, 'stage-1', 'tab-B')).toBeNull();

      // A refusal writes nothing: not the owner, not the epoch, and — the one
      // a misplaced `setWhere` would silently break — not the expiry. A
      // refused contender must not extend the holder's TTL.
      const after = await leaseRow(draft);
      expect(after.owner).toBe('tab-A');
      expect(after.epoch).toBe(before.epoch);
      expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
    });

    it('hands the epoch back as a bigint, whatever the driver decoded', async () => {
      const draft = await makeDraft(server);
      const lease = await server.acquire(draft, 'stage-1', 'tab-A');
      expect(typeof lease?.epoch).toBe('bigint');
      const renewed = await server.renew(draft, 'stage-1', 'tab-A', 1n);
      expect(typeof renewed?.epoch).toBe('bigint');
      const taken = await server.takeover(draft, 'stage-1', 'tab-B');
      expect(typeof taken?.epoch).toBe('bigint');
    });
  });
});

describe('SectionRejectedError', () => {
  it('describes a cause that cannot be converted to a string', () => {
    // A `message` getter that throws takes down whatever logs the error, so
    // the one input that breaks `String` has to be survivable. An object with
    // a null prototype has no `toString`, so `String(cause)` raises
    // `TypeError: Cannot convert object to primitive value`.
    const hostile = Object.create(null) as object;
    const error = new SectionRejectedError({
      sectionId: 'stage-1',
      cause: hostile,
    });
    expect(() => error.message).not.toThrow();
    expect(error.message).toContain('stage-1');
  });
});
