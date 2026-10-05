// The lease state machine's specified failure modes, each exercised against
// real atomic conditional statements on Postgres. Time passage (a slept
// laptop) is simulated by forceExpire, which touches only expires_at.
import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LeaseRejectedError,
  type SyncServer,
  UnknownSectionError,
} from '../server.ts';
import type { TenantDb } from '../tenant.ts';
import {
  assertLinearChain,
  dbAvailable,
  expireLease,
  makeDraft,
  makeServer,
} from './helpers.ts';

describe.skipIf(!dbAvailable)('lease state machine', () => {
  let db: Pool;
  let dispose: () => Promise<void>;
  let tenantDb: TenantDb;
  let server: SyncServer;

  beforeAll(async () => {
    ({ db, tenantDb, server, dispose } = await makeServer('sync_lease'));
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
    await expireLease(tenantDb, draft, 'stage-1');
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
    await expireLease(tenantDb, draft, 'stage-1');
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
    await expireLease(tenantDb, draft, 'stage-1');

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
    await expireLease(tenantDb, draft, 'stage-1');

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
    await expireLease(tenantDb, draft, 'stage-1');

    const contenders = Array.from({ length: 8 }, (_, i) => `contender-${i}`);
    const results = await Promise.all(
      contenders.map((owner) => server.acquire(draft, 'stage-1', owner)),
    );
    const winners = results.filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.epoch).toBe(2n);
    await assertLinearChain(server, draft);
  });
});
