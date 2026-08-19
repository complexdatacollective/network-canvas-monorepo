import { createHash } from 'node:crypto';

import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import {
  type AssetStore,
  createAssetRoutes,
  createAssetStore,
  deliveryFor,
} from '../assets.ts';
import type { AuthService, SessionPrincipal } from '../auth/service.ts';
import { readEnv, type StudioEnv } from '../env.ts';

// Integration suite against a real S3-compatible endpoint — the dev MinIO
// from scripts/dev-s3.ts (or whatever S3_* points at). Skips when no object
// store is reachable, the same pattern as studio-sync's Postgres-backed
// suites: unit lanes stay green without Docker; run the server's dev script
// to exercise this for real.

const env = readEnv();

async function storeReachable(): Promise<boolean> {
  if (!env.s3) return false;
  const client = new S3Client({
    endpoint: env.s3.endpoint,
    region: env.s3.region,
    credentials: {
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
    },
    forcePathStyle: true,
  });
  try {
    await Promise.race([
      client.send(new ListBucketsCommand({})),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('probe timeout')), 3000),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

const reachable = await storeReachable();

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'user-1',
  email: 'researcher@example.com',
  emailVerified: true,
  name: 'Researcher',
  sessionId: 'session-1',
};

function signedInApp(override?: StudioEnv) {
  const auth: AuthService = {
    handler: () => Promise.resolve(Response.json({})),
    getSession: () => Promise.resolve(PRINCIPAL),
  };
  return createApp(override ?? readEnv(), { auth });
}

/** What the SPA's own upload looks like to the CSRF check. */
const spaUpload = (
  body?: RequestInit['body'],
  mediaType?: string,
): RequestInit => ({
  method: 'POST',
  body,
  headers: {
    'sec-fetch-site': 'same-origin',
    ...(mediaType ? { 'Content-Type': mediaType } : {}),
  },
});

// Both cases refuse before the store is consulted, so they need no MinIO.
describe('asset upload authorisation', () => {
  it('refuses an unauthenticated upload', async () => {
    const auth: AuthService = {
      handler: () => Promise.resolve(Response.json({})),
      getSession: () => Promise.resolve(null),
    };
    const app = createApp(readEnv(), { auth });
    const res = await app.request('/storage', spaUpload('bytes', 'text/plain'));
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('refuses a cross-origin upload before any session lookup', async () => {
    let lookups = 0;
    const auth: AuthService = {
      handler: () => Promise.resolve(Response.json({})),
      getSession: () => {
        lookups += 1;
        return Promise.resolve(PRINCIPAL);
      },
    };
    const app = createApp(readEnv(), { auth });
    const res = await app.request('/storage', {
      method: 'POST',
      body: 'bytes',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    expect(lookups).toBe(0);
  });
});

describe.skipIf(!reachable)('asset retrieval authorisation', () => {
  it('leaves retrieval public', async () => {
    // Assets are fetched from contexts that carry no cookie, and the content
    // address is the capability. A GET must not consult the session at all.
    let lookups = 0;
    const auth: AuthService = {
      handler: () => Promise.resolve(Response.json({})),
      getSession: () => {
        lookups += 1;
        return Promise.resolve(null);
      },
    };
    const app = createApp(readEnv(), { auth });
    const res = await app.request(`/storage/${'a'.repeat(64)}`);
    expect(res.status).toBe(404);
    expect(lookups).toBe(0);
  });
});

describe.skipIf(!reachable)('asset storage', () => {
  const bytes = new TextEncoder().encode(
    `studio asset round-trip ${Math.trunc(Date.now() / 86_400_000)}`,
  );
  const expectedHash = createHash('sha256').update(bytes).digest('hex');

  it('stores bytes content-addressed and returns the hash', async () => {
    const app = signedInApp();
    const res = await app.request('/storage', spaUpload(bytes, 'text/plain'));
    expect(res.status).toBe(201);
    const stored = (await res.json()) as {
      hash: string;
      size: number;
      mediaType: string;
    };
    expect(stored.hash).toBe(expectedHash);
    expect(stored.size).toBe(bytes.byteLength);
    expect(stored.mediaType).toBe('text/plain');
  });

  it('retrieves stored bytes with immutable cache headers', async () => {
    const app = signedInApp();
    await app.request('/storage', spaUpload(bytes, 'text/plain'));
    const res = await app.request(`/storage/${expectedHash}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(res.headers.get('ETag')).toBe(`"${expectedHash}"`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('404s as problem JSON for an absent asset', async () => {
    const app = signedInApp();
    const missing = 'a'.repeat(64);
    const res = await app.request(`/storage/${missing}`);
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('404s for a malformed hash without touching the store', async () => {
    const app = signedInApp();
    const res = await app.request('/storage/not-a-hash');
    expect(res.status).toBe(404);
  });

  it('rejects an empty upload', async () => {
    const app = signedInApp();
    const res = await app.request('/storage', spaUpload());
    expect(res.status).toBe(400);
  });

  it("preserves the first write's media type for an existing hash", async () => {
    const app = signedInApp();
    const payload = new TextEncoder().encode(
      `mime immutability ${expectedHash}`,
    );
    const first = await app.request(
      '/storage',
      spaUpload(payload, 'text/plain'),
    );
    const stored = (await first.json()) as { hash: string; mediaType: string };
    expect(stored.mediaType).toBe('text/plain');

    // Identical bytes, different declared type: the stored representation is
    // immutable, so the response reports the canonical (first) metadata and
    // the object keeps it.
    const second = await app.request(
      '/storage',
      spaUpload(payload, 'application/json'),
    );
    const again = (await second.json()) as { hash: string; mediaType: string };
    expect(again.hash).toBe(stored.hash);
    expect(again.mediaType).toBe('text/plain');
  });

  it('enforces the upload cap while streaming, before buffering the body', async () => {
    if (!env.s3) return;
    const routes = createAssetRoutes(createAssetStore(env.s3), {
      maxUploadBytes: 8,
    });
    const res = await routes.request('/', {
      method: 'POST',
      body: 'nine bytes',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.status).toBe(413);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });
});

// The delivery policy is origin security, not storage: it runs against an
// in-memory store so it is exercised on every unit run, with or without an
// object store.
function memoryStore(): AssetStore {
  const objects = new Map<string, { bytes: Uint8Array; mediaType: string }>();
  return {
    async put(bytes, mediaType) {
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (!objects.has(hash)) objects.set(hash, { bytes, mediaType });
      const stored = objects.get(hash)!;
      return {
        hash,
        size: stored.bytes.byteLength,
        mediaType: stored.mediaType,
      };
    },
    async get(hash) {
      const stored = objects.get(hash);
      if (!stored) return null;
      return {
        body: new Response(stored.bytes).body!,
        mediaType: stored.mediaType,
        size: stored.bytes.byteLength,
      };
    },
  };
}

describe('asset delivery policy', () => {
  const routes = createAssetRoutes(memoryStore());

  async function upload(body: string, mediaType: string): Promise<string> {
    const res = await routes.request('/', {
      method: 'POST',
      body: bytesOf(body),
      headers: { 'Content-Type': mediaType },
    });
    return ((await res.json()) as { hash: string }).hash;
  }

  it.each([
    ['text/html', '<script>alert(document.domain)</script>'],
    [
      'image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
    ],
    ['application/xhtml+xml', '<html><body>x</body></html>'],
    ['text/plain; charset=utf-8', 'plain'],
  ])('serves %s as an opaque download', async (mediaType, body) => {
    const hash = await upload(body, mediaType);
    const res = await routes.request(`/${hash}`);
    // Uploads are untrusted and this is the app's own origin: nothing a
    // browser could execute as a document may be served with a type that
    // invites it to.
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toBe('attachment');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; sandbox",
    );
    expect(await res.text()).toBe(body);
  });

  it('serves recognised media inline with its own type', async () => {
    const hash = await upload('not really a png', 'image/png');
    const res = await routes.request(`/${hash}`);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Content-Disposition')).toBe('inline');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('classifies a parameterised media type by its essence', () => {
    expect(deliveryFor('image/png; charset=binary')).toEqual({
      contentType: 'image/png',
      disposition: 'inline',
    });
    expect(deliveryFor('IMAGE/PNG')).toEqual({
      contentType: 'image/png',
      disposition: 'inline',
    });
    expect(deliveryFor('text/html;charset=utf-8').disposition).toBe(
      'attachment',
    );
  });
});

describe('asset storage when unconfigured', () => {
  it('refuses with 503 problem JSON', async () => {
    const app = signedInApp({ ...env, s3: undefined });
    const res = await app.request(
      '/storage',
      spaUpload(bytesOf('x'), 'text/plain'),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });
});

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
