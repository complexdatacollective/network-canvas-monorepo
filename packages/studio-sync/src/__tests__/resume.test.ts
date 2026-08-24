// Reconnect/resume via manifest-hash resync, driven through the client half:
// optimistic echo, pending-queue retransmission, suffix rollback on takeover.
import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { contentHash } from '../apply.ts';
import { SyncClient } from '../client.ts';
import { forceExpire, SyncServer } from '../server.ts';
import type { TenantDb } from '../tenant.ts';
import { dbAvailable, makeDraft, makeServer } from './helpers.ts';

/**
 * A server whose next getSection parks until released — the deterministic
 * stand-in for a slow read overtaken by a concurrent commit.
 */
class GatedServer extends SyncServer {
  private gate: PromiseWithResolvers<void> | null = null;
  private arrival: PromiseWithResolvers<void> | null = null;

  /** Park the next getSection; `reached` resolves once that call arrives. */
  armGetSection() {
    const gate = Promise.withResolvers<void>();
    const arrival = Promise.withResolvers<void>();
    this.gate = gate;
    this.arrival = arrival;
    return { reached: arrival.promise, release: () => gate.resolve() };
  }

  override async getSection(hash: string) {
    const gate = this.gate;
    if (gate) {
      this.gate = null;
      this.arrival?.resolve();
      await gate.promise;
    }
    return super.getSection(hash);
  }
}

