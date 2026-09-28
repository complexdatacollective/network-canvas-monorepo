import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';

import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { Effect, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import { createStudio } from '../app.ts';
import { MAX_UPLOAD_BYTES } from '../assets.ts';
import type { AuthService, SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { deliveryFor } from '../http/storage.ts';
import { ObjectStore } from '../storage/object-store.ts';
import { authServiceStub } from './support/auth.ts';
import { composeStudio, startStudioServer } from './support/serve.ts';

// `/storage` through the composed Effect router: the gates in front of it, the
// cap on what an upload may send, and the delivery policy on the way out. The
// round-trip half runs against a real S3-compatible endpoint — the Garage the
// development stack runs, or whatever S3_* points at — and skips when none is
// reachable, the same pattern as the Postgres-backed suites: unit lanes stay
// green without Docker. Everything else runs against an in-memory store, so it
// is exercised on every run.

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
  locale: null,
  sessionId: 'session-1',
};

/** An object store in memory: content-addressed, first write wins. */
function memoryStore(): ObjectStore['Service'] {
  const objects = new Map<
    string,
    { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
  >();
  return ObjectStore.of({
    configured: true,
    put: (bytes, mediaType) =>
      Effect.sync(() => {
        const hash = createHash('sha256').update(bytes).digest('hex');
        const stored = objects.get(hash) ?? {
          bytes: new Uint8Array(bytes),
          mediaType,
        };
        objects.set(hash, stored);
        return {
          hash,
          size: stored.bytes.byteLength,
          mediaType: stored.mediaType,
        };
      }),
    get: (hash) =>
      Effect.sync(() =>
        Option.map(Option.fromUndefinedOr(objects.get(hash)), (stored) => ({
          body: new Blob([stored.bytes]).stream(),
          mediaType: stored.mediaType,
          size: stored.bytes.byteLength,
        })),
      ),
    head: Effect.void,
  });
}

/** Counts the session lookups a request made, and answers them. */
function countingAuth(signedIn: boolean): {
  readonly auth: AuthService['Service'];
  readonly lookups: () => number;
} {
  let lookups = 0;
  return {
    auth: authServiceStub({
      getSession: () =>
        Effect.sync(() => {
          lookups += 1;
          return signedIn ? Option.some(PRINCIPAL) : Option.none();
        }),
    }),
    lookups: () => lookups,
  };
}

/** One request through the composed stack, disposed either way. */
async function send(
  path: string,
  init: RequestInit,
  options: {
    readonly auth?: AuthService['Service'];
    readonly objectStore?: ObjectStore['Service'];
  } = {},
): Promise<Response> {
  const stack = composeStudio(
    env,
    createStudio(env, {
      auth: options.auth ?? countingAuth(true).auth,
      ...(options.objectStore === undefined
        ? {}
        : { objectStore: options.objectStore }),
    }),
  );
  try {
    const response = await stack.request(path, init);
    // Read before the stack goes: a streamed body is the stack's to produce.
    const body = new Uint8Array(await response.arrayBuffer());
    return new Response(response.status === 204 ? null : body, response);
  } finally {
    await stack.dispose();
  }
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

function bytesOf(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

describe('asset upload authorisation', () => {
  it('refuses an unauthenticated upload', async () => {
    const res = await send('/storage', spaUpload('bytes', 'text/plain'), {
      auth: countingAuth(false).auth,
      objectStore: memoryStore(),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('refuses a cross-origin upload before any session lookup', async () => {
    const { auth, lookups } = countingAuth(true);
    const res = await send(
      '/storage',
      {
        method: 'POST',
        body: 'bytes',
        headers: { origin: 'https://evil.example' },
      },
      { auth, objectStore: memoryStore() },
    );
    expect(res.status).toBe(403);
    expect(lookups()).toBe(0);
  });

  it('gates an unsafe method on a path that names nothing, too', async () => {
    const res = await send(
      '/storage/anything',
      { method: 'DELETE' },
      {
        auth: countingAuth(false).auth,
        objectStore: memoryStore(),
      },
    );
    // No origin evidence at all: refused before the 404 it would have been.
    expect(res.status).toBe(403);
  });
});

describe('asset retrieval authorisation', () => {
  it('leaves retrieval public', async () => {
    // Assets are fetched from contexts that carry no cookie, and the content
    // address is the capability. A GET must not consult the session at all.
    // Mutation: put the principal gate on the read → `lookups` is 1.
    const { auth, lookups } = countingAuth(false);
    const store = memoryStore();
    const { hash } = await Effect.runPromise(
      store.put(bytesOf('public bytes'), 'image/png'),
    );
    const res = await send(
      `/storage/${hash}`,
      {},
      { auth, objectStore: store },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('public bytes');
    expect(lookups()).toBe(0);
  });
});

describe('the upload cap', () => {
  it('abandons a body with no length the moment it crosses the cap', async () => {
    // A body that never ends, so the only way this request can be answered
    // is by the route stopping its read at the cap. Buffering it first and
    // measuring after would never finish.
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const init: RequestInit & { duplex: 'half' } = {
      ...spaUpload(endless, 'application/octet-stream'),
      duplex: 'half',
    };
    const res = await send('/storage', init, { objectStore: memoryStore() });
    expect(res.status).toBe(413);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
    // Read to just past the cap, not beyond it: a stream reader may have one
    // chunk in hand ahead of the one it was asked for.
    expect(sent).toBeGreaterThan(MAX_UPLOAD_BYTES);
    expect(sent).toBeLessThanOrEqual(MAX_UPLOAD_BYTES + 3 * chunk.byteLength);
  });

  it('refuses a declared length over the cap before reading a byte', async () => {
    // Over a real socket, because the declared length is the request's own
    // header there: the upload below announces more than the cap and sends
    // nothing, so an answer can only come from the header.
    const server = await startStudioServer(
      env,
      createStudio(env, {
        auth: countingAuth(true).auth,
        objectStore: memoryStore(),
      }),
    );
    try {
      const status = await new Promise<number | undefined>((settle, reject) => {
        const url = new URL('/storage', server.origin);
        const request = httpRequest(url, {
          method: 'POST',
          headers: {
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/octet-stream',
            'content-length': String(MAX_UPLOAD_BYTES + 1),
          },
        });
        request.on('response', (response) => {
          settle(response.statusCode);
          response.resume();
          request.destroy();
        });
        request.on('error', reject);
        request.flushHeaders();
      });
      expect(status).toBe(413);
    } finally {
      await server.dispose();
    }
  });
});

describe('asset delivery policy', () => {
  const store = memoryStore();

  async function upload(body: string, mediaType: string): Promise<string> {
    const res = await send('/storage', spaUpload(bytesOf(body), mediaType), {
      objectStore: store,
    });
    expect(res.status).toBe(201);
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
    const res = await send(`/storage/${hash}`, {}, { objectStore: store });
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
    const res = await send(`/storage/${hash}`, {}, { objectStore: store });
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
    // No object store given: the deployment names no bucket.
    const res = await send('/storage', spaUpload(bytesOf('x'), 'text/plain'));
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });
});

describe.skipIf(!reachable)('asset storage', () => {
  const objectStore = env.s3 ? ObjectStore.make(env.s3) : undefined;
  const through = objectStore ? { objectStore } : {};
  const bytes = bytesOf(
    `studio asset round-trip ${Math.trunc(Date.now() / 86_400_000)}`,
  );
  const expectedHash = createHash('sha256').update(bytes).digest('hex');

  it('stores bytes content-addressed and returns the hash', async () => {
    const res = await send('/storage', spaUpload(bytes, 'text/plain'), through);
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
    await send('/storage', spaUpload(bytes, 'text/plain'), through);
    const res = await send(`/storage/${expectedHash}`, {}, through);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(res.headers.get('ETag')).toBe(`"${expectedHash}"`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('streams stored bytes over a real socket', async () => {
    // The Node listener writes a response body differently from the
    // in-process handler, and a web stream is exactly what it cannot pipe.
    await send('/storage', spaUpload(bytes, 'text/plain'), through);
    const server = await startStudioServer(
      env,
      createStudio(env, { auth: countingAuth(false).auth, ...through }),
    );
    try {
      const res = await fetch(`${server.origin}/storage/${expectedHash}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Length')).toBe(String(bytes.byteLength));
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    } finally {
      await server.dispose();
    }
  });

  it('404s as problem JSON for an absent asset', async () => {
    const res = await send(`/storage/${'a'.repeat(64)}`, {}, through);
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });

  it('404s for a malformed hash without touching the store', async () => {
    const res = await send('/storage/not-a-hash', {}, through);
    expect(res.status).toBe(404);
  });

  it('rejects an empty upload', async () => {
    const res = await send('/storage', spaUpload(), through);
    expect(res.status).toBe(400);
  });

  it("preserves the first write's media type for an existing hash", async () => {
    const payload = bytesOf(`mime immutability ${expectedHash}`);
    const first = await send(
      '/storage',
      spaUpload(payload, 'text/plain'),
      through,
    );
    const stored = (await first.json()) as { hash: string; mediaType: string };
    expect(stored.mediaType).toBe('text/plain');

    // Identical bytes, different declared type: the stored representation is
    // immutable, so the response reports the canonical (first) metadata and
    // the object keeps it.
    const second = await send(
      '/storage',
      spaUpload(payload, 'application/json'),
      through,
    );
    const again = (await second.json()) as { hash: string; mediaType: string };
    expect(again.hash).toBe(stored.hash);
    expect(again.mediaType).toBe('text/plain');
  });
});
