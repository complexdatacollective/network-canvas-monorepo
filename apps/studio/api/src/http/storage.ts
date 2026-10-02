import { Effect, Layer, Option, Stream } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { MAX_UPLOAD_BYTES } from '@codaco/studio-contract/limits';

import { Environment } from '../env.ts';
import { ObjectStore } from '../storage/object-store.ts';
import { contentTooLarge, readBodyCapped } from './body.ts';
import { requireSameOrigin } from './middleware/origin.ts';
import { requirePrincipal } from './middleware/principal.ts';
import { clientAddress, httpRateLimit } from './middleware/rate-limit.ts';

const SHA256_HEX = /^[0-9a-f]{64}$/;

const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

// Uploaded bytes are untrusted and served from the Studio origin: only media
// the browser cannot turn into script is served inline. SVG carries <script>.
const INLINE_MEDIA_TYPES = new Set([
  'image/apng',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/ogg',
  'video/webm',
]);

export function deliveryFor(mediaType: string): {
  contentType: string;
  disposition: 'inline' | 'attachment';
} {
  const essence = mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
  return INLINE_MEDIA_TYPES.has(essence)
    ? { contentType: essence, disposition: 'inline' }
    : { contentType: 'application/octet-stream', disposition: 'attachment' };
}

const problem = (status: number, title: string) =>
  HttpServerResponse.jsonUnsafe(
    { title, status },
    { status, contentType: 'application/problem+json' },
  );

const notConfigured = () => problem(503, 'Asset storage not configured');

const subpath = Effect.map(HttpServerRequest.HttpServerRequest, (request) => {
  const path = new URL(request.url, 'http://storage.invalid').pathname;
  return path.slice('/storage'.length);
});

/**
 * `HttpServerResponse.stream`, not `raw` over the SDK's web stream: the Node
 * listener `end`s a raw body without `.pipe`, and refuses a web stream there.
 */
const read = (store: ObjectStore['Service']) =>
  Effect.gen(function* () {
    const hash = /^\/([^/]+)$/.exec(yield* subpath)?.[1];
    if (hash === undefined) return problem(404, 'Not Found');
    if (!store.configured) return notConfigured();
    if (!SHA256_HEX.test(hash)) return problem(404, 'Not Found');
    const stored = yield* store.get(hash);
    if (Option.isNone(stored)) return problem(404, 'Not Found');
    const asset = stored.value;
    const delivery = deliveryFor(asset.mediaType);
    return HttpServerResponse.stream(
      Stream.fromReadableStream({
        evaluate: () => asset.body,
        onError: (cause) => cause,
      }),
      {
        contentType: delivery.contentType,
        ...(asset.size === undefined ? {} : { contentLength: asset.size }),
        headers: {
          'content-disposition': delivery.disposition,
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox",
          'cache-control': 'public, max-age=31536000, immutable',
          'etag': `"${hash}"`,
        },
      },
    );
  });

const write = (store: ObjectStore['Service']) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (request.method !== 'POST' || (yield* subpath) !== '') {
      return problem(404, 'Not Found');
    }
    if (!store.configured) return notConfigured();
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
      return contentTooLarge();
    }
    const bytes = yield* readBodyCapped(MAX_UPLOAD_BYTES);
    if (bytes.byteLength === 0) return problem(400, 'Empty body');
    const mediaType =
      request.headers['content-type'] ?? 'application/octet-stream';
    const stored = yield* store.put(bytes, mediaType);
    return HttpServerResponse.jsonUnsafe(stored, { status: 201 });
  }).pipe(
    Effect.catchTag('BodyTooLarge', () => Effect.succeed(contentTooLarge())),
  );

export const StorageRoutes = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Environment;
    const store = yield* ObjectStore;

    const reads = HttpRouter.add('GET', '/storage/*', read(store)).pipe(
      Layer.provide(httpRateLimit('storage_read', clientAddress).layer),
    );

    const writeGate =
      env.auth === undefined
        ? requirePrincipal
        : requirePrincipal.combine(requireSameOrigin(env.auth.baseUrl));
    const writes = HttpRouter.use((router) =>
      Effect.forEach(
        UNSAFE_METHODS,
        (method) => router.add(method, '/storage/*', write(store)),
        { discard: true },
      ),
    ).pipe(Layer.provide(writeGate.layer));

    return Layer.mergeAll(reads, writes);
  }),
);
