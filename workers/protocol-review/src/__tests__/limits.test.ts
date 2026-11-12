import { describe, expect, it } from 'vitest';

import {
  MAX_OUTPUT_TOKENS,
  RESERVATION_OVERHEAD_TOKENS,
} from '../constants.ts';
import { REVIEW_LIMITS, ReviewErrorSchema } from '../contract.ts';
import { admit, settle, utcDay } from '../limiter.ts';
import { ModelCallError, REJECTED, reported } from '../model.ts';
import {
  costMicros,
  DAILY_CEILING_MICROS,
  MONTHLY_CEILING_MICROS,
  reservationMicros,
} from '../pricing.ts';
import { handleRequest } from '../review.ts';
import {
  ADDRESS,
  answerWith,
  countFor,
  createHarness,
  createMemoryStore,
  INSTALLATION_ID,
  readEvents,
  reviewRequest,
  scriptedModel,
  START,
  USAGE,
  validRequest,
} from './helpers.ts';

const HOUR = 60 * 60 * 1000;

const okModel = () => scriptedModel({ chunks: [answerWith([])] });

const runReview = async (
  harness: ReturnType<typeof createHarness>,
  headers: Record<string, string> = {},
  body: unknown = validRequest(),
) => {
  const response = await handleRequest(
    reviewRequest(body, headers),
    harness.deps,
  );
  if (response.headers.get('Content-Type') === 'text/event-stream') {
    const events = await readEvents(response);
    await harness.settled();
    return { status: response.status, events, error: null };
  }
  await harness.settled();
  return {
    status: response.status,
    events: [],
    error: ReviewErrorSchema.parse(await response.json()),
  };
};

describe('hourly limits', () => {
  it('stops an installation at its hourly limit until its window ends', async () => {
    const harness = createHarness(okModel());
    const quotas: number[] = [];
    for (
      let index = 0;
      index < REVIEW_LIMITS.perInstallationPerHour;
      index += 1
    ) {
      harness.clock.now = START + index * 60_000;
      const { status, events } = await runReview(harness);
      expect(status).toBe(200);
      const last = events.at(-1);
      if (last?.type !== 'result') throw new Error('Expected a result.');
      quotas.push(last.result.quota.remaining);
      expect(last.result.quota.resetsAt).toBe(
        new Date(START + HOUR).toISOString(),
      );
    }
    expect(quotas).toEqual([4, 3, 2, 1, 0]);

    harness.clock.now = START + 30 * 60_000;
    const refused = await runReview(harness);
    expect(refused.status).toBe(429);
    expect(refused.error).toEqual({
      error: 'hourly_limit',
      retryAt: new Date(START + HOUR).toISOString(),
    });

    // The window began at the first counted review, so it ends an hour later.
    harness.clock.now = START + HOUR;
    const after = await runReview(harness);
    expect(after.status).toBe(200);
    const last = after.events.at(-1);
    if (last?.type !== 'result') throw new Error('Expected a result.');
    expect(last.result.quota).toEqual({
      limit: REVIEW_LIMITS.perInstallationPerHour,
      remaining: REVIEW_LIMITS.perInstallationPerHour - 1,
      resetsAt: new Date(START + 2 * HOUR).toISOString(),
    });
  });

  it('stops an address at its hourly limit, whatever the installation', async () => {
    const harness = createHarness(okModel());
    for (let index = 0; index < REVIEW_LIMITS.perAddressPerHour; index += 1) {
      const installationId = `3f1c2b9e-4d5a-4e6f-8a7b-${String(index).padStart(12, '0')}`;
      const { status } = await runReview(
        harness,
        {},
        validRequest({ installationId }),
      );
      expect(status).toBe(200);
    }
    const refused = await runReview(
      harness,
      {},
      validRequest({ installationId: '3f1c2b9e-4d5a-4e6f-8a7b-999999999999' }),
    );
    expect(refused.status).toBe(429);
    expect(refused.error?.error).toBe('hourly_limit');

    // Another address is unaffected.
    const elsewhere = await runReview(
      harness,
      { 'CF-Connecting-IP': '198.51.100.9' },
      validRequest({ installationId: '3f1c2b9e-4d5a-4e6f-8a7b-999999999999' }),
    );
    expect(elsewhere.status).toBe(200);
  });

  it('gives the count back when the review fails', async () => {
    const harness = createHarness(
      scriptedModel({
        start: false,
        error: new ModelCallError('overloaded', 529, REJECTED),
      }),
    );
    const failed = await runReview(harness);
    expect(failed.status).toBe(503);
    expect(countFor(harness.store, 'installation')).toBe(0);
    expect(countFor(harness.store, 'address')).toBe(0);
  });

  it('keeps the count of a review the client walked away from', async () => {
    const model = scriptedModel({
      waitForAbort: {
        abortError: new ModelCallError(
          'cancelled',
          0,
          reported({ ...USAGE, outputTokens: null }),
        ),
      },
    });
    const harness = createHarness(model);
    const response = await handleRequest(
      reviewRequest(validRequest()),
      harness.deps,
    );
    expect(response.status).toBe(200);
    await response.body?.cancel();
    await harness.settled();

    expect(model.calls[0]?.signal.aborted).toBe(true);
    expect(countFor(harness.store, 'installation')).toBe(1);
    // Input is known; output was never reported, so the cap is charged.
    expect(harness.store.spend.anthropic.get(utcDay(START))).toBe(
      costMicros('anthropic', { ...USAGE, outputTokens: MAX_OUTPUT_TOKENS }),
    );
  });

  it('keys counts by hash, never by the raw address or id', async () => {
    const harness = createHarness(okModel());
    await runReview(harness);
    const keys = [...harness.store.windows.keys()];
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).not.toContain(ADDRESS);
      expect(key).not.toContain(INSTALLATION_ID);
    }
  });
});

