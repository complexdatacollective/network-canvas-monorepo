import { describe, expect, it } from 'vitest';

import { skewMillis, skewWarning } from '../clock.ts';

describe('the job clock’s skew measurement', () => {
  it('reads a database ahead of this process as a positive correction', () => {
    expect(skewMillis({ before: 0, after: 200, database: 100_100 })).toBe(
      100_000,
    );
  });

  it('reads a database behind this process as a negative correction', () => {
    expect(
      skewMillis({ before: 1_000_000, after: 1_000_200, database: 910_100 }),
    ).toBe(-90_000);
  });

  it('measures against the midpoint, so latency is not skew', () => {
    expect(skewMillis({ before: 0, after: 1_000, database: 500 })).toBe(0);
  });
});

describe('what a measured skew is worth warning about', () => {
  it('warns at a minute in either direction', () => {
    expect(skewWarning(60_000)).toBe(
      'the job clock is 60.0s behind the database; job timestamps are being corrected by that much',
    );
    expect(skewWarning(-60_000)).toBe(
      'the job clock is 60.0s ahead of the database; job timestamps are being corrected by that much',
    );
  });

  it('says nothing a millisecond under it', () => {
    expect(skewWarning(59_999)).toBeNull();
    expect(skewWarning(-59_999)).toBeNull();
    expect(skewWarning(0)).toBeNull();
  });
});
