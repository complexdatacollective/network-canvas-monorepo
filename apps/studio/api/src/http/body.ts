import { Effect, Schema, Stream } from 'effect';
import {
  type HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';

export class BodyTooLarge extends Schema.TaggedError<BodyTooLarge>()(
  'BodyTooLarge',
  { maxBytes: Schema.Number },
) {}

export const contentTooLarge = () =>
  HttpServerResponse.jsonUnsafe(
    { title: 'Content Too Large', status: 413 },
    { status: 413, contentType: 'application/problem+json' },
  );

/**
 * Over the body stream rather than `IncomingMessage.MaxBodySize`, which only
 * the Node listener's request honours.
 */
export const readBodyCapped = Effect.fnUntraced(function* (
  maxBytes: number,
): Effect.fn.Return<
  Uint8Array<ArrayBuffer>,
  BodyTooLarge | HttpServerError.HttpServerError,
  HttpServerRequest.HttpServerRequest
> {
  const request = yield* HttpServerRequest.HttpServerRequest;
  // A web request with no body has no stream: its `stream` fails rather than
  // ending empty.
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
