// Reconnect/resume via manifest-hash resync, driven through the client half:
// optimistic echo, pending-queue retransmission, suffix rollback on takeover.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import { SyncClient } from '../src/client.ts';
import { forceExpire } from '../src/server.ts';
import { makeDraft, makeServer } from './helpers.ts';

const { db, server } = await makeServer('sync_resume');

afterAll(async () => {
  await db.end();
});

describe('reconnect and resume', () => {
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
    await forceExpire(db, draft, 'stage-1');
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
});
