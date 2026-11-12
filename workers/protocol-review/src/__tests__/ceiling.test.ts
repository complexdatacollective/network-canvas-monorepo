import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import {
  createAnthropicModel,
  isConfirmedRejection,
} from '../anthropic-model.ts';
import { MAX_OUTPUT_TOKENS } from '../constants.ts';
import { REVIEW_OUTPUT_SCHEMA } from '../findings.ts';
import { utcDay } from '../limiter.ts';
import type { ReviewModel } from '../model.ts';
import { costMicros } from '../pricing.ts';
import { buildReviewMessage, REVIEW_SYSTEM_PROMPT } from '../prompt/build.ts';
import { handleRequest } from '../review.ts';
import {
  answerWith,
  countFor,
  createHarness,
  ORIGIN,
  reviewRequest,
  scriptedModel,
  START,
  URL_REVIEW,
  validRequest,
} from './helpers.ts';

/**
 * The day's recorded spending must never be less than what the provider may
 * have billed, and a client that has gone away must never start or keep a
 * paid call running.
 */

const byteLength = (text: string): number =>
  new TextEncoder().encode(text).byteLength;

/** Records every reservation the review asks the limiter for. */
const recordReservations = (harness: ReturnType<typeof createHarness>) => {
  const reserved: number[] = [];
  const { admit } = harness.deps.limiter;
  harness.deps.limiter = {
    ...harness.deps.limiter,
    admit: async (request) => {
      reserved.push(request.reservationMicros);
      return admit(request);
    },
  };
  return reserved;
};

/** A provider that answers every request with one HTTP error status. */
const rejectingFetch = (status: number, type: string) => {
  const calls: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push(new Request(input, init));
    return new Response(
      JSON.stringify({ type: 'error', error: { type, message: 'x' } }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  };
  return { calls, fetcher };
};

const spentToday = (harness: ReturnType<typeof createHarness>) =>
  harness.store.spend.anthropic.get(utcDay(START)) ?? 0;

describe('the reservation', () => {
  it('covers one token for every UTF-8 byte the request sends, however dense the text', async () => {
    const harness = createHarness(scriptedModel({ chunks: [answerWith([])] }));
    const reserved = recordReservations(harness);
    // Chinese and emoji cost about a token a character, far denser than the
    // English and JSON a characters-per-token estimate assumes.
    const base = validRequest();
    const request = validRequest({
      studyContext: {
        ...base.studyContext,
        synopsis: '朋友的支持😀'.repeat(300),
      },
    });
    await (await handleRequest(reviewRequest(request), harness.deps)).text();
    await harness.settled();

    const sentBytes =
      byteLength(REVIEW_SYSTEM_PROMPT) +
      byteLength(buildReviewMessage(request)) +
      byteLength(JSON.stringify(REVIEW_OUTPUT_SCHEMA));
    expect(reserved).toHaveLength(1);
    expect(reserved[0]).toBeGreaterThanOrEqual(
      costMicros('anthropic', {
        inputTokens: 0,
        cacheCreationInputTokens: sentBytes,
        cacheReadInputTokens: 0,
        outputTokens: MAX_OUTPUT_TOKENS,
      }),
    );
  });
});

describe('a failed call', () => {
  it('keeps the whole reservation when the connection fails before an answer', async () => {
    let attempts = 0;
    const model = createAnthropicModel('test-key', {
      fetch: async () => {
        attempts += 1;
        throw new TypeError('The network connection was lost.');
      },
    });
    const harness = createHarness(model);
    const reserved = recordReservations(harness);
    const response = await handleRequest(
      reviewRequest(validRequest()),
      harness.deps,
    );
    await harness.settled();

    expect(response.status).toBe(503);
    expect(spentToday(harness)).toBe(reserved[0]);
    expect(attempts).toBe(1);
  });

  it('keeps the whole reservation when the client leaves before the answer begins', async () => {
    const { promise: fetched, resolve: markFetched } =
      Promise.withResolvers<void>();
    const model = createAnthropicModel('test-key', {
      fetch: async (_input, init) => {
        markFetched();
        const signal = init?.signal;
        // The request is on its way; the provider may already be working.
        return new Promise<Response>((_resolve, reject) => {
          const fail = () =>
            reject(new DOMException('The request was aborted.', 'AbortError'));
          if (signal?.aborted) fail();
          signal?.addEventListener('abort', fail);
        });
      },
    });
    const harness = createHarness(model);
    const reserved = recordReservations(harness);
    const client = new AbortController();
    const request = new Request(URL_REVIEW, {
      method: 'POST',
      headers: { 'Origin': ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify(validRequest()),
      signal: client.signal,
    });
    const handled = handleRequest(request, harness.deps);
    await fetched;
    client.abort();
    await handled;
    await harness.settled();

    expect(spentToday(harness)).toBe(reserved[0]);
    // A review the researcher cancels still counts.
    expect(countFor(harness.store, 'installation')).toBe(1);
  });

  it('releases the reservation when the provider refuses the request outright', async () => {
    const { calls, fetcher } = rejectingFetch(401, 'authentication_error');
    const harness = createHarness(
      createAnthropicModel('test-key', { fetch: fetcher }),
    );
    const response = await handleRequest(
      reviewRequest(validRequest()),
      harness.deps,
    );
    await harness.settled();

    expect(response.status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(spentToday(harness)).toBe(0);
  });

  it('makes one attempt, so no unreported earlier attempt can be billed', async () => {
    const { calls, fetcher } = rejectingFetch(529, 'overloaded_error');
    const harness = createHarness(
      createAnthropicModel('test-key', { fetch: fetcher }),
    );
    const response = await handleRequest(
      reviewRequest(validRequest()),
      harness.deps,
    );
    await harness.settled();

    expect(response.status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(harness.notices).toEqual([
      { reason: 'overloaded', status: 529, provider: 'anthropic' },
    ]);
  });
});

describe('a confirmed rejection', () => {
  it('is only an HTTP error status from the provider', () => {
    const headers = new Headers();
    expect(
      isConfirmedRejection(
        new APIError(529, undefined, 'x', headers, 'overloaded_error'),
      ),
    ).toBe(true);
    for (const ambiguous of [
      // An error event in the middle of a stream: the answer had begun.
      new APIError(undefined, undefined, 'x', undefined, 'overloaded_error'),
      new APIConnectionError({ message: 'x' }),
      new APIConnectionTimeoutError(),
      new APIUserAbortError(),
      new Error('anything else'),
    ]) {
      expect(isConfirmedRejection(ambiguous)).toBe(false);
    }
  });
});

describe('a client that goes away', () => {
  it('never starts the model call when it left while the review was being admitted', async () => {
    const model: ReviewModel & { calls: unknown[] } = scriptedModel({
      chunks: [answerWith([])],
    });
    const harness = createHarness(model);
    const client = new AbortController();
    const { admit } = harness.deps.limiter;
    harness.deps.limiter = {
      ...harness.deps.limiter,
      admit: async (admitRequest) => {
        const result = await admit(admitRequest);
        client.abort();
        return result;
      },
    };
    const request = new Request(URL_REVIEW, {
      method: 'POST',
      headers: { 'Origin': ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify(validRequest()),
      signal: client.signal,
    });
    await handleRequest(request, harness.deps);
    await harness.settled();

    expect(model.calls).toHaveLength(0);
    // Nothing was spent, and the cancelled review still counts.
    expect(spentToday(harness)).toBe(0);
    expect(countFor(harness.store, 'installation')).toBe(1);
  });
});
