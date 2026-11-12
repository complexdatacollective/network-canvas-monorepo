import { Effect } from 'effect';
import {
  HttpRouter,
  HttpServerError,
  HttpServerRequest,
  type HttpServerResponse,
} from 'effect/http';

import { isProbe } from '../probes.ts';

const recordStatus = (response: HttpServerResponse.HttpServerResponse) =>
  Effect.annotateCurrentSpan('http.response.status_code', response.status);

export const HttpSpanLive = HttpRouter.middleware(
  (httpEffect) =>
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
      httpEffect.pipe(
        Effect.tap(recordStatus),
        Effect.tapCause((cause) =>
          Effect.flatMap(HttpServerError.causeResponse(cause), ([response]) =>
            recordStatus(response),
          ),
        ),
        Effect.withSpan(`http.server ${request.method}`, {
          kind: 'server',
          root: true,
          attributes: { 'http.request.method': request.method },
          // Orchestrators probe every few seconds, and readiness queries the
          // database: unsampled, the probe and its checks are never exported.
          sampled: !isProbe(request.url),
        }),
      ),
    ),
  { global: true },
);
