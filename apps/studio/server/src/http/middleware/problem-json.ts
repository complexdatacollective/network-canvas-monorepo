import { STATUS_CODES } from 'node:http';

import { Effect, type Layer } from 'effect';
import {
  HttpEffect,
  HttpRouter,
  HttpServerResponse,
} from 'effect/unstable/http';

// RFC 9457 problem details for every refusal this server synthesises, so the
// machine surfaces answer one shape whatever produced the status (#1248).
//
// The Effect router answers an unmatched route, an unhandled defect, a client
// abort or a shutdown with a response that carries a status and *no body at
// all*. A caller reading one of those learns nothing, and the Hono app behind
// this bridge has always answered problem JSON — so the empty ones are filled
// in here rather than left as the only refusals on the server with nothing to
// read.
//
// Only empty bodies are rewritten. Anything a handler chose is already an
// answer: the Hono app's own problem JSON, better-auth's `{ message }` errors,
// an asset's bytes. Replacing those would throw away a considered response,
// and in better-auth's case would break a client that reads its shape.
//
// The mechanism is a pre-response handler rather than error handling in the
// middleware itself: the router's type forbids a global middleware from
// handling errors (`Types.unhandled` has to stay in its error channel), and a
// pre-response handler is the one hook that also sees the response Effect
// synthesises *from* a failure — which is exactly the 404 and 500 this exists
// for.
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
            },
          ),
        );
      }),
    { global: true },
  );
