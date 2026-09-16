import { describe, expect, it } from 'vitest';

import { skewMillis, skewWarning } from '../clock.ts';

// The skew arithmetic on its own, in plain numbers. It is deliberately not
// driven through `JobClock.layer` here: correcting a clock against a live pool
// means either a database whose clock happens to differ from this process's
// (it does not) or a `TestClock` jump of years, which never finishes against a
// real connection because the pool's own repeating sleep is replayed on the way
// (README §7). Both signs and the warning boundary are arithmetic, so they are
// tested as arithmetic.

describe('the job clock’s skew measurement', () => {
  it('reads a database ahead of this process as a positive correction', () => {
    // The round trip took 200 ms and the database's `now()` landed 100 s after
    // its midpoint: this replica is running slow and every timestamp it writes
    // needs that much added to it.
    expect(skewMillis({ before: 0, after: 200, database: 100_100 })).toBe(
      100_000,
    );
  });

  it('reads a database behind this process as a negative correction', () => {
    // The other sign, which is the one a clamp would silently lose: this
    // replica is running fast, so an uncorrected enqueue would write `run_at`
    // ninety seconds in the future and an unskewed worker would leave the job
    // sitting there.
    expect(
      skewMillis({ before: 1_000_000, after: 1_000_200, database: 910_100 }),
    ).toBe(-90_000);
  });

  it('measures against the midpoint, so latency is not skew', () => {
    // A one-second round trip against a database whose clock agrees exactly:
    // measured against either end this would read as half a second of skew.
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
    // pg-boss's own boundary (`timekeeper.js:243`) is `>= 60`, not `> 60`.
    expect(skewWarning(59_999)).toBeNull();
    expect(skewWarning(-59_999)).toBeNull();
    expect(skewWarning(0)).toBeNull();
  });
});
