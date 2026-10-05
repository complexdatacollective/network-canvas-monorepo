import { randomUUID } from 'node:crypto';

import { Context, Effect } from 'effect';
import { HttpEffect, HttpRouter, HttpServerResponse } from 'effect/http';

export class RequestId extends Context.Service<RequestId, string>()(
  '@studio/RequestId',
) {}

/**
 * Always minted here, never read from a request header: an id a caller could
 * choose is an id a caller could reuse.
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
