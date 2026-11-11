import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PROTOCOL_REVIEW_SERVICE_URL,
  type ReviewEvent,
  type ReviewRequest,
  type ReviewResult,
} from '@codaco/protocol-review-worker/contract';

import {
  createEventStreamParser,
  requestReview,
  reviewServiceUrl,
} from '../reviewClient';
import { makeFinding, STUDY_CONTEXT } from './fixtures';

const REQUEST: ReviewRequest = {
  installationId: '6a1f0e1c-2c1e-4c55-9e0a-6d3f4f2b9a10',
  locale: 'en',
  share: false,
  studyContext: STUDY_CONTEXT,
  protocol: { schemaVersion: 9 },
};

const RESULT: ReviewResult = {
  reviewId: '0b8f4c1e-9d0a-4a3e-8f8f-1f2e3d4c5b6a',
  findings: [makeFinding('f1', [])],
  quota: { limit: 5, remaining: 4, resetsAt: '2026-11-11T13:00:00.000Z' },
};

const sse = (events: readonly ReviewEvent[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

/** A streamed 200 answer, delivered in exactly these chunks. */
const streamResponse = (
  chunks: readonly string[],
  contentType = 'text/event-stream',
) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
};

const fetchReturning = (response: Response) =>
  vi.fn<typeof fetch>(async () => response);

const run = (fetchImpl: typeof fetch, onProgress?: (n: number) => void) =>
  requestReview({
    request: REQUEST,
    signal: new AbortController().signal,
    onProgress,
    url: 'https://review.test/review',
    fetchImpl,
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('reviewServiceUrl', () => {
  it('uses the service unless the build overrides it', () => {
    expect(reviewServiceUrl()).toBe(`${PROTOCOL_REVIEW_SERVICE_URL}/review`);
    vi.stubEnv('VITE_PROTOCOL_REVIEW_URL', 'http://localhost:8787');
    expect(reviewServiceUrl()).toBe('http://localhost:8787/review');
  });
});

describe('createEventStreamParser', () => {
  it('reassembles events split anywhere, across lines, CRLF and comments', () => {
    const received: string[] = [];
    const parser = createEventStreamParser((data) => received.push(data));
    const text =
      ': keep-alive\r\ndata: {"a":1}\r\n\r\nevent: x\ndata: one\ndata: two\n\ndata:{"b":2}\n\n';
    // Every split point, one character at a time.
    for (const character of text) parser.push(character);
    parser.end();
    expect(received).toEqual(['{"a":1}', 'one\ntwo', '{"b":2}']);
  });

  it('counts a last event that has no closing blank line', () => {
    const received: string[] = [];
    const parser = createEventStreamParser((data) => received.push(data));
    parser.push('data: last');
    parser.end();
    expect(received).toEqual(['last']);
  });
});

describe('requestReview', () => {
  it('posts the request as JSON and returns the result, reporting progress', async () => {
    const text = sse([
      { type: 'progress', received: 120 },
      { type: 'progress', received: 900 },
      { type: 'result', result: RESULT },
    ]);
    // Chunks that split events mid-JSON.
    const chunks = [
      text.slice(0, 7),
      text.slice(7, 50),
      text.slice(50, 51),
      text.slice(51),
    ];
    const fetchImpl = fetchReturning(streamResponse(chunks));
    const progress: number[] = [];
    const outcome = await run(fetchImpl, (n) => progress.push(n));

    expect(outcome).toEqual({ kind: 'result', result: RESULT });
    expect(progress).toEqual([120, 900]);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://review.test/review');
    expect(init?.method).toBe('POST');
    const body = init?.body;
    if (typeof body !== 'string') throw new Error('The body is not JSON text');
    expect(JSON.parse(body)).toEqual(REQUEST);
  });

  it('returns an error event as its code and retry time', async () => {
    const outcome = await run(
      fetchReturning(
        streamResponse([
          sse([
            { type: 'progress', received: 10 },
            {
              type: 'error',
              error: { error: 'service_unavailable', retryAt: null },
            },
          ]),
        ]),
      ),
    );
    expect(outcome).toEqual({
      kind: 'error',
      code: 'service_unavailable',
      retryAt: null,
    });
  });

  it.each([
    [429, 'hourly_limit', '2026-11-11T13:00:00.000Z'],
    [503, 'daily_limit', '2026-11-12T00:00:00.000Z'],
    [413, 'too_large', null],
    [403, 'forbidden_origin', null],
  ] as const)('maps an HTTP %i body to %s', async (status, code, retryAt) => {
    const outcome = await run(
      fetchReturning(
        new Response(JSON.stringify({ error: code, retryAt }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    expect(outcome).toEqual({ kind: 'error', code, retryAt });
  });

  it.each([
    [
      'a network failure',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch');
      }),
    ],
    [
      'an error body that is not the contract’s',
      fetchReturning(new Response('<html>', { status: 502 })),
    ],
    [
      'a 200 that is not a stream',
      fetchReturning(streamResponse(['{}'], 'application/json')),
    ],
    [
      'an event that is not JSON',
      fetchReturning(streamResponse(['data: {oops\n\n'])),
    ],
    [
      'an event the contract does not know',
      fetchReturning(streamResponse(['data: {"type":"other"}\n\n'])),
    ],
    [
      'a stream that ends without a result',
      fetchReturning(
        streamResponse([sse([{ type: 'progress', received: 5 }])]),
      ),
    ],
  ])('treats %s as service_unavailable', async (_name, fetchImpl) => {
    expect(await run(fetchImpl)).toEqual({
      kind: 'error',
      code: 'service_unavailable',
      retryAt: null,
    });
  });

  it('is abortable', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const pending = requestReview({
      request: REQUEST,
      signal: controller.signal,
      url: 'https://review.test/review',
      fetchImpl,
    });
    controller.abort();
    expect(await pending).toEqual({ kind: 'aborted' });
  });
});
