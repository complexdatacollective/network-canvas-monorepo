import { randomUUID } from 'node:crypto';

import { Cause, Context, Effect } from 'effect';
import {
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';

import { RequestTeam } from '../../platform/request-team.ts';

export class RequestId extends Context.Service<RequestId, string>()(
  '@studio/RequestId',
) {}

/**
 * Always minted here, never read from a request header: an id a caller could
 * choose is an id a caller could reuse.
 */
export const RequestIdLive = HttpRouter.middleware<{
  provides: RequestId | RequestTeam;
}>()(
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const requestId = yield* Effect.sync(() => randomUUID());
      const team = RequestTeam.make();
      yield* Effect.annotateCurrentSpan('studio.request_id', requestId);
      return yield* HttpEffect.withPreResponseHandler(
        httpEffect.pipe(
          Effect.tap((response) =>
            Effect.logDebug('Request handled').pipe(
              Effect.annotateLogs({
                http_method: request.method,
                http_status: response.status,
              }),
            ),
          ),
          Effect.catchCause((cause) =>
            Effect.failCause(
              Cause.annotate(
                cause,
                Context.make(RequestId, requestId).pipe(
                  Context.add(RequestTeam, team),
                ),
              ),
            ),
          ),
          Effect.provideService(RequestId, requestId),
          Effect.provideService(RequestTeam, team),
        ),
        (_request, response) =>
          Effect.succeed(
            HttpServerResponse.setHeader(response, 'x-request-id', requestId),
          ),
      );
    }),
  { global: true },
);
