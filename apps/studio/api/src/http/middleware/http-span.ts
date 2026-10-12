import { Effect } from 'effect';
import {
  HttpRouter,
  HttpServerError,
  HttpServerRequest,
  type HttpServerResponse,
} from 'effect/http';

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
        }),
      ),
    ),
  { global: true },
);