describe('the limiter on its own', () => {
  const keys = {
    installationKey: 'i',
    addressKey: 'a',
    provider: 'anthropic' as const,
  };

  it('refunds only the window the review was counted in', () => {
    const store = createMemoryStore();
    const first = admit(store, { ...keys, reservationMicros: 0, now: START });
    if (!first.ok) throw new Error('Expected admission.');
    // The window ends and a new one begins before the first review fails.
    const second = admit(store, {
      ...keys,
      reservationMicros: 0,
      now: START + HOUR + 1,
    });
    if (!second.ok) throw new Error('Expected admission.');
    settle(store, {
      admission: first.admission,
      actualMicros: 0,
      refundHourly: true,
    });
    expect(store.windows.get('i')?.count).toBe(1);
    expect(store.windows.get('i')?.windowStart).toBe(START + HOUR + 1);
  });

  it('forgets windows that have ended', () => {
    const store = createMemoryStore();
    admit(store, { ...keys, reservationMicros: 0, now: START });
    admit(store, {
      installationKey: 'j',
      addressKey: 'b',
      provider: 'anthropic',
      reservationMicros: 0,
      now: START + 2 * HOUR,
    });
    expect([...store.windows.keys()].toSorted()).toEqual(['b', 'j']);
  });
});

describe('the daily spending ceiling', () => {
  it('reserves before the call and settles to the real cost after', async () => {
    const harness = createHarness(okModel());
    const { status } = await runReview(harness);
    expect(status).toBe(200);
    expect(harness.store.spend.anthropic.get(utcDay(START))).toBe(
      costMicros('anthropic', USAGE),
    );
  });

  it('prices usage from the price table', () => {
    // 1,000 input at $4/M, 10,000 cache reads at $0.20/M, 2,000 output at $20/M.
    expect(costMicros('anthropic', USAGE)).toBe(4_000 + 2_000 + 40_000);
    expect(
      costMicros('anthropic', {
        inputTokens: 0,
        cacheCreationInputTokens: 1_000_000,
        cacheReadInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(5_000_000);
  });

  it('refuses a review the day cannot cover, until the next UTC midnight', async () => {
    const harness = createHarness(okModel());
    const day = utcDay(START);
    harness.store.spend.anthropic.set(day, DAILY_CEILING_MICROS - 1);
    const refused = await runReview(harness);
    expect(refused.status).toBe(503);
    expect(refused.error).toEqual({
      error: 'daily_limit',
      retryAt: '2026-11-12T00:00:00.000Z',
    });
    // A refused review counts against nothing.
    expect(countFor(harness.store, 'installation')).toBe(0);
    expect(harness.store.spend.anthropic.get(day)).toBe(
      DAILY_CEILING_MICROS - 1,
    );
  });

  it('cannot be overshot by reviews running at the same time', () => {
    const store = createMemoryStore();
    const reservation = Math.floor(DAILY_CEILING_MICROS / 2) + 1;
    const first = admit(store, {
      installationKey: 'i1',
      addressKey: 'a1',
      provider: 'anthropic',
      reservationMicros: reservation,
      now: START,
    });
    const second = admit(store, {
      installationKey: 'i2',
      addressKey: 'a2',
      provider: 'anthropic',
      reservationMicros: reservation,
      now: START,
    });
    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      error: 'daily_limit',
      retryAt: '2026-11-12T00:00:00.000Z',
    });

    // Once the first settles at its real cost, the room comes back.
    if (!first.ok) throw new Error('Expected admission.');
    settle(store, {
      admission: first.admission,
      actualMicros: 100_000,
      refundHourly: false,
    });
    const third = admit(store, {
      installationKey: 'i3',
      addressKey: 'a3',
      provider: 'anthropic',
      reservationMicros: reservation,
      now: START,
    });
    expect(third.ok).toBe(true);
    expect(store.spend.anthropic.get(utcDay(START))).toBe(
      100_000 + reservation,
    );
  });

  it('settles a failed review to what it reported, and nothing when the provider refused it', async () => {
    const billed = createHarness(
      scriptedModel({
        error: new ModelCallError(
          'connection',
          0,
          reported({ ...USAGE, outputTokens: null }),
        ),
      }),
    );
    await runReview(billed);
    expect(billed.store.spend.anthropic.get(utcDay(START))).toBe(
      costMicros('anthropic', { ...USAGE, outputTokens: MAX_OUTPUT_TOKENS }),
    );

    const unbilled = createHarness(
      scriptedModel({
        start: false,
        error: new ModelCallError('authentication', 401, REJECTED),
      }),
    );
    await runReview(unbilled);
    expect(unbilled.store.spend.anthropic.get(utcDay(START))).toBe(0);
  });

  it('reserves one token per UTF-8 byte of every text, plus the framing', () => {
    const texts = ['x'.repeat(100_000), '朋友😀'.repeat(1_000)];
    // 100,000 one-byte characters, then 1,000 × (3 + 3 + 4) bytes.
    const bytes = 100_000 + 10_000;
    expect(reservationMicros('anthropic', texts)).toBe(
      costMicros('anthropic', {
        inputTokens: 0,
        cacheCreationInputTokens: bytes + RESERVATION_OVERHEAD_TOKENS,
        cacheReadInputTokens: 0,
        outputTokens: MAX_OUTPUT_TOKENS,
      }),
    );
  });
});

describe('the monthly spending ceiling', () => {
  const at = (iso: string) => Date.parse(iso);
  const admitAt = (
    store: ReturnType<typeof createMemoryStore>,
    now: number,
    reservation = 1,
  ) =>
    admit(store, {
      installationKey: `i${now}`,
      addressKey: `a${now}`,
      provider: 'anthropic',
      reservationMicros: reservation,
      now,
    });

  it('refuses a review the month cannot cover, until the next UTC month', async () => {
    const harness = createHarness(okModel());
    // Spent on an earlier day of this month: today has spent nothing.
    harness.store.spend.anthropic.set('2026-11-03', MONTHLY_CEILING_MICROS - 1);
    const refused = await runReview(harness);
    expect(refused.status).toBe(503);
    expect(refused.error).toEqual({
      error: 'monthly_limit',
      retryAt: '2026-12-01T00:00:00.000Z',
    });
    // A refused review counts against nothing.
    expect(countFor(harness.store, 'installation')).toBe(0);
    expect(harness.store.spend.anthropic.get(utcDay(START))).toBeUndefined();
  });

  it('adds up every day of the month', () => {
    const store = createMemoryStore();
    const share = Math.floor(MONTHLY_CEILING_MICROS / 4);
    for (const day of ['2026-11-01', '2026-11-04', '2026-11-08']) {
      store.spend.anthropic.set(day, share);
    }
    // Three quarters are spent: a review that fits the last quarter runs…
    expect(admitAt(store, START, 1_000_000).ok).toBe(true);
    // …and one that does not is refused, though no single day is near its
    // own ceiling.
    expect(admitAt(store, START + 1, share)).toEqual({
      ok: false,
      error: 'monthly_limit',
      retryAt: '2026-12-01T00:00:00.000Z',
    });
    expect([...store.spend.anthropic.keys()].toSorted()).toEqual([
      '2026-11-01',
      '2026-11-04',
      '2026-11-08',
      '2026-11-11',
    ]);
  });

  it('starts again with the month, and forgets the month before', () => {
    const store = createMemoryStore();
    store.spend.anthropic.set('2026-11-15', 1);
    // The last day alone spent the whole of November…
    store.spend.anthropic.set('2026-11-30', MONTHLY_CEILING_MICROS);
    expect(admitAt(store, at('2026-11-30T23:00:00.000Z')).ok).toBe(false);

    // …and none of it counts in December, though that day is still stored.
    expect(admitAt(store, at('2026-12-01T00:30:00.000Z')).ok).toBe(true);
    // Yesterday is kept for reviews still settling against it; the rest of
    // last month is gone.
    expect([...store.spend.anthropic.keys()].toSorted()).toEqual([
      '2026-11-30',
      '2026-12-01',
    ]);
  });

  it('says the next month when the year turns', () => {
    const store = createMemoryStore();
    store.spend.anthropic.set('2026-12-02', MONTHLY_CEILING_MICROS);
    expect(admitAt(store, at('2026-12-15T12:00:00.000Z'))).toEqual({
      ok: false,
      error: 'monthly_limit',
      retryAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('answers for the month when the day is spent too', () => {
    const store = createMemoryStore();
    store.spend.anthropic.set(
      '2026-11-02',
      MONTHLY_CEILING_MICROS - DAILY_CEILING_MICROS,
    );
    store.spend.anthropic.set(utcDay(START), DAILY_CEILING_MICROS);
    // Tomorrow would not help: the month decides when a review can run.
    expect(admitAt(store, START)).toMatchObject({ error: 'monthly_limit' });
  });

  it('settles a review admitted before the month turned against its own day', () => {
    const store = createMemoryStore();
    const reservation = 3_000_000;
    const lastNight = admitAt(
      store,
      at('2026-11-30T23:59:00.000Z'),
      reservation,
    );
    if (!lastNight.ok) throw new Error('Expected admission.');
    // A review in the new month runs the store's housekeeping first.
    expect(admitAt(store, at('2026-12-01T00:01:00.000Z'), 1).ok).toBe(true);

    settle(store, {
      admission: lastNight.admission,
      actualMicros: 400_000,
      refundHourly: false,
    });
    expect(store.spend.anthropic.get('2026-11-30')).toBe(400_000);
    // None of it is charged to the new month.
    expect(store.getCommittedSince('anthropic', '2026-12-01')).toBe(1);
  });
});
