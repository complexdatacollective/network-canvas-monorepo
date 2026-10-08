import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest } from 'effect/http';

export const HttpSpanLive = HttpRouter.middleware(
  (httpEffect) =>
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
      httpEffect.pipe(
        Effect.tap((response) =>
          Effect.annotateCurrentSpan(
            'http.response.status_code',
            response.status,
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
