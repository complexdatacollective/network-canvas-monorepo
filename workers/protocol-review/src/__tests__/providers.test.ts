import { describe, expect, it } from 'vitest';

import { MAX_OUTPUT_TOKENS, PROVIDER_MODELS } from '../constants.ts';
import {
  PROVIDERS_PATH,
  ProviderStatusSchema,
  REVIEW_PROVIDERS,
  ReviewErrorSchema,
  type ReviewProvider,
} from '../contract.ts';
import { REVIEW_OUTPUT_SCHEMA } from '../findings.ts';
import { admit, availability, settle, utcDay } from '../limiter.ts';
import {
  costMicros,
  DAILY_CEILING_MICROS,
  MONTHLY_CEILING_MICROS,
  reservationMicros,
} from '../pricing.ts';
import { REVIEW_SYSTEM_PROMPT } from '../prompt/build.ts';
import { handleRequest } from '../review.ts';
import {
  answerWith,
  createHarness,
  createMemoryStore,
  modelFinding,
  ORIGIN,
  readEvents,
  reviewRequest,
  scriptedModel,
  START,
  USAGE,
  validRequest,
} from './helpers.ts';

/**
 * The researcher chooses whose model writes a review. Each provider has its
 * own budget, so one that is spent leaves the other available, and Architect
 * can ask which have room before it offers the choice.
 */

const URL_PROVIDERS = `https://protocol-review.networkcanvas.com${PROVIDERS_PATH}`;
const TODAY = utcDay(START);
const NEXT_MIDNIGHT = '2026-11-12T00:00:00.000Z';
const NEXT_MONTH = '2026-12-01T00:00:00.000Z';

const okModel = () => scriptedModel({ chunks: [answerWith([])] });

const bothModels = () => ({ anthropic: okModel(), openai: okModel() });

const run = async (
  harness: ReturnType<typeof createHarness>,
  provider: ReviewProvider,
) => {
  const response = await handleRequest(
    reviewRequest(validRequest({ provider })),
    harness.deps,
  );
  const body =
    response.headers.get('Content-Type') === 'text/event-stream'
      ? await readEvents(response)
      : ReviewErrorSchema.parse(await response.json());
  await harness.settled();
  return { status: response.status, body };
};

const askStatus = async (
  harness: ReturnType<typeof createHarness>,
  init: RequestInit = {},
) =>
  handleRequest(
    new Request(URL_PROVIDERS, { headers: { Origin: ORIGIN }, ...init }),
    harness.deps,
  );

describe('the provider a review asks for', () => {
  it.each(REVIEW_PROVIDERS)(
    'runs %s’s model and no other',
    async (provider) => {
      const models = bothModels();
      const harness = createHarness(models);
      const { status } = await run(harness, provider);

      expect(status).toBe(200);
      for (const other of REVIEW_PROVIDERS) {
        expect(models[other].calls).toHaveLength(other === provider ? 1 : 0);
      }
    },
  );

  it.each(REVIEW_PROVIDERS)(
    'charges %s’s budget, at its own prices, and no other',
    async (provider) => {
      const harness = createHarness(bothModels());
      await run(harness, provider);

      for (const other of REVIEW_PROVIDERS) {
        expect(harness.store.spend[other].get(TODAY)).toBe(
          other === provider ? costMicros(provider, USAGE) : undefined,
        );
      }
    },
  );

  it('refuses a request that names no provider, or one it does not know', async () => {
    const models = bothModels();
    const harness = createHarness(models);
    const { provider: _, ...unnamed } = validRequest();
    for (const body of [unnamed, { ...validRequest(), provider: 'other' }]) {
      const response = await handleRequest(reviewRequest(body), harness.deps);
      expect(response.status).toBe(400);
      expect(ReviewErrorSchema.parse(await response.json()).error).toBe(
        'invalid_request',
      );
    }
    expect(models.anthropic.calls).toHaveLength(0);
    expect(models.openai.calls).toHaveLength(0);
  });

  it('says which provider failed, and which wrote a shared review', async () => {
    const failing = createHarness({
      anthropic: okModel(),
      openai: scriptedModel({ chunks: ['not json'] }),
    });
    await run(failing, 'openai');
    expect(failing.notices).toEqual([
      { reason: 'unparseable', status: 200, provider: 'openai' },
    ]);
    expect(failing.logs).toEqual(failing.notices);

    const shared = createHarness({
      anthropic: okModel(),
      openai: scriptedModel({ chunks: [answerWith([modelFinding('Kept')])] }),
    });
    await handleRequest(
      reviewRequest(validRequest({ provider: 'openai', share: true })),
      shared.deps,
    ).then(readEvents);
    await shared.settled();
    expect(JSON.parse(shared.shared[0]?.value ?? 'null')).toMatchObject({
      provider: 'openai',
      model: PROVIDER_MODELS.openai.model,
    });
  });
});

