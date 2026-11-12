import { describe, expect, it } from 'vitest';

import { REVIEW_LIMITS, ReviewErrorSchema } from '../contract.ts';
import { handleRequest } from '../review.ts';
import {
  answerWith,
  createHarness,
  ORIGIN,
  readEvents,
  reviewRequest,
  scriptedModel,
  URL_REVIEW,
  validRequest,
} from './helpers.ts';

const okModel = () => scriptedModel({ chunks: [answerWith([])] });

describe('origins and CORS', () => {
  it.each([
    'https://architect.networkcanvas.com',
    'https://architect.networkcanvas.dev',
  ])('answers %s and echoes it', async (origin) => {
    const { deps } = createHarness(okModel());
    const response = await handleRequest(
      reviewRequest(validRequest(), { Origin: origin }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    await response.text();
  });

  it.each([
    'https://deploy-preview-2581--architect-dev.netlify.app',
    'https://deploy-preview-7--architect-dev.netlify.app',
  ])('answers a preview of an Architect pull request (%s)', async (origin) => {
    const { deps } = createHarness(okModel());
    const response = await handleRequest(
      reviewRequest(validRequest(), { Origin: origin }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    await response.text();
  });

  it.each([
    ['another site', { Origin: 'https://evil.example' }],
    [
      'a preview of another Netlify site',
      { Origin: 'https://deploy-preview-2581--architect-dev-copy.netlify.app' },
    ],
    [
      'a preview name on another host',
      {
        Origin:
          'https://deploy-preview-2581--architect-dev.netlify.app.evil.example',
      },
    ],
    [
      'a branch deploy, which anyone who can push a branch names',
      { Origin: 'https://some-branch--architect-dev.netlify.app' },
    ],
    [
      'a preview with no number',
      { Origin: 'https://deploy-preview---architect-dev.netlify.app' },
    ],
    [
      'a preview over plain HTTP',
      { Origin: 'http://deploy-preview-2581--architect-dev.netlify.app' },
    ],
    [
      'a look-alike',
      { Origin: 'https://architect.networkcanvas.com.evil.example' },
    ],
    ['no origin at all', {}],
  ])('refuses %s with 403 and no CORS headers', async (_, headers) => {
    const model = okModel();
    const { deps, store } = createHarness(model);
    const request = new Request(URL_REVIEW, {
      method: 'POST',
      headers,
      body: JSON.stringify(validRequest()),
    });
    const response = await handleRequest(request, deps);

    expect(response.status).toBe(403);
    expect(ReviewErrorSchema.parse(await response.json())).toEqual({
      error: 'forbidden_origin',
      retryAt: null,
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(model.calls).toHaveLength(0);
    expect(store.windows.size).toBe(0);
  });

  it('answers the development origin only when it is configured', async () => {
    const dev = 'http://localhost:3000';
    const withoutDev = createHarness(okModel());
    const refused = await handleRequest(
      reviewRequest(validRequest(), { Origin: dev }),
      withoutDev.deps,
    );
    expect(refused.status).toBe(403);

    const withDev = createHarness(okModel(), { devOrigin: dev });
    const accepted = await handleRequest(
      reviewRequest(validRequest(), { Origin: dev }),
      withDev.deps,
    );
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get('Access-Control-Allow-Origin')).toBe(dev);
    await accepted.text();
  });

  it('answers a preflight from an allowed origin', async () => {
    const { deps } = createHarness(okModel());
    const response = await handleRequest(
      new Request(URL_REVIEW, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN },
      }),
      deps,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET, POST, OPTIONS',
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type',
    );
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('refuses a preflight from another origin', async () => {
    const { deps } = createHarness(okModel());
    const response = await handleRequest(
      new Request(URL_REVIEW, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      }),
      deps,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('serves no other path, and only POST at /review', async () => {
    const { deps } = createHarness(okModel());
    const elsewhere = await handleRequest(
      new Request('https://protocol-review.networkcanvas.com/other', {
        method: 'POST',
        headers: { Origin: ORIGIN },
        body: '{}',
      }),
      deps,
    );
    expect(elsewhere.status).toBe(404);
    expect(elsewhere.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);

    const get = await handleRequest(
      new Request(URL_REVIEW, { headers: { Origin: ORIGIN } }),
      deps,
    );
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toBe('POST, OPTIONS');
  });
});

describe('request size and shape', () => {
  it('refuses a body over the limit with 413, even without Content-Length', async () => {
    const model = okModel();
    const { deps, store } = createHarness(model);
    const oversized = new TextEncoder().encode(
      'x'.repeat(REVIEW_LIMITS.maxRequestBytes + 1),
    );
    // A streamed body carries no Content-Length, so the bytes must be counted.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < oversized.length; offset += 65_536) {
          controller.enqueue(oversized.slice(offset, offset + 65_536));
        }
        controller.close();
      },
    });
    const request = new Request(URL_REVIEW, {
      method: 'POST',
      headers: { Origin: ORIGIN },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(request.headers.get('Content-Length')).toBeNull();

    const response = await handleRequest(request, deps);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: 'too_large',
      retryAt: null,
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(model.calls).toHaveLength(0);
    expect(store.windows.size).toBe(0);
  });

  it('refuses a body that declares a length over the limit', async () => {
    const { deps } = createHarness(okModel());
    const response = await handleRequest(
      reviewRequest(validRequest(), {
        'Content-Length': String(REVIEW_LIMITS.maxRequestBytes + 1),
      }),
      deps,
    );
    expect(response.status).toBe(413);
  });

  it('accepts a body exactly at the limit as far as size goes', async () => {
    const { deps } = createHarness(okModel());
    const request = validRequest();
    const base = JSON.stringify(request).length;
    const padded = {
      ...request,
      protocol: {
        ...request.protocol,
        description: 'y'.repeat(
          REVIEW_LIMITS.maxRequestBytes - base - ',"description":""'.length,
        ),
      },
    };
    expect(JSON.stringify(padded).length).toBe(REVIEW_LIMITS.maxRequestBytes);
    const response = await handleRequest(reviewRequest(padded), deps);
    expect(response.status).toBe(200);
    await response.text();
  });

  it.each([
    ['text that is not JSON', 'not json'],
    [
      'a missing installation id',
      { ...validRequest(), installationId: undefined },
    ],
    [
      'an installation id that is not a UUID',
      { ...validRequest(), installationId: 'abc' },
    ],
    ['an unknown key', { ...validRequest(), extra: true }],
    ['a protocol that is not an object', { ...validRequest(), protocol: [] }],
    [
      'blank research questions',
      {
        ...validRequest(),
        studyContext: { ...validRequest().studyContext, researchQuestions: [] },
      },
    ],
  ])('refuses %s with 400', async (_, body) => {
    const model = okModel();
    const { deps, store } = createHarness(model);
    const response = await handleRequest(reviewRequest(body), deps);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'invalid_request',
      retryAt: null,
    });
    expect(model.calls).toHaveLength(0);
    expect(store.windows.size).toBe(0);
  });
});

describe('the stream', () => {
  it('carries CORS headers and ends with a result', async () => {
    const { deps } = createHarness(okModel());
    const response = await handleRequest(reviewRequest(validRequest()), deps);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response.headers.get('Vary')).toBe('Origin');
    const events = await readEvents(response);
    expect(events.at(-1)?.type).toBe('result');
  });
});
