import { Effect, Layer, Option, Stream } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

import { MAX_UPLOAD_BYTES } from '../assets.ts';
import { Environment } from '../env.ts';
import { ObjectStore } from '../storage/object-store.ts';
import { contentTooLarge, readBodyCapped } from './body.ts';
import { requireSameOrigin } from './middleware/origin.ts';
import { requirePrincipal } from './middleware/principal.ts';
import { clientAddress, httpRateLimit } from './middleware/rate-limit.ts';

// `/storage`: asset bytes over plain HTTP rather than the RPC surface — files
// don't belong in RPC payloads, and retrieval must be streamable and
// cacheable. `/storage`, not `/assets`, which the client build claims for its
// hashed chunks.

const SHA256_HEX = /^[0-9a-f]{64}$/;

const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

// Uploaded bytes are untrusted, and they are served from the Studio origin —
// the same origin as the SPA and its RPC surface. Only media the browser
// cannot turn into script is served with its declared type and inline;
// everything else (HTML, SVG, and anything unrecognised) is delivered as an
// opaque download, so opening an asset URL can never run attacker script
// against a signed-in participant's session. SVG is deliberately absent: it
// carries <script>. Serving it for real needs an isolated origin.
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

/** The delivery policy for a stored media type: type + disposition. */
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

/** The path under `/storage`, without the prefix or a trailing query. */
const subpath = Effect.map(HttpServerRequest.HttpServerRequest, (request) => {
  const path = new URL(request.url, 'http://storage.invalid').pathname;
  return path.slice('/storage'.length);
});

/**
 * `GET /storage/:hash`. The object's bytes are streamed through rather than
 * buffered: the response body is the SDK's own stream, adapted.
 *
 * `HttpServerResponse.stream`, not `HttpServerResponse.raw` over the SDK's web
 * stream: the Node listener writes a raw body by piping it when it has
 * `.pipe` and by `end(body)` otherwise, and a web `ReadableStream` has no
 * `.pipe` — so a raw web stream reaches `end` and is refused there.
 */
const read = (store: ObjectStore['Service']) =>
  Effect.gen(function* () {
    // One segment names an object; anything else under the prefix names
    // nothing, configured or not.
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
          // Belt and braces around the type decision above: no sniffing back
          // into an executable type, and no scripts or subresources if a
          // browser renders the response as a document anyway.
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox",
          // A content hash never changes its bytes: immutable by construction.
          'cache-control': 'public, max-age=31536000, immutable',
          'etag': `"${hash}"`,
        },
      },
    );
  });

/** `POST /storage`: the bytes, content-addressed; anything else under it is not a route. */
const write = (store: ObjectStore['Service']) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (request.method !== 'POST' || (yield* subpath) !== '') {
      return problem(404, 'Not Found');
    }
    if (!store.configured) return notConfigured();
    // A truthful Content-Length is refused before a single byte is read;
    // a body without one is capped while it streams.
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

/**
 * `/storage` and everything under it.
 *
 * Reading stays open: a session lookup per byte range would put the database
 * on the delivery path, so `GET` carries only the per-address `storage_read`
 * limit. Reads are limited per client address until a participant session
 * token exists to key them by (#1899); the limit is deliberately generous — an
 * interview fetches every stimulus it shows, and an institution often puts a
 * whole building behind one address.
 *
 * The unsafe methods are the cookie plane's: the origin gate first, so a
 * cross-origin request is refused before any session lookup, then the
 * principal. An instance with no auth configured has no cookie to forge, so
 * it has no origin gate either — and no session, so the principal refuses.
 *
 * Every path under the prefix is registered, the bare prefix included, so the
 * gates run for a path that matches no object as much as for one that does;
 * the unmatched ones answer problem JSON here.
 */
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
