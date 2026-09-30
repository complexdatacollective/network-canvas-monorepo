import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { rawRequest } from '../../__tests__/support/raw-http.ts';
import { startStudioServer } from '../../__tests__/support/serve.ts';
import { createStudio } from '../../app.ts';
import { readEnv } from '../../env.ts';

// `/api/v1` over a real socket, with every path sent exactly as written: how
// an unusual path matches is decided by the router, and `fetch` would
// normalise the path before the router ever saw it. What each of these is
// charged is in src/__tests__/rate-limit-routes.test.ts.

let server: Awaited<ReturnType<typeof startStudioServer>>;

beforeAll(async () => {
  const env = readEnv();
  server = await startStudioServer(env, createStudio(env));
});

afterAll(() => server.dispose());

const get = (path: string, headers?: Record<string, string>) =>
  rawRequest(server.origin, path, { headers });

describe('which paths are /api/v1/status', () => {
  // The router's defaults (maintainer's ruling on #1999, I1): matching is
  // case-insensitive, repeated slashes collapse, a trailing slash and a `;`
  // suffix are ignored, and percent-encoded letters are decoded. These are
  // aliases of the real routes, not misses.
  it.each([
    '/api/v1/status',
    '/api/v1//status',
    '//api/v1/status',
    '/api//v1/status',
    '/API/v1/status',
    '/api/V1/status',
    '/api/%76%31/status',
    '/api/v1/status;x',
    '/api/v1/status/',
  ])('answers %s as the status document', async (path) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body.toString())).toStrictEqual({
      name: expect.any(String),
      version: expect.any(String),
    });
  });

  it.each(['/api/v1/DOCS', '/api/v1/docs/'])(
    'answers %s as the reference page',
    async (path) => {
      expect((await get(path)).status).toBe(200);
    },
  );

  it('answers /api/v1/openapi.json/ as the document', async () => {
    expect((await get('/api/v1/openapi.json/')).status).toBe(200);
  });

  it.each(['/api/v1/./status', '/api/v1/../v1/status'])(
    'does not resolve dot segments: %s is no route',
    async (path) => {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
    },
  );
});

describe('methods under /api/v1', () => {
  it.each(['HEAD', 'OPTIONS', 'PROPFIND', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses %s /api/v1/status as a problem-JSON 404',
    async (method) => {
      const response = await rawRequest(server.origin, '/api/v1/status', {
        method,
      });
      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
    },
  );
});

describe('the reference page', () => {
  it('names no third-party URL a browser would fetch to render it', async () => {
    const page = (await get('/api/v1/docs')).body.toString();
    expect(page).toContain('Scalar.createApiReference');
    expect(page).toContain('"withDefaultFonts":false');
    expect(page).not.toContain('<script src=');
    expect(page).not.toContain('<link');
  });

  it('is cacheable and carries an ETag', async () => {
    const response = await get('/api/v1/docs');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
    expect(response.headers.etag).toMatch(/^W\/"[\w-]+"$/);
    expect((await get('/api/v1/docs')).headers.etag).toBe(
      response.headers.etag,
    );
  });

  it('answers a revalidation with its ETag as 304 and no body', async () => {
    const { headers } = await get('/api/v1/docs');
    const etag = String(headers.etag);
    const revalidated = await get('/api/v1/docs', { 'if-none-match': etag });
    expect(revalidated.status).toBe(304);
    expect(revalidated.body.length).toBe(0);
    expect(revalidated.headers.etag).toBe(etag);
    expect(revalidated.headers['cache-control']).toBe('public, max-age=3600');

    const stale = await get('/api/v1/docs', { 'if-none-match': 'W/"stale"' });
    expect(stale.status).toBe(200);
  });

  it.each([
    ['br', brotliDecompressSync],
    ['gzip', gunzipSync],
  ] as const)(
    'is sent %s-compressed to a client that accepts it',
    async (encoding, decompress) => {
      const plain = await get('/api/v1/docs');
      const compressed = await get('/api/v1/docs', {
        'accept-encoding': encoding,
      });
      expect(compressed.headers['content-encoding']).toBe(encoding);
      expect(compressed.headers.vary).toContain('Accept-Encoding');
      expect(compressed.body.length).toBeLessThan(plain.body.length / 3);
      expect(decompress(compressed.body).equals(plain.body)).toBe(true);
    },
  );
});
