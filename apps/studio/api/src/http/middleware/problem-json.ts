import { STATUS_CODES } from 'node:http';

import { Effect, type Layer } from 'effect';
import { HttpEffect, HttpRouter, HttpServerResponse } from 'effect/http';

// Only empty bodies are rewritten: anything a handler chose, such as
// better-auth's `{ message }` errors, is already an answer. A pre-response
// handler because a global middleware may not handle errors.
export const ProblemJson: Layer.Layer<never, never, HttpRouter.HttpRouter> =
  HttpRouter.middleware(
    (httpEffect) =>
      HttpEffect.withPreResponseHandler(httpEffect, (_request, response) => {
        if (response.status < 400 || response.body._tag !== 'Empty') {
          return Effect.succeed(response);
        }
        return Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            {
              title: STATUS_CODES[response.status] ?? 'Error',
              status: response.status,
            },
            {
              status: response.status,
              contentType: 'application/problem+json',
              headers: response.headers,
              cookies: response.cookies,
            },
          ),
        );
      }),
    { global: true },
  );