describe.skipIf(!dbAvailable)('reconnect and resume', () => {
  let db: Pool;
  let dispose: () => Promise<void>;
  let tenantDb: TenantDb;
  let server: SyncServer;

  beforeAll(async () => {
    ({ db, tenantDb, server, dispose } = await makeServer('sync_resume'));
  });

  afterAll(async () => {
    await dispose();
  });
  it('retransmits unacknowledged batches idempotently after a lost ack', async () => {
    const draft = await makeDraft(server);
    const client = new SyncClient(randomUUID(), server, draft);
    expect(await client.openSection('stage-1')).toBe(true);

    client.edit('stage-1', [{ op: 'set', key: 'label', value: 'first' }]);
    client.edit('stage-1', [{ op: 'set', key: 'note', value: 'second' }]);
    client.edit('stage-1', [
      { op: 'insertItem', key: 'prompts', index: 0, item: { id: 'p1' } },
    ]);

    // Two batches reach the server; the client "crashes" before recording
    // the acks for the second (simulated by pushing then re-adding it),
    // then reconnects with all three still queued in doubt.
    await client.push('stage-1');
    await client.push('stage-1');
    expect(client.pendingCount('stage-1')).toBe(1);

    // Reconnect: resume drops already-applied batches, retransmits the rest.
    await client.reconnect('stage-1');
    expect(client.pendingCount('stage-1')).toBe(0);

    const resume = await server.resume(draft, client.owner);
    const serverDoc = await server.getSection(resume.sectionHashes['stage-1']!);
    expect(client.localHash('stage-1')).toBe(client.baseHash('stage-1'));
    expect(resume.lastApplied['stage-1']?.clientSeq).toBe(3n);
    expect(serverDoc.label).toBe('first');
    expect(serverDoc.note).toBe('second');
  });

  it('resync fetches only sections whose hashes differ', async () => {
    const draft = await makeDraft(server);
    const editor = new SyncClient(randomUUID(), server, draft);
    await editor.openSection('stage-1');
    editor.edit('stage-1', [{ op: 'set', key: 'label', value: 'changed' }]);
    await editor.pushAll('stage-1');

    const resume = await server.resume(draft, randomUUID());
    // A reader holding the seed manifest diffs section hashes: only stage-1
    // changed; the other sections' hashes are untouched.
    const seed = await server.manifestChain(draft);
    const seedSections = (
      await db.query(
        `SELECT section_hashes FROM manifests WHERE draft_id = $1 AND seq = 0`,
        [draft],
      )
    ).rows[0] as { section_hashes: Record<string, string> };
    expect(seed.length).toBe(2);
    const changed = Object.keys(resume.sectionHashes).filter(
      (id) => resume.sectionHashes[id] !== seedSections.section_hashes[id],
    );
    expect(changed).toEqual(['stage-1']);
  });

  it('suffix rollback: a takeover invalidates the rejected batch and everything queued behind it', async () => {
    const draft = await makeDraft(server);
    const sleeper = new SyncClient('tab-sleeper', server, draft);
    await sleeper.openSection('stage-1');

    sleeper.edit('stage-1', [{ op: 'set', key: 'label', value: 'mine' }]);
    sleeper.edit('stage-1', [{ op: 'set', key: 'note', value: 'also mine' }]);

    // The laptop sleeps; the lease expires; a colleague takes over and edits.
    await forceExpire(tenantDb, draft, 'stage-1');
    const colleague = new SyncClient('tab-colleague', server, draft);
    expect(await colleague.openSection('stage-1')).toBe(true);
    colleague.edit('stage-1', [
      { op: 'set', key: 'label', value: 'colleague owns this now' },
    ]);
    await colleague.pushAll('stage-1');

    // The sleeper wakes and pushes: rejected; both queued batches roll back
    // together and the local document returns to the last acknowledged base.
    expect(await sleeper.push('stage-1')).toBe('rejected');
    expect(sleeper.pendingCount('stage-1')).toBe(0);
    expect(sleeper.localHash('stage-1')).toBe(sleeper.baseHash('stage-1'));
  });

  it('reopening a still-active lease continues the client sequence', async () => {
    const draft = await makeDraft(server);
    const client = new SyncClient(randomUUID(), server, draft);
    expect(await client.openSection('stage-1')).toBe(true);
    client.edit('stage-1', [{ op: 'set', key: 'label', value: 'first' }]);
    await client.pushAll('stage-1');

    // The same tab reopens the section — a retried acquire returns the same
    // still-active epoch. client_seq is unique per (owner, section, epoch),
    // so restarting the count would reuse an idempotency key the server has
    // already logged and the next edit would be silently deduplicated.
    expect(await client.openSection('stage-1')).toBe(true);
    client.edit('stage-1', [{ op: 'set', key: 'note', value: 'second' }]);
    await client.pushAll('stage-1');

    const resume = await server.resume(draft, client.owner);
    const serverDoc = await server.getSection(
      resume.sectionHashes['stage-1'] ?? '',
    );
    expect(serverDoc.label).toBe('first');
    expect(serverDoc.note).toBe('second');
    expect(client.localHash('stage-1')).toBe(contentHash(serverDoc));
  });

  it('reconnect discards a resume snapshot a concurrent push has overtaken', async () => {
    const gated = new GatedServer(tenantDb);
    const draft = await makeDraft(gated);
    const client = new SyncClient(randomUUID(), gated, draft);
    expect(await client.openSection('stage-1')).toBe(true);
    client.edit('stage-1', [{ op: 'set', key: 'label', value: 'first' }]);
    client.edit('stage-1', [{ op: 'set', key: 'note', value: 'second' }]);

    // The reconnect reads resume, then parks on the section fetch; the push
    // commits underneath it and removes that batch from the queue. Adopting
    // the pre-commit document now would move base backwards with nothing
    // left in the queue to replay the difference.
    const gate = gated.armGetSection();
    const reconnecting = client.reconnect('stage-1');
    await gate.reached;
    expect(await client.push('stage-1')).toBe('committed');
    gate.release();
    await reconnecting;

    const resume = await gated.resume(draft, client.owner);
    const serverDoc = await gated.getSection(
      resume.sectionHashes['stage-1'] ?? '',
    );
    expect(serverDoc.label).toBe('first');
    expect(serverDoc.note).toBe('second');
    expect(client.pendingCount('stage-1')).toBe(0);
    expect(client.baseHash('stage-1')).toBe(contentHash(serverDoc));
    expect(client.localHash('stage-1')).toBe(contentHash(serverDoc));
  });

  it('concurrent flushes of the same head batch never drop an uncommitted batch', async () => {
    const draft = await makeDraft(server);
    const client = new SyncClient(randomUUID(), server, draft);
    expect(await client.openSection('stage-1')).toBe(true);

    client.edit('stage-1', [{ op: 'set', key: 'label', value: 'first' }]);
    client.edit('stage-1', [{ op: 'set', key: 'note', value: 'second' }]);

    // Two flush triggers race: both capture the head batch; the server
    // deduplicates the second send. Only one continuation may remove the
    // batch and advance base — the second must not shift off the next,
    // uncommitted batch or re-apply the first to base.
    await Promise.all([client.push('stage-1'), client.push('stage-1')]);
    expect(client.pendingCount('stage-1')).toBe(1);

    await client.pushAll('stage-1');
    expect(client.pendingCount('stage-1')).toBe(0);

    // Client and server converge on the same section state.
    const resume = await server.resume(draft, client.owner);
    const serverDoc = await server.getSection(
      resume.sectionHashes['stage-1'] ?? '',
    );
    expect(client.baseHash('stage-1')).toBe(contentHash(serverDoc));
    expect(client.localHash('stage-1')).toBe(contentHash(serverDoc));
  });
});
