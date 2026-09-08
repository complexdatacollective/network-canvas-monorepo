import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import { expect, it } from 'vitest';

import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

import { createRegistryBlobStore } from './blob-store.ts';

async function peer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('REGISTRY_TEST_S3_ADDRESS_MISSING');
  const endpoint = `http://127.0.0.1:${address.port}`;
  const blobs = createRegistryBlobStore({
    endpoint,
    region: 'us-east-1',
    bucket: 'private-registry',
    accessKeyId: 'synthetic-registry-access',
    secretAccessKey: 'synthetic-registry-secret',
  });
  return {
    blobs,
    async close() {
      blobs.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const xmlError = (response: ServerResponse, status: number, code: string) => {
  response.writeHead(status, { 'Content-Type': 'application/xml' });
  response.end(
    `<Error><Code>${code}</Code><Message>private-provider-error-canary</Message></Error>`,
  );
};

it('uses authenticated private requests, conditional content-addressed uploads, and verified downloads', async () => {
  const bytes = new TextEncoder().encode('A synthetic artifact body');
  const rawHash = templateBytesHash(bytes);
  const requests: {
    method: string | undefined;
    path: string;
    signed: boolean;
    condition: string | undefined;
    type: string | undefined;
  }[] = [];
  const received: Buffer[] = [];
  const fixture = await peer((request, response) => {
    requests.push({
      method: request.method,
      path: new URL(request.url ?? '/', 'http://s3.test').pathname,
      signed:
        request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ') === true,
      condition: request.headers['if-none-match'],
      type: request.headers['content-type'],
    });
    if (request.method === 'PUT') {
      request.on('data', (chunk: unknown) => {
        if (!Buffer.isBuffer(chunk))
          throw new Error('REGISTRY_TEST_BODY_INVALID');
        received.push(chunk);
      });
      request.on('end', () => response.end());
    } else if (request.method === 'GET') response.end(bytes);
    else response.end();
  });
  try {
    await fixture.blobs.ready();
    await fixture.blobs.put(rawHash, bytes);
    expect(await fixture.blobs.get(rawHash)).toEqual(bytes);
    await fixture.blobs.delete(rawHash);
    expect(Buffer.concat(received)).toEqual(Buffer.from(bytes));
    expect(requests).toHaveLength(4);
    expect(
      requests.map(({ method, path, signed }) => ({ method, path, signed })),
    ).toEqual([
      { method: 'HEAD', path: '/private-registry/', signed: true },
      ...['PUT', 'GET', 'DELETE'].map((method) => ({
        method,
        path: `/private-registry/template-artifacts/${rawHash}`,
        signed: true,
      })),
    ]);
    expect(requests[1]).toMatchObject({
      condition: '*',
      type: 'application/octet-stream',
    });
    await expect(
      fixture.blobs.put(rawHash, new Uint8Array([1])),
    ).rejects.toMatchObject({ code: 'ARTIFACT_INVALID' });
    await expect(fixture.blobs.get('../escape')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(requests).toHaveLength(4);
  } finally {
    await fixture.close();
  }
});

it('deduplicates only after reading and verifying the existing immutable bytes', async () => {
  const bytes = new TextEncoder().encode('Already stored immutable artifact');
  const rawHash = templateBytesHash(bytes);
  let corrupt = false;
  const methods: string[] = [];
  const fixture = await peer((request, response) => {
    methods.push(request.method ?? '');
    request.resume();
    if (request.method === 'PUT') xmlError(response, 412, 'PreconditionFailed');
    else response.end(corrupt ? new Uint8Array(bytes.byteLength) : bytes);
  });
  try {
    await fixture.blobs.put(rawHash, bytes);
    expect(methods).toEqual(['PUT', 'GET']);
    corrupt = true;
    await expect(fixture.blobs.put(rawHash, bytes)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(methods).toEqual(['PUT', 'GET', 'PUT', 'GET']);
  } finally {
    await fixture.close();
  }
});

it('distinguishes absent content from inaccessible or corrupt provider responses without disclosing diagnostics', async () => {
  const hash = 'a'.repeat(64);
  let mode: 'absent' | 'forbidden' | 'corrupt' = 'absent';
  const fixture = await peer((_request, response) => {
    if (mode === 'absent') xmlError(response, 404, 'NoSuchKey');
    else if (mode === 'forbidden') xmlError(response, 403, 'AccessDenied');
    else response.end('wrong bytes');
  });
  try {
    expect(await fixture.blobs.get(hash)).toBeNull();
    for (const next of ['forbidden', 'corrupt'] as const) {
      mode = next;
      const error: unknown = await fixture.blobs
        .get(hash)
        .catch((value: unknown) => value);
      expect(error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(String(error)).not.toContain('private-provider-error-canary');
      expect(error).not.toHaveProperty('cause');
    }
  } finally {
    await fixture.close();
  }
});

it('bounds each orphan inventory page, rejects missing continuation tokens, and skips unrelated keys', async () => {
  const hash = 'c'.repeat(64);
  const queries: URLSearchParams[] = [];
  let includeToken = true;
  const fixture = await peer((request, response) => {
    queries.push(new URL(request.url ?? '/', 'http://s3.test').searchParams);
    response.setHeader('Content-Type', 'application/xml');
    response.end(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
      <IsTruncated>true</IsTruncated>${includeToken ? '<NextContinuationToken>next-page</NextContinuationToken>' : ''}
      <Contents><Key>template-artifacts/${hash}</Key><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>
      <Contents><Key>another-prefix/${hash}</Key><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>
      <Contents><Key>template-artifacts/invalid</Key><LastModified>2026-01-01T00:00:00Z</LastModified></Contents>
      <Contents><Key>template-artifacts/${'d'.repeat(64)}</Key></Contents>
    </ListBucketResult>`);
  });
  try {
    expect(await fixture.blobs.scan('previous-page')).toEqual({
      objects: [
        { rawHash: hash, modifiedAt: new Date('2026-01-01T00:00:00Z') },
      ],
      nextCursor: 'next-page',
    });
    expect(queries[0]?.get('prefix')).toBe('template-artifacts/');
    expect(queries[0]?.get('max-keys')).toBe('25');
    expect(queries[0]?.get('continuation-token')).toBe('previous-page');
    includeToken = false;
    await expect(fixture.blobs.scan('previous-page')).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  } finally {
    await fixture.close();
  }
});