describe('each provider’s own budget', () => {
  it.each([
    ['daily_limit', TODAY, DAILY_CEILING_MICROS, 503, NEXT_MIDNIGHT],
    ['monthly_limit', '2026-11-02', MONTHLY_CEILING_MICROS, 503, NEXT_MONTH],
  ] as const)(
    'refuses a provider whose budget is spent (%s) and still runs the other',
    async (error, day, spent, status, retryAt) => {
      for (const provider of REVIEW_PROVIDERS) {
        const other = provider === 'anthropic' ? 'openai' : 'anthropic';
        const models = bothModels();
        const harness = createHarness(models);
        harness.store.spend[provider].set(day, spent);

        expect(await run(harness, provider)).toEqual({
          status,
          body: { error, retryAt },
        });
        expect(models[provider].calls).toHaveLength(0);
        expect((await run(harness, other)).status).toBe(200);
        expect(models[other].calls).toHaveLength(1);
      }
    },
  );

  it('counts the hourly limit across providers: it is the researcher’s, not the provider’s', async () => {
    const harness = createHarness(bothModels());
    for (const provider of [
      'anthropic',
      'openai',
      'anthropic',
      'openai',
      'anthropic',
    ] as const) {
      expect((await run(harness, provider)).status).toBe(200);
    }
    expect((await run(harness, 'openai')).status).toBe(429);
  });

  it('settles a review against the provider it was admitted for', () => {
    const store = createMemoryStore();
    const admitted = admit(store, {
      installationKey: 'i',
      addressKey: 'a',
      provider: 'openai',
      reservationMicros: 900_000,
      now: START,
    });
    if (!admitted.ok) throw new Error('Expected admission.');
    expect(store.spend.openai.get(TODAY)).toBe(900_000);
    expect(store.spend.anthropic.get(TODAY)).toBeUndefined();

    settle(store, {
      admission: admitted.admission,
      actualMicros: 250_000,
      refundHourly: false,
    });
    expect(store.spend.openai.get(TODAY)).toBe(250_000);
    expect(store.spend.anthropic.get(TODAY)).toBeUndefined();
  });
});

describe('prices', () => {
  it('prices each provider from its own table', () => {
    // 1,000 input, 10,000 cache reads and 2,000 output.
    // Opus 5.5: $4, $0.20 and $20 a million. GPT-6.1 Sol: $2, $0.10 and $10.
    expect(costMicros('anthropic', USAGE)).toBe(4_000 + 2_000 + 40_000);
    expect(costMicros('openai', USAGE)).toBe(2_000 + 1_000 + 20_000);
    const written = {
      inputTokens: 0,
      cacheCreationInputTokens: 100_000,
      cacheReadInputTokens: 0,
      outputTokens: 0,
    };
    expect(costMicros('anthropic', written)).toBe(500_000);
    expect(costMicros('openai', written)).toBe(250_000);
  });

  it('charges a long OpenAI request at the long-context prices throughout', () => {
    const usage = (inputTokens: number) => ({
      inputTokens,
      cacheCreationInputTokens: 1_000,
      cacheReadInputTokens: 1_000,
      outputTokens: 1_000,
    });
    // The three input counts together decide: 272,000 is not over it.
    expect(costMicros('openai', usage(270_000))).toBe(
      270_000 * 2 + 2_500 + 100 + 10_000,
    );
    expect(costMicros('openai', usage(270_001))).toBe(
      270_001 * 4 + 5_000 + 200 + 15_000,
    );
    // Anthropic has no such tier.
    expect(costMicros('anthropic', usage(270_001))).toBe(
      270_001 * 4 + 5_000 + 200 + 20_000,
    );
  });

  it('reserves a request that may be long at the long-context prices', () => {
    // One token a byte, plus 1,000 for the framing: 271,000 bytes is exactly
    // at the threshold, and one more byte may be over it.
    const at = reservationMicros('openai', ['x'.repeat(271_000)]);
    expect(at).toBe(272_000 * 2.5 + MAX_OUTPUT_TOKENS * 10);
    const over = reservationMicros('openai', ['x'.repeat(271_001)]);
    expect(over).toBe(272_001 * 5 + MAX_OUTPUT_TOKENS * 15);
    // Whatever the provider reports for it, the reservation covers it.
    expect(over).toBeGreaterThanOrEqual(
      costMicros('openai', {
        inputTokens: 0,
        cacheCreationInputTokens: 272_001,
        cacheReadInputTokens: 0,
        outputTokens: MAX_OUTPUT_TOKENS,
      }),
    );
  });
});

