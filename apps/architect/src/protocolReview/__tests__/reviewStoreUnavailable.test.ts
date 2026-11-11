import { describe, expect, it, vi } from 'vitest';

import { reportError } from '~/utils/reportError';

import {
  deleteReviewRecord,
  readReviewRecord,
  writeReviewRecord,
} from '../reviewStore';

vi.mock('~/utils/reportError', () => ({ reportError: vi.fn() }));

// No fake-indexeddb here: jsdom has no IndexedDB, as a browser that refuses
// storage has none it can use.
describe('review store without IndexedDB', () => {
  it('keeps working from this session’s copy', async () => {
    expect(globalThis.indexedDB).toBeUndefined();
    await writeReviewRecord({
      protocolId: 'p1',
      shareReviews: true,
      review: null,
    });
    expect(await readReviewRecord('p1')).toEqual({
      protocolId: 'p1',
      shareReviews: true,
      review: null,
    });
    await deleteReviewRecord('p1');
    expect((await readReviewRecord('p1')).shareReviews).toBe(false);
    // Storage being unavailable is expected, not a bug to report.
    expect(reportError).not.toHaveBeenCalled();
  });
});
