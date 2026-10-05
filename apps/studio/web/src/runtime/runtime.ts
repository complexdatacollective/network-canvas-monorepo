import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Schema,
  type Scope,
} from 'effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import type * as Headers from 'effect/http/Headers';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientError from 'effect/http/HttpClientError';
import type * as HttpClientResponse from 'effect/http/HttpClientResponse';
import * as RpcClient from 'effect/rpc/RpcClient';
import type * as RpcClientError from 'effect/rpc/RpcClientError';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';

import { RPC_PATH, StudioRpcs } from '@codaco/studio-contract/rpc/studio';
import {
  Forbidden,
  Maintenance,
  RateLimited,
  Unauthorized,
} from '@codaco/studio-contract/schema/errors';

import { parseRetryAfter } from './errors.ts';

export type StudioRpcsType = RpcGroup.Rpcs<typeof StudioRpcs>;

export type StudioRpcClient = RpcClient.RpcClient.Flat<
  StudioRpcsType,
  RpcClientError.RpcClientError
>;

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
): Forbidden | Maintenance | RateLimited | Unauthorized | undefined => {
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

const interceptRefusals = (
  client: HttpClient.HttpClient,
): HttpClient.HttpClient =>
  HttpClient.transformResponse(client, Effect.flatMap(refuse));

const FetchLive = FetchHttpClient.layer.pipe(
  Layer.provide(
    Layer.succeed(FetchHttpClient.RequestInit)({ credentials: 'same-origin' }),
  ),
);

const HttpClientLive = Layer.effect(HttpClient.HttpClient)(
  Effect.map(HttpClient.HttpClient, interceptRefusals),
).pipe(Layer.provide(FetchLive));

const HttpProtocol = RpcClient.layerProtocolHttp({
  url: RPC_PATH,
}).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(HttpClientLive),
);

export class StudioClient extends Context.Service<
  StudioClient,
  StudioRpcClient
>()('@studio/StudioClient') {
  static readonly layer: Layer.Layer<StudioClient> = Layer.effect(StudioClient)(
    RpcClient.make(StudioRpcs, { flatten: true }),
  ).pipe(Layer.provide(HttpProtocol));
}

/**
 * The protocol builder's host is not merged in: its layer dials the socket as it is
 * built, and must be ended at sign-out without ending this.
 */
export const WebLayer: Layer.Layer<StudioClient> = StudioClient.layer;

export type WebRuntime = ManagedRuntime.ManagedRuntime<StudioClient, never>;

export const makeWebRuntime = (
  client: Effect.Effect<StudioRpcClient, never, Scope.Scope>,
): WebRuntime => ManagedRuntime.make(Layer.effect(StudioClient)(client));

const liveRuntime: WebRuntime = ManagedRuntime.make(WebLayer);

let current: WebRuntime = liveRuntime;

export const getWebRuntime = (): WebRuntime => current;

export const setWebRuntime = (next: WebRuntime): void => {
  current = next;
};

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

export const runtime: WebRuntime = delegatingRuntime(() => current);
