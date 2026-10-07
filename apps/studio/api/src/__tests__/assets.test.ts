import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';

import { Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES } from '@codaco/studio-contract/limits';

import { createStudio } from '../app.ts';
import type { AuthService, SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { deliveryFor } from '../http/storage.ts';
import { objectStoreFor } from '../storage/live.ts';
import { fromBackend, type ObjectStore } from '../storage/object-store.ts';
import { authServiceStub } from './support/auth.ts';
import { composeStudio, startStudioServer } from './support/serve.ts';

const env = readEnv();

const liveStore =
  env.objectStore === undefined ? undefined : objectStoreFor(env.objectStore);

async function storeReachable(): Promise<boolean> {
  if (liveStore === undefined) return false;
  const exit = await Effect.runPromiseExit(
    Effect.timeout(liveStore.head, '3 seconds'),
  );
  return Exit.isSuccess(exit);
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

class MissingObject extends Error {}

// In memory, through `fromBackend`, so these cases run the port's own range
// and existence logic rather than a copy of it.
function memoryStore(): ObjectStore['Service'] {
  const objects = new Map<
    string,
    { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
  >();
  const found = (key: string) => {
    const stored = objects.get(key);
    return stored === undefined
      ? Promise.reject(new MissingObject(key))
      : Promise.resolve(stored);
  };
  return fromBackend({
    stat: (key) =>
      found(key).then((stored) => ({
        size: stored.bytes.byteLength,
        mediaType: stored.mediaType,
      })),
    write: (key, bytes, mediaType) => {
      objects.set(key, { bytes: new Uint8Array(bytes), mediaType });
      return Promise.resolve();
    },
    read: (key, _signal, range) =>
      found(key).then((stored) => {
        const bytes =
          range === undefined
            ? stored.bytes
            : stored.bytes.slice(range.start, range.end + 1);
        return {
          body: new Blob([bytes]).stream(),
          size: bytes.byteLength,
          mediaType: stored.mediaType,
        };
      }),
    probe: () => Promise.resolve(),
    isNotFound: (error) => error instanceof MissingObject,
  });
}

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
    const body = new Uint8Array(await response.arrayBuffer());
    return new Response(response.status === 204 ? null : body, response);
  } finally {
    await stack.dispose();
  }
}

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
    expect(res.status).toBe(403);
  });
});

describe('asset retrieval authorisation', () => {
  it('leaves retrieval public', async () => {
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

  // Every audio, video and raster image type protocol-builder's
  // `EXTENSION_CONTENT_TYPES` gives an accepted stimulus: an interview puts the
  // storage URL straight into an <img>, <audio> or <video>. SVG stays an
  // opaque download (above); the interview renders it from the bytes.
  it.each([
    'audio/aiff',
    'audio/mp4',
    'audio/mpeg',
    'image/gif',
    'image/jpeg',
    'image/png',
    'video/mp4',
    'video/quicktime',
  ])('serves %s, a stimulus Studio accepts, inline as itself', (type) => {
    expect(deliveryFor(type)).toEqual({
      contentType: type,
      disposition: 'inline',
    });
  });

  it.each([
    ['audio/x-m4a', 'audio/mp4'],
    ['audio/m4a', 'audio/mp4'],
    ['audio/x-aiff', 'audio/aiff'],
    ['audio/mp3', 'audio/mpeg'],
    ['audio/x-mpeg-3', 'audio/mpeg'],
    ['image/pjpeg', 'image/jpeg'],
    ['image/jpg', 'image/jpeg'],
    ['image/x-png', 'image/png'],
  ])(
    'serves a stimulus a browser reported as %s inline as %s',
    (reported, canonical) => {
      expect(deliveryFor(`${reported}; charset=binary`)).toEqual({
        contentType: canonical,
        disposition: 'inline',
      });
    },
  );

  it.each([
    ['video/x-quicktime', 'video/quicktime'],
    ['video/mov', 'video/quicktime'],
    // Unnamed, but audio, video or raster: served as reported.
    ['video/x-msvideo', 'video/x-msvideo'],
    ['audio/x-caf', 'audio/x-caf'],
    ['image/heic', 'image/heic'],
  ])('serves %s inline as %s', (reported, served) => {
    expect(deliveryFor(reported)).toEqual({
      contentType: served,
      disposition: 'inline',
    });
  });

  it.each(['image/svg+xml', 'image/svg', 'image/x-svg', 'image/foo+xml'])(
    'serves %s, an image that can carry script, as an opaque download',
    (mediaType) => {
      expect(deliveryFor(mediaType).disposition).toBe('attachment');
    },
  );

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

describe('asset ranges, which iOS needs to play audio and video', () => {
  const store = memoryStore();
  const BODY = 'abcdefghij';

  const stored = async (): Promise<string> => {
    const res = await send('/storage', spaUpload(bytesOf(BODY), 'video/mp4'), {
      objectStore: store,
    });
    return ((await res.json()) as { hash: string }).hash;
  };

  const ranged = async (range: string) =>
    send(
      `/storage/${await stored()}`,
      { headers: { range } },
      { objectStore: store },
    );

  it.each([
    ['bytes=2-5', 'cdef', 'bytes 2-5/10'],
    ['bytes=7-', 'hij', 'bytes 7-9/10'],
    ['bytes=8-100', 'ij', 'bytes 8-9/10'],
    ['bytes=0-1', 'ab', 'bytes 0-1/10'],
  ])('answers %s with those bytes alone', async (range, body, contentRange) => {
    const res = await ranged(range);
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe(contentRange);
    expect(res.headers.get('Content-Length')).toBe(String(body.length));
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(await res.text()).toBe(body);
  });

  it('refuses a range that starts past the last byte, naming the size', async () => {
    const res = await ranged('bytes=10-');
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */10');
  });

  it.each(['bytes=-3', 'bytes=0-1,4-5', 'items=0-1', 'bytes=5-2'])(
    'answers %s with the whole object',
    async (range) => {
      const res = await ranged(range);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(BODY);
    },
  );

  it('says it accepts ranges on a whole answer', async () => {
    const res = await send(
      `/storage/${await stored()}`,
      {},
      { objectStore: store },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });
});

describe('asset storage when unconfigured', () => {
  it('refuses with 503 problem JSON', async () => {
    const res = await send('/storage', spaUpload(bytesOf('x'), 'text/plain'));
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toContain(
      'application/problem+json',
    );
  });
});

describe.skipIf(!reachable)('asset storage', () => {
  const through = liveStore ? { objectStore: liveStore } : {};
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
