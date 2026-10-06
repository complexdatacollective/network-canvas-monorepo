import { assert, describe, expect, it } from '@effect/vitest';
import { Duration } from 'effect';

import { JOB_SCHEDULES } from '@codaco/studio-sync/jobs';

import { MANIFEST_FETCH_BOUND } from '../handlers/update-check.ts';
import { resolvedQueue, resolvedQueues } from '../queues.ts';
import { RETENTION_INTERVAL } from '../worker.ts';

describe('the declarations against the worker’s cadences', () => {
  it('sweeps retention at least as often as the shortest one declared', () => {
    const asked = resolvedQueues
      .filter((queue) => queue.deleteAfterSeconds > 0)
      .map((queue) => ({
        name: queue.name,
        seconds: queue.deleteAfterSeconds,
      }));
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

// The SMTP transport's own bounds, which `smtp.ts` sets: 10s to connect, 10s
// for the greeting and 20s of socket silence.
const SMTP_WORST_CASE_SECONDS = 10 + 10 + 20;

describe('the update check’s declaration', () => {
  it('runs once a day, at a fixed UTC minute off the hour', () => {
    expect(
      JOB_SCHEDULES.filter(({ queue }) => queue === 'update-check'),
    ).toEqual([{ queue: 'update-check', cron: '23 4 * * *', tz: 'UTC' }]);
  });

  it('is a singleton that retries twice and keeps its records briefly', () => {
    const queue = resolvedQueue('update-check');
    expect({
      policy: queue.policy,
      retryLimit: queue.retryLimit,
      retentionSeconds: queue.retentionSeconds,
      deleteAfterSeconds: queue.deleteAfterSeconds,
      deadLetter: queue.deadLetter,
    }).toEqual({
      policy: 'singleton',
      retryLimit: 2,
      retentionSeconds: 7 * 24 * 3600,
      deleteAfterSeconds: 24 * 3600,
      deadLetter: null,
    });
  });

  it('lets one attempt outlast its fetch and its send', () => {
    // An attempt reaped while its send is still running releases the version's
    // claim, and the retry then mails the owner a second time.
    expect(resolvedQueue('update-check').expireInSeconds).toBeGreaterThan(
      Duration.toSeconds(MANIFEST_FETCH_BOUND) + SMTP_WORST_CASE_SECONDS,
    );
  });
});
