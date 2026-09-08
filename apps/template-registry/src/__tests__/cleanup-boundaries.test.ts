import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

import { EntrySchema } from '../contract.ts';
import { RegistryError } from '../problems.ts';
import { createRegistryFixture, template } from './fixtures.ts';

it('retries reappeared bytes after authorized completed deletion while protecting active and unauthorized references', async () => {
  const fixture = await createRegistryFixture();
  try {
    const publisher = await fixture.account();
    const operator = await fixture.account('operator@example.test', true);
    const live = await fixture.published(publisher.token, 'Live reference');
    const retired = await template('Uncertain write then retired');
    const retiredHash = templateBytesHash(retired.bytes);
    const hardDelete = async (root: string) => {
      expect(
        (
          await fixture.request(
            'DELETE',
            `/moderation/artifacts/${root}`,
            undefined,
            operator.bearer,
          )
        ).status,
      ).toBe(202);
    };
    let finishUncertainWrite: (() => void) | undefined;
    vi.mocked(fixture.blobs.put).mockImplementationOnce(
      async (rawHash, bytes) => {
        const ownedBytes = Uint8Array.from(bytes);
        finishUncertainWrite = () => {
          // An aborted client cannot roll back remote storage work. A delayed
          // conditional PUT may complete after a successful retry was deleted.
          expect(fixture.objects.has(rawHash)).toBe(false);
          fixture.objects.set(rawHash, ownedBytes);
        };
        throw new RegistryError('SERVICE_UNAVAILABLE');
      },
    );
    expect((await fixture.publish(publisher.token, retired.bytes)).status).toBe(
      503,
    );
    expect(
      (await fixture.owner.query('SELECT id FROM registry_entries')).rows,
    ).toEqual([{ id: live.entry.id }]);
    const retry = await fixture.publish(publisher.token, retired.bytes);
    expect(retry.status).toBe(201);
    const retiredEntry = EntrySchema.parse(await retry.json());
    await hardDelete(retiredEntry.root);
    expect(await fixture.store.cleanupDeletedArtifacts()).toBe(1);
    expect(fixture.objects.has(retiredHash)).toBe(false);
    const completed = await fixture.owner.query<{
      requested_audit_id: string;
      completed: boolean;
    }>(
      'SELECT requested_audit_id, completed_at IS NOT NULL AS completed FROM registry_delete_jobs WHERE root = $1',
      [retiredEntry.root],
    );
    const completedJob = completed.rows[0];
    expect(completedJob?.completed).toBe(true);
    if (!completedJob) throw new Error('Completed deletion must be durable');
    if (!finishUncertainWrite)
      throw new Error('The uncertain write must have started');
    finishUncertainWrite();
    expect(await fixture.store.cleanupDeletedArtifacts()).toBe(0);

    const protectedObjects = [{ bytes: live.bytes, entry: live.entry }];
    for (const state of [
      'pending',
      'missing-job',
      'wrong-action',
      'wrong-root',
      'active',
    ] as const) {
      const created = await fixture.published(
        publisher.token,
        `Protected ${state}`,
      );
      protectedObjects.push(created);
      if (state === 'active') {
        // An inconsistent completed job must never erase an active reference,
        // even when its audit has the expected action and subject.
        const event = randomUUID();
        await fixture.owner.query(
          `INSERT INTO registry_audit(id, actor_kind, actor_id, action, subject_id, request_id)
          VALUES ($1, 'database_operator', 'fixture', 'artifact.hard_delete_requested', $2, $3)`,
          [event, created.entry.root, randomUUID()],
        );
        await fixture.owner.query(
          'INSERT INTO registry_delete_jobs(root, requested_audit_id, completed_at) VALUES ($1, $2, now())',
          [created.entry.root, event],
        );
        continue;
      }
      await hardDelete(created.entry.root);
      if (state === 'missing-job') {
        await fixture.owner.query(
          'DELETE FROM registry_delete_jobs WHERE root = $1',
          [created.entry.root],
        );
      } else if (state === 'wrong-action') {
        await fixture.owner.query(
          `UPDATE registry_delete_jobs SET completed_at = now(), requested_audit_id =
          (SELECT id FROM registry_audit WHERE action = 'entry.published' AND subject_id = $2)
          WHERE root = $1`,
          [created.entry.root, created.entry.id],
        );
      } else if (state === 'wrong-root') {
        await fixture.owner.query(
          'UPDATE registry_delete_jobs SET completed_at = now(), requested_audit_id = $2 WHERE root = $1',
          [created.entry.root, completedJob.requested_audit_id],
        );
      }
    }
    const ordinaryOrphan = new Uint8Array([1, 2, 3]);
    const orphanHash = templateBytesHash(ordinaryOrphan);
    fixture.objects.set(orphanHash, ordinaryOrphan);
    // The clock fixture places every object beyond the normal one-hour grace.
    // Only reference/authorization state can decide which hashes survive.
    for (const rawHash of fixture.objects.keys())
      fixture.objectTimes.set(
        rawHash,
        new Date(Date.now() - 2 * 60 * 60 * 1000),
      );
    const auditBefore = (
      await fixture.owner.query('SELECT * FROM registry_audit ORDER BY id')
    ).rows;
    const remove = vi.mocked(fixture.blobs.delete).getMockImplementation();
    if (!remove) throw new Error('The storage delete boundary must be active');
    let failRetired = true;
    vi.mocked(fixture.blobs.delete).mockClear();
    vi.mocked(fixture.blobs.delete).mockImplementation(async (rawHash) => {
      if (rawHash === retiredHash && failRetired) {
        failRetired = false;
        throw new RegistryError('SERVICE_UNAVAILABLE');
      }
      await remove(rawHash);
    });
    const firstPass = await fixture.store.cleanupOrphanArtifacts('resume-page');
    expect(fixture.blobs.delete).toHaveBeenCalledWith(retiredHash);
    expect(fixture.objects.has(orphanHash)).toBe(false);
    expect(fixture.objects.get(retiredHash)).toEqual(retired.bytes);
    for (const object of protectedObjects) {
      const rawHash = templateBytesHash(object.bytes);
      expect(fixture.blobs.delete).not.toHaveBeenCalledWith(rawHash);
      expect(fixture.objects.get(rawHash)).toEqual(object.bytes);
    }
    expect(firstPass).toEqual({
      removed: 1,
      retry: true,
      nextCursor: 'resume-page',
    });
    expect(await fixture.store.cleanupOrphanArtifacts('resume-page')).toEqual({
      removed: 1,
      retry: false,
      nextCursor: undefined,
    });
    expect(fixture.objects.has(retiredHash)).toBe(false);
    for (const object of protectedObjects)
      expect(fixture.objects.get(templateBytesHash(object.bytes))).toEqual(
        object.bytes,
      );
    const liveResponse = await fixture.request(
      'GET',
      `/artifacts/${live.entry.root}`,
    );
    expect(liveResponse.status).toBe(200);
    expect(new Uint8Array(await liveResponse.arrayBuffer())).toEqual(
      live.bytes,
    );
    expect(
      (await fixture.request('GET', `/artifacts/${retiredEntry.root}`)).status,
    ).toBe(410);
    expect(
      (await fixture.owner.query('SELECT * FROM registry_audit ORDER BY id'))
        .rows,
    ).toEqual(auditBefore);
    expect(await fixture.store.cleanupOrphanArtifacts()).toEqual({
      removed: 0,
      retry: false,
      nextCursor: undefined,
    });
  } finally {
    await fixture.dispose();
  }
});
