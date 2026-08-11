import { createHash } from 'node:crypto';

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Hono } from 'hono';

import type { S3Env } from './env.ts';

// Asset storage (#1246/#1278, 2026-08-11): content-addressed bytes in
// S3-compatible object storage — R2 managed, MinIO self-hosted/dev. Objects
// are keyed by content hash, so retrieval is immutable-cacheable by
// construction. Asset bytes ride these plain HTTP routes rather than the RPC
// surface: files don't belong in RPC payloads, and retrieval must be
// streamable and cacheable. The key prefix gains a workspace scope when
// multi-tenancy lands (#1249) — cross-workspace dedup is deliberately not a
// goal (confidentiality boundary).

const KEY_PREFIX = 'assets/';
const SHA256_HEX = /^[0-9a-f]{64}$/;
// Walking-skeleton bound; revisit with real stimuli sizes and the presigned
// direct-upload question on #1278.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export type StoredAsset = {
  hash: string;
  size: number;
  mediaType: string;
};

export type AssetStore = {
  put(bytes: Uint8Array, mediaType: string): Promise<StoredAsset>;
  get(hash: string): Promise<{
    body: ReadableStream;
    mediaType: string;
    size: number | undefined;
  } | null>;
};

export function createAssetStore(env: S3Env): AssetStore {
  const client = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    forcePathStyle: true,
  });

  return {
    async put(bytes, mediaType) {
      const hash = createHash('sha256').update(bytes).digest('hex');
      await client.send(
        new PutObjectCommand({
          Bucket: env.bucket,
          Key: `${KEY_PREFIX}${hash}`,
          Body: bytes,
          ContentType: mediaType,
          ContentLength: bytes.byteLength,
        }),
      );
      return { hash, size: bytes.byteLength, mediaType };
    },

    async get(hash) {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: env.bucket,
            Key: `${KEY_PREFIX}${hash}`,
          }),
        );
        if (response.Body === undefined) return null;
        return {
          body: response.Body.transformToWebStream(),
          mediaType: response.ContentType ?? 'application/octet-stream',
          size: response.ContentLength,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'NoSuchKey' || error.name === 'NotFound')
        ) {
          return null;
        }
        throw error;
      }
    },
  };
}

function problem(status: number, title: string) {
  return { title, status };
}

const PROBLEM_HEADERS = { 'Content-Type': 'application/problem+json' };

export function createAssetRoutes(store: AssetStore | undefined) {
  const routes = new Hono();

  routes.post('/', async (c) => {
    if (!store) {
      return c.json(
        problem(503, 'Asset storage not configured'),
        503,
        PROBLEM_HEADERS,
      );
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0) {
      return c.json(problem(400, 'Empty body'), 400, PROBLEM_HEADERS);
    }
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return c.json(problem(413, 'Content Too Large'), 413, PROBLEM_HEADERS);
    }
    const mediaType =
      c.req.header('Content-Type') ?? 'application/octet-stream';
    const stored = await store.put(bytes, mediaType);
    return c.json(stored, 201);
  });

  routes.get('/:hash', async (c) => {
    const hash = c.req.param('hash');
    if (!store) {
      return c.json(
        problem(503, 'Asset storage not configured'),
        503,
        PROBLEM_HEADERS,
      );
    }
    if (!SHA256_HEX.test(hash)) {
      return c.json(problem(404, 'Not Found'), 404, PROBLEM_HEADERS);
    }
    const asset = await store.get(hash);
    if (asset === null) {
      return c.json(problem(404, 'Not Found'), 404, PROBLEM_HEADERS);
    }
    c.header('Content-Type', asset.mediaType);
    // A content hash never changes its bytes: immutable by construction.
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    c.header('ETag', `"${hash}"`);
    if (asset.size !== undefined) {
      c.header('Content-Length', String(asset.size));
    }
    return c.body(asset.body);
  });

  return routes;
}
