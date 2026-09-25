import { Effect, Schema, Stream } from 'effect';
import {
  type HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

/** A request body that crossed the route's bound while it was being read. */
export class BodyTooLarge extends Schema.TaggedError<BodyTooLarge>()(
  'BodyTooLarge',
  { maxBytes: Schema.Number },
) {}

/** What a route answers a `BodyTooLarge` with. */
export const contentTooLarge = () =>
  HttpServerResponse.jsonUnsafe(
    { title: 'Content Too Large', status: 413 },
    { status: 413, contentType: 'application/problem+json' },
  );

/**
 * The request's body, read once, with the bound enforced DURING the read: the
 * cap exists to bound server memory, so an oversized body — or one with no
 * `Content-Length` at all, arriving chunked — is abandoned the moment it
 * crosses the limit rather than buffered first and measured after.
 *
 * Over the body stream rather than `request.arrayBuffer` under
 * `IncomingMessage.MaxBodySize`, because only the Node listener's request
 * honours that reference: the web request the in-process harness hands the
 * router reads its whole body whatever it is set to, so a bound expressed
 * that way would be one no suite could see. Stopping the stream early
 * releases its source, which is what ends the read.
 */
export const readBodyCapped = Effect.fnUntraced(function* (
  maxBytes: number,
): Effect.fn.Return<
  Uint8Array<ArrayBuffer>,
  BodyTooLarge | HttpServerError.HttpServerError,
  HttpServerRequest.HttpServerRequest
> {
  const request = yield* HttpServerRequest.HttpServerRequest;
  // A web request with no body has no stream to read — the web request's
  // `stream` fails rather than ending empty — where a Node request's simply
  // ends. Both are an empty body.
  if (request.source instanceof Request && request.source.body === null) {
    return new Uint8Array(0);
  }
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  yield* Stream.runForEachWhile(request.stream, (chunk) =>
    Effect.sync(() => {
      total += chunk.byteLength;
      if (total > maxBytes) return false;
      chunks.push(chunk);
      return true;
    }),
  );
  if (total > maxBytes) return yield* new BodyTooLarge({ maxBytes });
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
});
