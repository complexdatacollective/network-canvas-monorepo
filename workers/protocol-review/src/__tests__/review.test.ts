import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import { classifyProviderError } from '../anthropic-model.ts';
import {
  ANALYTICS_DISTINCT_ID,
  MAX_FINDINGS,
  SERVICE_FAILURE_EVENT,
} from '../constants.ts';
import { REVIEW_LIMITS } from '../contract.ts';
import {
  BILLING_UNKNOWN,
  ModelCallError,
  type ModelFailureReason,
  REJECTED,
  reported,
} from '../model.ts';
import { createPostHogNotifier, logFailure } from '../notify.ts';
import { handleRequest } from '../review.ts';
import {
  ADDRESS,
  answerWith,
  countFor,
  createHarness,
  INSTALLATION_ID,
  modelFinding,
  readEvents,
  reviewRequest,
  scriptedModel,
  USAGE,
  validRequest,
} from './helpers.ts';

/** Splits an answer into pieces, as the model would stream it. */
const pieces = (text: string, size: number): string[] => {
  const result: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    result.push(text.slice(index, index + size));
  }
  return result;
};

describe('a successful review', () => {
  it('streams progress, then one result with checked, ordered, numbered findings', async () => {
    const answer = answerWith([
      modelFinding('A suggestion', 'suggestion'),
      modelFinding('First worth fixing', 'worth_fixing'),
      { ...modelFinding('Bad category'), category: 'colour' },
      modelFinding('A serious one', 'serious'),
      { ...modelFinding('Missing fix'), fix: undefined },
      modelFinding('Second worth fixing', 'worth_fixing'),
      'not even an object',
    ]);
    const chunks = pieces(answer, 40);
    const thinking = pieces(
      'Reading each stage against the study. '.repeat(8),
      30,
    );
    const harness = createHarness(
      scriptedModel({
        thinking,
        chunks,
        // 100 ms between pieces: progress may go out at most every 250 ms.
        beforeChunk: () => {
          harness.clock.now += 100;
        },
      }),
    );

    const response = await handleRequest(
      reviewRequest(validRequest()),
      harness.deps,
    );
    expect(response.status).toBe(200);
    const events = await readEvents(response);

    const progress = events.filter((event) => event.type === 'progress');
    const received = progress.map((event) =>
      event.type === 'progress' ? event.received : -1,
    );
    expect(received.length).toBeGreaterThan(1);
    expect(received.length).toBeLessThan((thinking.length + chunks.length) / 2);
    expect(received).toEqual(received.toSorted((a, b) => a - b));
    expect(Math.max(...received)).toBeLessThanOrEqual(answer.length);

    // The thinking comes first and is counted apart from the answer: it has
    // moved before any of the answer has arrived, and never goes back.
    const thought = progress.map((event) =>
      event.type === 'progress' ? event.thinking : undefined,
    );
    expect(thought.every((count) => typeof count === 'number')).toBe(true);
    expect(thought).toEqual(thought.toSorted((a, b) => (a ?? 0) - (b ?? 0)));
    const beforeAnswer = progress.filter(
      (event) => event.type === 'progress' && event.received === 0,
    );
    expect(
      beforeAnswer.some(
        (event) => event.type === 'progress' && (event.thinking ?? 0) > 0,
      ),
    ).toBe(true);
    expect(thought.at(-1)).toBe(thinking.join('').length);

    const last = events.at(-1);
    expect(events.filter((event) => event.type === 'result')).toHaveLength(1);
    if (last?.type !== 'result') throw new Error('Expected a result last.');
    expect(last.result.findings.map(({ id, title }) => [id, title])).toEqual([
      ['f1', 'A serious one'],
      ['f2', 'First worth fixing'],
      ['f3', 'Second worth fixing'],
      ['f4', 'A suggestion'],
    ]);
    expect(last.result.reviewId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it(`returns at most ${MAX_FINDINGS} findings, keeping the most serious`, async () => {
    const findings = [
      ...Array.from({ length: 10 }, (_, index) =>
        modelFinding(`Suggestion ${index}`, 'suggestion'),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        modelFinding(`Serious ${index}`, 'serious'),
      ),
    ];
    const harness = createHarness(
      scriptedModel({ chunks: [answerWith(findings)] }),
    );
    const events = await readEvents(
      await handleRequest(reviewRequest(validRequest()), harness.deps),
    );
    const last = events.at(-1);
    if (last?.type !== 'result') throw new Error('Expected a result.');
    expect(last.result.findings).toHaveLength(MAX_FINDINGS);
    expect(
      last.result.findings.slice(0, 5).every((f) => f.severity === 'serious'),
    ).toBe(true);
    expect(new Set(last.result.findings.map((f) => f.id)).size).toBe(
      MAX_FINDINGS,
    );
  });

  it('reports an empty review as a result with no findings', async () => {
    const harness = createHarness(scriptedModel({ chunks: [answerWith([])] }));
    const events = await readEvents(
      await handleRequest(reviewRequest(validRequest()), harness.deps),
    );
    const last = events.at(-1);
    if (last?.type !== 'result') throw new Error('Expected a result.');
    expect(last.result.findings).toEqual([]);
  });

  it('sends the model the cached instructions first and the request after', async () => {
    const model = scriptedModel({ chunks: [answerWith([])] });
    const harness = createHarness(model);
    await readEvents(
      await handleRequest(reviewRequest(validRequest()), harness.deps),
    );
    const [call] = model.calls;
    expect(call?.system).not.toContain('Secret Study Name');
    expect(call?.user).toContain('Secret Study Name');
  });
});

const PROVIDER_FAILURES: [ModelFailureReason, number][] = [
  ['authentication', 401],
  ['billing', 402],
  ['permission', 403],
  ['rate_limited', 429],
  ['overloaded', 529],
  ['provider_error', 500],
  ['bad_request', 400],
  ['connection', 0],
  ['timeout', 0],
  ['unknown', 0],
];

describe('provider failures', () => {
  it.each(PROVIDER_FAILURES)(
    '%s before the stream starts is a 503 service_unavailable',
    async (reason, status) => {
      const harness = createHarness(
        scriptedModel({
          start: false,
          error: new ModelCallError(
            reason,
            status,
            status === 0 ? BILLING_UNKNOWN : REJECTED,
          ),
        }),
      );
      const response = await handleRequest(
        reviewRequest(validRequest()),
        harness.deps,
      );
      await harness.settled();

      expect(response.status).toBe(503);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://architect.networkcanvas.com',
      );
      expect(await response.json()).toEqual({
        error: 'service_unavailable',
        retryAt: null,
      });
      expect(countFor(harness.store, 'installation')).toBe(0);
      expect(harness.logs).toEqual([{ reason, status, provider: 'anthropic' }]);
      expect(harness.notices).toEqual([
        { reason, status, provider: 'anthropic' },
      ]);
    },
  );

  it.each(PROVIDER_FAILURES)(
    '%s after the stream starts ends it with an error event',
    async (reason, status) => {
      const harness = createHarness(
        scriptedModel({
          chunks: ['{"findings":['],
          error: new ModelCallError(
            reason,
            status,
            reported({ ...USAGE, outputTokens: null }),
          ),
        }),
      );
      const response = await handleRequest(
        reviewRequest(validRequest()),
        harness.deps,
      );
      expect(response.status).toBe(200);
      const events = await readEvents(response);
      await harness.settled();

      expect(events.at(-1)).toEqual({
        type: 'error',
        error: { error: 'service_unavailable', retryAt: null },
      });
      expect(events.filter((event) => event.type !== 'progress')).toHaveLength(
        1,
      );
      expect(countFor(harness.store, 'installation')).toBe(0);
      expect(harness.notices).toEqual([
        { reason, status, provider: 'anthropic' },
      ]);
    },
  );

  it.each([
    ['refusal', { stopReason: 'refusal' }, 'refusal'],
    ['a truncated answer', { stopReason: 'max_tokens' }, 'truncated'],
    [
      'an answer that is not JSON',
      { text: 'I cannot help with that.' },
      'unparseable',
    ],
    [
      'an answer of the wrong shape',
      { text: '{"problems":[]}' },
      'unparseable',
    ],
    [
      'an answer whose findings all fail',
      { text: answerWith([{ ...modelFinding('x'), severity: 'grave' }]) },
      'no_valid_findings',
    ],
  ])(
    '%s is service_unavailable and is not counted',
    async (_, output, reason) => {
      const harness = createHarness(scriptedModel({ chunks: ['{'], output }));
      const events = await readEvents(
        await handleRequest(reviewRequest(validRequest()), harness.deps),
      );
      await harness.settled();
      expect(events.at(-1)).toEqual({
        type: 'error',
        error: { error: 'service_unavailable', retryAt: null },
      });
      expect(countFor(harness.store, 'installation')).toBe(0);
      expect(harness.notices).toEqual([
        { reason, status: 200, provider: 'anthropic' },
      ]);
    },
  );

  it('abandons a review that runs too long, as a timeout', async () => {
    const model = scriptedModel({
      waitForAbort: {
        abortError: new ModelCallError(
          'cancelled',
          0,
          reported({ ...USAGE, outputTokens: null }),
        ),
      },
    });
    const harness = createHarness(model, { timing: { timeoutMs: 5 } });
    const events = await readEvents(
      await handleRequest(reviewRequest(validRequest()), harness.deps),
    );
    await harness.settled();
    expect(events.at(-1)?.type).toBe('error');
    expect(harness.notices).toEqual([
      { reason: 'timeout', status: 0, provider: 'anthropic' },
    ]);
    expect(countFor(harness.store, 'installation')).toBe(0);
  });

  it('classifies the SDK errors as fixed reasons', () => {
    const headers = new Headers();
    const cases: [unknown, ModelFailureReason, number][] = [
      [
        new APIError(401, undefined, 'x', headers, 'authentication_error'),
        'authentication',
        401,
      ],
      [
        new APIError(402, undefined, 'x', headers, 'billing_error'),
        'billing',
        402,
      ],
      [
        new APIError(429, undefined, 'x', headers, 'rate_limit_error'),
        'rate_limited',
        429,
      ],
      [
        new APIError(529, undefined, 'x', headers, 'overloaded_error'),
        'overloaded',
        529,
      ],
      [new APIError(503, undefined, 'x', headers, null), 'provider_error', 503],
      // An error event in the middle of a stream has a type and no status.
      [
        new APIError(undefined, undefined, 'x', undefined, 'overloaded_error'),
        'overloaded',
        0,
      ],
      [new APIUserAbortError(), 'cancelled', 0],
      [new APIConnectionError({ message: 'x' }), 'connection', 0],
      [new Error('anything else'), 'unknown', 0],
    ];
    for (const [error, reason, status] of cases) {
      expect(classifyProviderError(error)).toEqual({ reason, status });
    }
  });
});

describe('sharing', () => {
  it('keeps a shared, successful review for the retention period', async () => {
    const harness = createHarness(
      scriptedModel({ chunks: [answerWith([modelFinding('Kept')])] }),
    );
    const request = validRequest({ share: true, locale: 'de' });
    const events = await readEvents(
      await handleRequest(reviewRequest(request), harness.deps),
    );
    await harness.settled();
    const last = events.at(-1);
    if (last?.type !== 'result') throw new Error('Expected a result.');

    expect(harness.shared).toHaveLength(1);
    const [record] = harness.shared;
    expect(record?.key).toBe(`review:${last.result.reviewId}`);
    expect(record?.expirationTtl).toBe(
      REVIEW_LIMITS.sharedReviewRetentionDays * 24 * 60 * 60,
    );
    expect(JSON.parse(record?.value ?? 'null')).toEqual({
      receivedAt: '2026-11-11T10:00:00.000Z',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      locale: 'de',
      studyContext: request.studyContext,
      protocol: request.protocol,
      findings: last.result.findings,
    });
  });

  it('keeps nothing when the researcher did not share', async () => {
    const harness = createHarness(
      scriptedModel({ chunks: [answerWith([modelFinding('Not kept')])] }),
    );
    await readEvents(
      await handleRequest(
        reviewRequest(validRequest({ share: false })),
        harness.deps,
      ),
    );
    await harness.settled();
    expect(harness.shared).toEqual([]);
  });

  it('keeps nothing when a shared review failed', async () => {
    const harness = createHarness(
      scriptedModel({ chunks: ['{'], output: { stopReason: 'refusal' } }),
    );
    await readEvents(
      await handleRequest(
        reviewRequest(validRequest({ share: true })),
        harness.deps,
      ),
    );
    await harness.settled();
    expect(harness.shared).toEqual([]);
  });
});

describe('what leaves the service', () => {
  it('logs and notifies with fixed codes and numbers only', async () => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    const sent: { url: string; body: unknown }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const body = typeof init?.body === 'string' ? init.body : 'null';
      sent.push({ url, body: JSON.parse(body) });
      return new Response(null, { status: 200 });
    };
    try {
      const harness = createHarness(
        scriptedModel({
          chunks: ['{"findings":[{"title":"Secret Study Name"'],
          error: new ModelCallError(
            'overloaded',
            529,
            reported({ ...USAGE, outputTokens: null }),
          ),
        }),
        { notify: createPostHogNotifier(fetcher), log: logFailure },
      );
      await readEvents(
        await handleRequest(
          reviewRequest(validRequest({ share: true })),
          harness.deps,
        ),
      );
      await harness.settled();
    } finally {
      console.error = original;
    }

    expect(lines).toEqual([
      'protocol_review_failure provider=anthropic reason=overloaded status=529',
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://us.i.posthog.com/capture/');
    const body = sent[0]?.body as Record<string, unknown>;
    expect(Object.keys(body).toSorted()).toEqual([
      'api_key',
      'distinct_id',
      'event',
      'properties',
    ]);
    expect(body.event).toBe(SERVICE_FAILURE_EVENT);
    expect(body.distinct_id).toBe(ANALYTICS_DISTINCT_ID);
    expect(body.properties).toEqual({
      reason: 'overloaded',
      status: 529,
      provider: 'anthropic',
    });

    const everything = JSON.stringify({ lines, sent });
    for (const secret of [
      'Secret Study Name',
      INSTALLATION_ID,
      ADDRESS,
      'First-year undergraduate students',
    ]) {
      expect(everything).not.toContain(secret);
    }
  });

  it('does not let a failing notice affect the response', async () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      const harness = createHarness(
        scriptedModel({
          start: false,
          error: new ModelCallError('billing', 402, REJECTED),
        }),
        {
          notify: createPostHogNotifier(async () => {
            throw new Error('PostHog is down');
          }),
        },
      );
      const response = await handleRequest(
        reviewRequest(validRequest()),
        harness.deps,
      );
      await harness.settled();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: 'service_unavailable',
        retryAt: null,
      });
    } finally {
      console.error = original;
    }
  });
});
