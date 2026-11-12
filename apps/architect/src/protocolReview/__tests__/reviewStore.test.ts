// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { describe, expect, it, vi } from 'vitest';

import { deleteStoredProtocol } from '~/utils/protocolLibrary';
import { PROTOCOL_REVIEW_DB_NAME } from '~/utils/storageNames';

import {
  deleteReviewRecord,
  readReviewRecord,
  type StoredReviewRecord,
  writeReviewRecord,
} from '../reviewStore';
import { makeFinding, op } from './fixtures';

const record = (protocolId: string): StoredReviewRecord => ({
  protocolId,
  shareReviews: true,
  review: {
    reviewId: '6a1f0e1c-2c1e-4c55-9e0a-6d3f4f2b9a10',
    createdAt: 1_700_000_000_000,
    locale: 'en',
    findings: [
      {
        finding: makeFinding('f1', [op('set', '/name', 'x')]),
        operations: [op('set', '/name', 'x')],
        targets: [{ op: 'set', present: true, value: 'Advice study' }],
        decision: 'mine',
        inverse: null,
      },
    ],
  },
});

/** Reads the database directly, past the module's session copy. */
const readFromDisk = async (protocolId: string) => {
  const db = new Dexie(PROTOCOL_REVIEW_DB_NAME);
  db.version(1).stores({ reviews: 'protocolId' });
  try {
    return await db.table('reviews').get(protocolId);
  } finally {
    db.close();
  }
};

describe('review store', () => {
  it('reads an empty record, with sharing not yet chosen, for a protocol never reviewed', async () => {
    expect(await readReviewRecord('never')).toEqual({
      protocolId: 'never',
      shareReviews: null,
      review: null,
    });
  });

  it('keeps one record per protocol in its own database', async () => {
    await writeReviewRecord(record('p1'));
    await writeReviewRecord({ ...record('p2'), shareReviews: false });
    expect(await readFromDisk('p1')).toEqual(record('p1'));
    expect(await readReviewRecord('p2')).toMatchObject({ shareReviews: false });
  });

  it('deletes a protocol’s record', async () => {
    await writeReviewRecord(record('p3'));
    await deleteReviewRecord('p3');
    expect(await readFromDisk('p3')).toBeUndefined();
    expect((await readReviewRecord('p3')).review).toBeNull();
  });

  it('deletes the record when its protocol is deleted from the library', async () => {
    await writeReviewRecord(record('p4'));
    await deleteStoredProtocol('p4');
    expect(await readFromDisk('p4')).toBeUndefined();
  });
});

/** Writes the database directly, as another tab would. */
const writeToDisk = async (value: StoredReviewRecord) => {
  const db = new Dexie(PROTOCOL_REVIEW_DB_NAME);
  db.version(1).stores({ reviews: 'protocolId' });
  try {
    await db.table('reviews').put(value);
  } finally {
    db.close();
  }
};

describe('D: the session’s newest record wins until it has been saved', () => {
  const failWrites = () =>
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The disk is full', 'QuotaExceededError');
    });

  it('reads back a record whose write failed, not the older one stored', async () => {
    await writeReviewRecord(record('d1'));
    const writes = failWrites();
    await writeReviewRecord({ ...record('d1'), shareReviews: false });
    writes.mockRestore();
    expect(await readFromDisk('d1')).toMatchObject({ shareReviews: true });
    expect(await readReviewRecord('d1')).toMatchObject({ shareReviews: false });
  });

  it('refreshes from storage again once the newest record is saved', async () => {
    const writes = failWrites();
    await writeReviewRecord({ ...record('d2'), shareReviews: false });
    writes.mockRestore();
    await writeReviewRecord({ ...record('d2'), shareReviews: false });
    // Another tab changes the stored record; a clean session copy follows it.
    await writeToDisk({ ...record('d2'), shareReviews: true });
    expect(await readReviewRecord('d2')).toMatchObject({ shareReviews: true });
  });
});
