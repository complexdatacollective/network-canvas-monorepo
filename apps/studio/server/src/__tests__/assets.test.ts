import { createHash } from 'node:crypto';

import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import { createAssetRoutes, createAssetStore } from '../assets.ts';
import { readEnv } from '../env.ts';

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

describe.skipIf(!reachable)('asset storage', () => {
  const bytes = new TextEncoder().encode(
    `studio asset round-trip ${Math.trunc(Date.now() / 86_400_000)}`,
  );
  const expectedHash = createHash('sha256').update(bytes).digest('hex');

  it('stores bytes content-addressed and returns the hash', async () => {
    const app = createApp();
    const res = await app.request('/storage', {
      method: 'POST',
      body: bytes,
      headers: { 'Content-Type': 'text/plain' },
    });
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
    const app = createApp();
    await app.request('/storage', {
      method: 'POST',
      body: bytes,
      headers: { 'Content-Type': 'text/plain' },
    });
    const res = await app.request(`/storage/${expectedHash}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(res.headers.get('ETag')).toBe(`"${expectedHash}"`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('404s as problem JSON for an absent asset', async () => {
    const app = createApp();
    const missing = 'a'.repeat(64);
    const res = await app.request(`/storage/${missing}`);
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('404s for a malformed hash without touching the store', async () => {
    const app = createApp();
    const res = await app.request('/storage/not-a-hash');
    expect(res.status).toBe(404);
  });

  it('rejects an empty upload', async () => {
    const app = createApp();
    const res = await app.request('/storage', { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it("preserves the first write's media type for an existing hash", async () => {
    const app = createApp();
    const payload = new TextEncoder().encode(
      `mime immutability ${expectedHash}`,
    );
    const first = await app.request('/storage', {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'text/plain' },
    });
    const stored = (await first.json()) as { hash: string; mediaType: string };
    expect(stored.mediaType).toBe('text/plain');

    // Identical bytes, different declared type: the stored representation is
    // immutable, so the response reports the canonical (first) metadata and
    // the object keeps it.
    const second = await app.request('/storage', {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' },
    });
    const again = (await second.json()) as { hash: string; mediaType: string };
    expect(again.hash).toBe(stored.hash);
    expect(again.mediaType).toBe('text/plain');

    const got = await app.request(`/storage/${stored.hash}`);
    expect(got.headers.get('Content-Type')).toContain('text/plain');
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

describe('asset storage when unconfigured', () => {
  it('refuses with 503 problem JSON', async () => {
    const app = createApp({ ...env, s3: undefined });
    const res = await app.request('/storage', {
      method: 'POST',
      body: bytesOf('x'),
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });
});

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
