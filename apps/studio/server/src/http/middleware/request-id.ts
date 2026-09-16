import { randomUUID } from 'node:crypto';

import { Context, Effect } from 'effect';
import {
  HttpEffect,
  HttpRouter,
  HttpServerResponse,
} from 'effect/unstable/http';

/**
 * The id this request is known by in logs, in audit rows, and in the RPC
 * context — one value per request, whichever surface answers it.
 */
export class RequestId extends Context.Service<RequestId, string>()(
  '@studio/RequestId',
) {}

/**
 * Always minted here, never read from a request header. An id a caller could
 * choose is an id a caller could reuse: two unrelated requests sharing one
 * would make a log or an audit trail say they were the same work, and there is
 * no trusted party upstream to believe about it. It is echoed back as
 * `x-request-id` so an operator reading a failed response can find it.
 *
 * The echo is a pre-response handler because a global middleware may not
 * handle errors: the header has to reach the 404 and 500 the router
 * synthesises as well as the responses a handler chose.
 */
export const RequestIdLive = HttpRouter.middleware<{ provides: RequestId }>()(
  (httpEffect) =>
    Effect.gen(function* () {
      const requestId = yield* Effect.sync(() => randomUUID());
      return yield* HttpEffect.withPreResponseHandler(
        Effect.provideService(httpEffect, RequestId, requestId),
        (_request, response) =>
          Effect.succeed(
            HttpServerResponse.setHeader(response, 'x-request-id', requestId),
          ),
      );
    }),
  { global: true },
);