describe('which providers are available', () => {
  const smallest = {
    anthropic: reservationMicros('anthropic', [
      REVIEW_SYSTEM_PROMPT,
      JSON.stringify(REVIEW_OUTPUT_SCHEMA),
    ]),
    openai: reservationMicros('openai', [
      REVIEW_SYSTEM_PROMPT,
      JSON.stringify(REVIEW_OUTPUT_SCHEMA),
    ]),
  };
  const open = (provider: ReviewProvider) => ({
    provider,
    available: true,
    reason: null,
    retryAt: null,
  });

  it('answers every provider as available while each has room', async () => {
    const harness = createHarness(bothModels());
    const response = await askStatus(harness);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(ProviderStatusSchema.parse(await response.json())).toEqual({
      providers: [open('anthropic'), open('openai')],
    });
  });

  it('says which budget a provider has spent, and when it starts again', async () => {
    const harness = createHarness(bothModels());
    harness.store.spend.openai.set(TODAY, DAILY_CEILING_MICROS);
    expect(await (await askStatus(harness)).json()).toEqual({
      providers: [
        open('anthropic'),
        {
          provider: 'openai',
          available: false,
          reason: 'daily_limit',
          retryAt: NEXT_MIDNIGHT,
        },
      ],
    });

    // The month decides when both are spent.
    harness.store.spend.anthropic.set('2026-11-02', MONTHLY_CEILING_MICROS);
    harness.store.spend.anthropic.set(TODAY, DAILY_CEILING_MICROS);
    expect(
      ProviderStatusSchema.parse(await (await askStatus(harness)).json())
        .providers[0],
    ).toEqual({
      provider: 'anthropic',
      available: false,
      reason: 'monthly_limit',
      retryAt: NEXT_MONTH,
    });
  });

  it('is available exactly while the smallest review still fits', () => {
    for (const provider of REVIEW_PROVIDERS) {
      const store = createMemoryStore();
      const room = DAILY_CEILING_MICROS - smallest[provider];
      store.spend[provider].set(TODAY, room);
      const read = () =>
        availability(store, {
          smallestReservationMicros: smallest,
          now: START,
        }).find((entry) => entry.provider === provider)?.available;
      expect(read()).toBe(true);
      // What Architect is told matches what a review would be told.
      const keys = { installationKey: 'i', addressKey: 'a', provider };
      expect(
        admit(createStoreWith(provider, room), {
          ...keys,
          reservationMicros: smallest[provider],
          now: START,
        }).ok,
      ).toBe(true);

      store.spend[provider].set(TODAY, room + 1);
      expect(read()).toBe(false);
      expect(
        admit(createStoreWith(provider, room + 1), {
          ...keys,
          reservationMicros: smallest[provider],
          now: START,
        }).ok,
      ).toBe(false);
    }
  });

  it('does not count last month’s spending, and changes nothing by asking', () => {
    const store = createMemoryStore();
    store.spend.anthropic.set('2026-10-31', MONTHLY_CEILING_MICROS);
    const before = JSON.stringify([...store.spend.anthropic]);
    expect(
      availability(store, { smallestReservationMicros: smallest, now: START }),
    ).toEqual([open('anthropic'), open('openai')]);
    expect(JSON.stringify([...store.spend.anthropic])).toBe(before);
    expect(store.windows.size).toBe(0);
  });

  it('answers only GET, counts against no limit and calls no model', async () => {
    const models = bothModels();
    const harness = createHarness(models);
    const posted = await askStatus(harness, { method: 'POST', body: '{}' });
    expect(posted.status).toBe(405);
    expect(posted.headers.get('Allow')).toBe('GET, OPTIONS');

    for (let asked = 0; asked < 50; asked += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one after another, as a client would ask
      expect((await askStatus(harness)).status).toBe(200);
    }
    expect(harness.store.windows.size).toBe(0);
    expect(models.anthropic.calls).toHaveLength(0);
    expect(models.openai.calls).toHaveLength(0);
  });

  it('refuses another origin, and says the service is unavailable when the limiter is', async () => {
    const harness = createHarness(bothModels());
    const elsewhere = await handleRequest(
      new Request(URL_PROVIDERS, {
        headers: { Origin: 'https://evil.example' },
      }),
      harness.deps,
    );
    expect(elsewhere.status).toBe(403);

    harness.deps.limiter = {
      ...harness.deps.limiter,
      availability: async () => {
        throw new Error('The limiter is unreachable.');
      },
    };
    const failed = await askStatus(harness);
    expect(failed.status).toBe(503);
    expect(ReviewErrorSchema.parse(await failed.json())).toEqual({
      error: 'service_unavailable',
      retryAt: null,
    });
  });
});

/** A store in which `provider` has spent `micros` today. */
function createStoreWith(provider: ReviewProvider, micros: number) {
  const store = createMemoryStore();
  store.spend[provider].set(TODAY, micros);
  return store;
}
