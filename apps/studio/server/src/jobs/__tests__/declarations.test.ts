import { assert, describe, it } from '@effect/vitest';
import { Duration } from 'effect';

import { resolvedQueues } from '../queues.ts';
import { RETENTION_INTERVAL } from '../worker.ts';

// What the declarations and the worker's own cadences have to agree about.
// Nothing here touches Postgres: these are properties of two files that are
// edited months apart and by different hands, which is exactly why the
// agreement has to be an assertion rather than a comment.

describe('the declarations against the worker’s cadences', () => {
  it('sweeps retention at least as often as the shortest one declared', () => {
    const asked = resolvedQueues
      .filter((queue) => queue.deleteAfterSeconds > 0)
      .map((queue) => ({
        name: queue.name,
        seconds: queue.deleteAfterSeconds,
      }));
    // Without this the assertion below is vacuous: `0` means "keep forever",
    // and a build where every queue said so would pass whatever the sweep did.
    assert.isNotEmpty(
      asked,
      'no queue asks to be deleted at all, so the cadence below bounds nothing',
    );

    const shortest = asked.reduce((a, b) => (b.seconds < a.seconds ? b : a));
    assert.isAtMost(
      Duration.toSeconds(RETENTION_INTERVAL),
      shortest.seconds,
      `a terminal row is deleted on the retention sweep and nowhere else, so ${shortest.name} does not get the ${shortest.seconds}s it asks for unless the worker sweeps at least that often. It matters most for sign-in-email, whose payload is the magic link itself: at a cadence longer than its retention the row outlives the link.`,
    );
  });
});
