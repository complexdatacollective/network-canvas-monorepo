import { Effect, type ManagedRuntime, Option, Schema } from 'effect';
import type * as Headers from 'effect/http/Headers';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientError from 'effect/http/HttpClientError';
import type * as HttpClientResponse from 'effect/http/HttpClientResponse';

import {
  Forbidden,
  Maintenance,
  NotFound,
  RateLimited,
  Unauthorized,
} from '@codaco/studio-contract/schema/errors';

import { parseRetryAfter } from './errors.ts';

// `layerProtocolHttp` applies no status filter, so a refusal made before a handler
// would reach the ndjson parser and lose its status; it is read below the protocol.

const ProblemDocument = Schema.Struct({
  detail: Schema.optionalKey(Schema.String),
  instance: Schema.optionalKey(Schema.String),
  /**
   * Unbounded on purpose: `Maintenance` does not bound it as `RateLimited` does;
   * the rate limiter's bound is applied on the 429 branch below.
   */
  retryAfterSeconds: Schema.optionalKey(Schema.Number),
});

type ProblemDocument = typeof ProblemDocument.Type;

const decodeProblem = Schema.decodeUnknownOption(ProblemDocument);

const retryAfterHeader = (headers: Headers.Headers): number | undefined =>
  parseRetryAfter(headers['retry-after']);

/**
 * The server's own limiter never sends zero: a `Retry-After: 0` invites an immediate retry.
 */
const RETRY_AFTER_FLOOR_SECONDS = 1;

/**
 * Applied before the class is constructed: an Effect class constructor validates,
 * and a throw inside the interceptor would turn a refusal into a defect.
 */
const rateLimitInterval = Schema.decodeUnknownOption(
  RateLimited.fields.retryAfterSeconds,
);

const refusalFor = (
  status: number,
  problem: ProblemDocument | undefined,
  retryAfter: number | undefined,
):
  | Forbidden
  | Maintenance
  | NotFound
  | RateLimited
  | Unauthorized
  | undefined => {
  const members = {
    ...(problem?.detail === undefined ? {} : { detail: problem.detail }),
    ...(problem?.instance === undefined ? {} : { instance: problem.instance }),
  };
  const interval = retryAfter ?? problem?.retryAfterSeconds;
  switch (status) {
    case 401:
      return new Unauthorized(members);
    case 403:
      return new Forbidden(members);
    case 404:
      return new NotFound(members);
    case 429:
      return new RateLimited({
        ...members,
        retryAfterSeconds:
          Option.getOrUndefined(rateLimitInterval(interval)) ??
          RETRY_AFTER_FLOOR_SECONDS,
      });
    case 503:
      return new Maintenance({
        ...members,
        ...(interval === undefined ? {} : { retryAfterSeconds: interval }),
      });
    default:
      return undefined;
  }
};

const problemOf = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ProblemDocument | undefined> =>
  response.json.pipe(
    Effect.catch(() => Effect.succeed(null)),
    Effect.map((body) => Option.getOrUndefined(decodeProblem(body))),
  );

/**
 * The typed refusal rides as the `cause` of the `StatusCodeError`: `transformClient`
 * admits no new error type.
 */
const refuse = Effect.fnUntraced(function* (
  response: HttpClientResponse.HttpClientResponse,
) {
  if (response.status < 400) return response;
  const problem = yield* problemOf(response);
  const refusal = refusalFor(
    response.status,
    problem,
    retryAfterHeader(response.headers),
  );
  return yield* new HttpClientError.HttpClientError({
    reason: new HttpClientError.StatusCodeError({
      request: response.request,
      response,
      ...(refusal === undefined ? {} : { cause: refusal }),
      description: `the request was refused with ${String(response.status)}`,
    }),
  });
});

export const interceptRefusals = (
  client: HttpClient.HttpClient,
): HttpClient.HttpClient =>
  HttpClient.transformResponse(client, Effect.flatMap(refuse));

/**
 * `makeRpcAdapter` reads its `runtime` once, so this resolves the current one at each
 * use.
 */
export const delegatingRuntime = <R>(
  resolve: () => ManagedRuntime.ManagedRuntime<R, never>,
): ManagedRuntime.ManagedRuntime<R, never> => ({
  get ['~effect/ManagedRuntime']() {
    return resolve()['~effect/ManagedRuntime'];
  },
  get 'memoMap'() {
    return resolve().memoMap;
  },
  get 'contextEffect'() {
    return resolve().contextEffect;
  },
  get 'scope'() {
    return resolve().scope;
  },
  get 'cachedContext'() {
    return resolve().cachedContext;
  },
  set 'cachedContext'(context) {
    resolve().cachedContext = context;
  },
  get 'disposeEffect'() {
    return resolve().disposeEffect;
  },
  'context': () => resolve().context(),
  'runFork': (effect, options) => resolve().runFork(effect, options),
  'runSync': (effect) => resolve().runSync(effect),
  'runSyncExit': (effect) => resolve().runSyncExit(effect),
  'runCallback': (effect, options) => resolve().runCallback(effect, options),
  'runPromise': (effect, options) => resolve().runPromise(effect, options),
  'runPromiseExit': (effect, options) =>
    resolve().runPromiseExit(effect, options),
  'dispose': () => resolve().dispose(),
  [Symbol.asyncDispose]: () => resolve().dispose(),
});
