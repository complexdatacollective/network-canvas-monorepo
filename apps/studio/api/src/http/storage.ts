import { Effect, Layer, Option, Stream } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { MAX_UPLOAD_BYTES } from '@codaco/studio-contract/limits';

import { Environment } from '../env.ts';
import { type ByteRange, ObjectStore } from '../storage/object-store.ts';
import { contentTooLarge, readBodyCapped } from './body.ts';
import { requireSameOrigin } from './middleware/origin.ts';
import { requirePrincipal } from './middleware/principal.ts';
import { clientAddress, httpRateLimit } from './middleware/rate-limit.ts';

const SHA256_HEX = /^[0-9a-f]{64}$/;

const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

// Uploaded bytes are untrusted and served from the Studio origin, so only a
// type a browser cannot turn into script is served inline: by family rather
// than by name, since the upload keeps whatever type the researcher's browser
// reported and names vary by browser. Audio and video never run script; of
// images only SVG (and any other XML image) does, and an interview renders an
// SVG stimulus from its bytes instead (`participant/assetUrl.ts` in
// studio-web).
const INLINE_FAMILY = /^(?:audio|video|image)\/[a-z0-9][a-z0-9.+-]*$/;
const SCRIPTABLE = /svg|\+xml$/;

// The canonical name for an alias a browser reports for an accepted stimulus
// (protocol-builder's `RESOURCE_KIND_EXTENSIONS`), which players recognise
// more widely than the alias. Mapped at delivery, so assets already stored
// under an alias are served under the name too.
const MEDIA_TYPE_ALIASES: Readonly<Record<string, string>> = {
  'audio/m4a': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-aiff': 'audio/aiff',
  'audio/x-m4a': 'audio/mp4',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-mpeg-3': 'audio/mpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'video/mov': 'video/quicktime',
  'video/x-quicktime': 'video/quicktime',
};

export function deliveryFor(mediaType: string): {
  contentType: string;
  disposition: 'inline' | 'attachment';
} {
  const reported = mediaType.split(';')[0]?.trim().toLowerCase() ?? '';
  const essence = MEDIA_TYPE_ALIASES[reported] ?? reported;
  return INLINE_FAMILY.test(essence) && !SCRIPTABLE.test(essence)
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
 * One `bytes=start-end` or `bytes=start-` range, the forms a media element
 * sends (iOS will not play audio or video from a server that ignores them).
 * Anything else — a suffix, several ranges, another unit — is answered with
 * the whole object, as a server may.
 */
function byteRangeOf(header: string | undefined): ByteRange | undefined {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header?.trim() ?? '');
  if (match === null) return undefined;
  const start = Number(match[1]);
  const end = match[2] === '' ? undefined : Number(match[2]);
  if (!Number.isSafeInteger(start)) return undefined;
  if (end !== undefined && (!Number.isSafeInteger(end) || end < start)) {
    return undefined;
  }
  return { start, end };
}

/**
 * `HttpServerResponse.stream`, not `raw` over the SDK's web stream: the Node
 * listener `end`s a raw body without `.pipe`, and refuses a web stream there.
 */
const read = (store: ObjectStore['Service']) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const hash = /^\/([^/]+)$/.exec(yield* subpath)?.[1];
    if (hash === undefined) return problem(404, 'Not Found');
    if (!store.configured) return notConfigured();
    if (!SHA256_HEX.test(hash)) return problem(404, 'Not Found');
    const stored = yield* store.get(
      hash,
      byteRangeOf(request.headers['range']),
    );
    if (Option.isNone(stored)) return problem(404, 'Not Found');
    const asset = stored.value;
    const { part } = asset;
    if (part.kind === 'unsatisfiable') {
      return HttpServerResponse.empty({
        status: 416,
        headers: {
          'content-range': `bytes */${String(part.total)}`,
          'accept-ranges': 'bytes',
        },
      });
    }
    const delivery = deliveryFor(asset.mediaType);
    return HttpServerResponse.stream(
      Stream.fromReadableStream({
        evaluate: () => asset.body,
        onError: (cause) => cause,
      }),
      {
        contentType: delivery.contentType,
        ...(asset.size === undefined ? {} : { contentLength: asset.size }),
        ...(part.kind === 'range' ? { status: 206 } : {}),
        headers: {
          'accept-ranges': 'bytes',
          ...(part.kind === 'range'
            ? {
                'content-range': `bytes ${String(part.start)}-${String(part.end)}/${String(part.total)}`,
              }
            : {}),
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
