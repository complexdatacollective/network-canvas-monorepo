import { STATUS_CODES } from 'node:http';

import {
  Effect,
  ErrorReporter as EffectErrorReporter,
  type Layer,
  Option,
} from 'effect';
import { HttpEffect, HttpRouter, HttpServerResponse } from 'effect/http';

import {
  defectReporter,
  ErrorReporter,
  reportHttpFailure,
} from '../../platform/error-reporter.ts';

const reporting = (
  reporter: ErrorReporter['Service'],
): (<A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>) => {
  const defects = defectReporter(reporter);
  return (effect) =>
    effect.pipe(
      Effect.tapCause((cause) => reportHttpFailure(reporter, cause)),
      Effect.provideServiceEffect(
        EffectErrorReporter.CurrentErrorReporters,
        Effect.map(
          EffectErrorReporter.CurrentErrorReporters,
          (current) => new Set([...current, defects]),
        ),
      ),
    );
};

// Only empty bodies are rewritten: anything a handler chose, such as
// better-auth's `{ message }` errors, is already an answer. A pre-response
// handler because a global middleware may not handle errors.
export const ProblemJson: Layer.Layer<never, never, HttpRouter.HttpRouter> =
  HttpRouter.middleware(
    Effect.map(Effect.serviceOption(ErrorReporter), (reporter) => {
      const report = Option.match(reporter, {
        onNone:
          () =>
          <A, E, R>(effect: Effect.Effect<A, E, R>) =>
            effect,
        onSome: reporting,
      });
      return (httpEffect) =>
        HttpEffect.withPreResponseHandler(
          report(httpEffect),
          (_request, response) => {
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
          },
        );
    }),
    { global: true },
  );
