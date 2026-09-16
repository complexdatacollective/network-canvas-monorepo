import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Schema,
  type Scope,
} from 'effect';
import {
  FetchHttpClient,
  type Headers,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  type HttpClientResponse,
} from 'effect/unstable/http';
import type { RpcClientError, RpcGroup } from 'effect/unstable/rpc';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';

import { CLIENT_SESSION_HEADER } from '@codaco/studio-contract/client-session';
import { RPC_PATH, StudioRpcs } from '@codaco/studio-contract/rpc/studio';
import {
  Forbidden,
  Maintenance,
  RateLimited,
} from '@codaco/studio-contract/schema/errors';

import { clientSessionId } from '../lib/clientSession.ts';

// The one module that builds a client for Studio's rpc plane. Everything a
// screen reaches goes through `runtime/rpc.ts`, which is the only importer of
// `StudioClient` (asserted by src/__tests__/transport-policy.test.ts): a call
// made straight through the client would bypass the adapter's funnel, and with
// it the unauthorized report every 401 owes the router (§6.2).

/** The procedures `StudioRpcs` declares, as the union the adapter is typed by. */
export type StudioRpcsType = RpcGroup.Rpcs<typeof StudioRpcs>;

/**
 * The flat client: one callable `client(tag, payload)` for every procedure in
 * `StudioRpcs`, which is what lets `@codaco/effect-query` bind one generic
 * adapter rather than a wrapper per procedure.
 */
export type StudioRpcClient = RpcClient.RpcClient.Flat<
  StudioRpcsType,
  RpcClientError.RpcClientError
>;

// ---------------------------------------------------------------------------
// The HTTP-refusal interceptor
// ---------------------------------------------------------------------------

// Two planes refuse a call, and only one of them is the rpc plane.
//
// A handler's own refusal is HTTP 200 with a `Failure` envelope, and arrives as
// a typed error instance. A request refused BEFORE it reaches a handler — the
// maintenance gate's 503, the origin check's 403, an HTTP-level 429 — is an
// `application/problem+json` document with a non-200 status, and
// `layerProtocolHttp` applies no status filter at all: it posts the body
// through the client it is given and hands whatever comes back to the ndjson
// parser, which sees no envelopes and fails with `RpcClientDefect: "Received
// empty HTTP response from RPC server"`. The status, the document and the
// `Retry-After` header are all lost at that point (design finding F2).
//
// So the status is read below the protocol, on the HttpClient the protocol
// posts through, before the parser can see the body.

/**
 * As much of RFC 9457 as a refusal is read for. Decoded rather than picked
 * apart by hand, so a body of some other shape is `None` rather than a
 * half-read object; excess members are ignored, which is what lets an error
 * class's own extension members (`_tag`, `retryAfterSeconds`) ride along
 * without being declared here twice.
 */
const ProblemDocument = Schema.Struct({
  detail: Schema.optionalKey(Schema.String),
  instance: Schema.optionalKey(Schema.String),
  /**
   * The contract's own two checks, repeated here on purpose. `RateLimited`
   * declares `retryAfterSeconds` as an integer >= 0 and an Effect class
   * constructor validates, so a body carrying `-1` or `1.5` would make
   * `new RateLimited(...)` throw inside the interceptor — turning a refusal a
   * screen can read into a defect it cannot. Checking here instead means such
   * a body fails to decode, which is already the safe path: the document is
   * dropped, and the status still reports the refusal.
   */
  retryAfterSeconds: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
});

type ProblemDocument = typeof ProblemDocument.Type;

const decodeProblem = Schema.decodeUnknownOption(ProblemDocument);

/**
 * `Retry-After` in its delta-seconds form. RFC 9110 also allows an HTTP-date,
 * which is deliberately not read: Studio's own refusals are always seconds
 * (`apps/studio/server/src/app.ts` `tooManyRequests`), and a date would have to
 * be differenced against a clock this module has no business reading.
 */
const DELTA_SECONDS = /^\d+$/;

const retryAfterHeader = (headers: Headers.Headers): number | undefined => {
  const raw = headers['retry-after']?.trim();
  return raw !== undefined && DELTA_SECONDS.test(raw) ? Number(raw) : undefined;
};

/**
 * What a 429 with no interval at all is read as. The contract makes
 * `RateLimited.retryAfterSeconds` required — a caller told to back off with no
 * interval cannot comply — and the server's own limiter never sends zero
 * (`rate-limit.ts`: "a `Retry-After: 0` invites an immediate retry"), so its
 * floor is the floor used here rather than a zero this end invented.
 */
const RETRY_AFTER_FLOOR_SECONDS = 1;

/**
 * The refusal a status names, or `undefined` for a status that names none.
 *
 * Only `detail` and `instance` are carried over from the document: `type`,
 * `title` and `status` are the refusal's own identity and the class already
 * knows them, so a mislabelled document cannot produce a `RateLimited` that
 * says it is a 404.
 */
const refusalFor = (
  status: number,
  problem: ProblemDocument | undefined,
  retryAfter: number | undefined,
): Forbidden | Maintenance | RateLimited | undefined => {
  const members = {
    ...(problem?.detail === undefined ? {} : { detail: problem.detail }),
    ...(problem?.instance === undefined ? {} : { instance: problem.instance }),
  };
  const interval = retryAfter ?? problem?.retryAfterSeconds;
  switch (status) {
    case 403:
      return new Forbidden(members);
    case 429:
      return new RateLimited({
        ...members,
        retryAfterSeconds: interval ?? RETRY_AFTER_FLOOR_SECONDS,
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

/**
 * The document a refusal carries, when it carries one. A body that is not JSON,
 * or is JSON of some other shape, is not a failure of its own: the status is
 * still the refusal, and it is still reported.
 */
const problemOf = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ProblemDocument | undefined> =>
  response.json.pipe(
    Effect.catch(() => Effect.succeed(null)),
    Effect.map((body) => Option.getOrUndefined(decodeProblem(body))),
  );

/**
 * The typed refusal rides as the `cause` of the `StatusCodeError` this fails
 * with, rather than as a failure of its own.
 *
 * It has to: `transformClient`'s signature is `<E, R>(client: With<E, R>) =>
 * With<E, R>`, and an `HttpClient` layer is `With<HttpClientError>` — neither
 * admits a new error type, so a refusal cannot travel in the error channel as
 * itself. `makeProtocolHttp` maps this failure to `RpcClientError({ reason:
 * HttpClientErrorSchema.fromHttpClientError(cause) })`, whose `cause` is this
 * `StatusCodeError` object itself, so the instance survives the crossing
 * unserialised and `refusalOf` reads it back out.
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

/** Reads the status before the rpc parser can be handed a body that is not one. */
const interceptRefusals = (
  client: HttpClient.HttpClient,
): HttpClient.HttpClient =>
  HttpClient.transformResponse(client, Effect.flatMap(refuse));

// ---------------------------------------------------------------------------
// The transport
// ---------------------------------------------------------------------------

/**
 * This tab's identity, on the transport rather than per call — the property
 * `lib/api.ts` argues for: the server derives a protocol-builder lock's owner
 * from it, and a call that omitted it would be a stranger to the section this
 * tab is holding. `RpcClient.CurrentHeaders` is the per-fiber alternative and
 * is deliberately not used: a call site could forget it.
 */
const stampClientSession = <E, R>(
  client: HttpClient.HttpClient.With<E, R>,
): HttpClient.HttpClient.With<E, R> =>
  HttpClient.mapRequest(client, (request) =>
    HttpClientRequest.setHeader(
      request,
      CLIENT_SESSION_HEADER,
      clientSessionId(),
    ),
  );

/**
 * `same-origin` states what `globalThis.fetch` defaults to anyway, so nothing
 * drifts. `include` would be wrong: the SPA is same-origin with the API in
 * every topology, and `same-origin` both sends the session cookie and accepts
 * `Set-Cookie` from the response — which is how first-run setup's session
 * arrives.
 */
const FetchLive = FetchHttpClient.layer.pipe(
  Layer.provide(
    Layer.succeed(FetchHttpClient.RequestInit)({ credentials: 'same-origin' }),
  ),
);

/** The fetch client with the refusal interceptor wrapped around it. */
const HttpClientLive = Layer.effect(HttpClient.HttpClient)(
  Effect.map(HttpClient.HttpClient, interceptRefusals),
).pipe(Layer.provide(FetchLive));

const HttpProtocol = RpcClient.layerProtocolHttp({
  url: RPC_PATH,
  transformClient: stampClientSession,
}).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(HttpClientLive),
);

/**
 * Studio's rpc plane. `flatten: true` because one callable client is what makes
 * a single generic TanStack Query adapter possible at all.
 */
export class StudioClient extends Context.Service<
  StudioClient,
  StudioRpcClient
>()('@studio/StudioClient') {
  static readonly layer: Layer.Layer<StudioClient> = Layer.effect(StudioClient)(
    RpcClient.make(StudioRpcs, { flatten: true }),
  ).pipe(Layer.provide(HttpProtocol));
}

/** No `HostClient` this stage: the editor keeps its own oRPC socket until stage 8. */
export const WebLayer: Layer.Layer<StudioClient> = StudioClient.layer;

export type WebRuntime = ManagedRuntime.ManagedRuntime<StudioClient, never>;

/**
 * A runtime over a client the caller supplies — the seam `src/test/rpcHarness.ts`
 * installs an in-process `RpcTest` client through, so that a suite never has to
 * name `StudioClient` itself.
 */
export const makeWebRuntime = (
  client: Effect.Effect<StudioRpcClient, never, Scope.Scope>,
): WebRuntime => ManagedRuntime.make(Layer.effect(StudioClient)(client));

/**
 * Nothing is built here. `ManagedRuntime.make` builds its layer on the first
 * `runPromise`/`runFork`, so a signed-out visitor on a marketing page opens no
 * connection at all.
 */
const liveRuntime: WebRuntime = ManagedRuntime.make(WebLayer);

let current: WebRuntime = liveRuntime;

export const getWebRuntime = (): WebRuntime => current;

/** The test seam: `installRpcHarness` swaps the runtime for the length of a test. */
export const setWebRuntime = (next: WebRuntime): void => {
  current = next;
};

/**
 * A runtime-shaped facade that delegates to whichever runtime is current.
 *
 * `makeRpcAdapter` reads its `runtime` option once, when `runtime/rpc.ts` binds
 * the adapter at module load — so handing it `liveRuntime` would pin the six
 * exports to the browser transport and make `setWebRuntime` inert. Handing it
 * this instead means a screen imports `rpcQuery` once and never re-binds, while
 * a suite can still replace what is underneath it.
 */
export const runtime: WebRuntime = {
  get ['~effect/ManagedRuntime']() {
    return current['~effect/ManagedRuntime'];
  },
  get 'memoMap'() {
    return current.memoMap;
  },
  get 'contextEffect'() {
    return current.contextEffect;
  },
  get 'scope'() {
    return current.scope;
  },
  get 'cachedContext'() {
    return current.cachedContext;
  },
  set 'cachedContext'(context) {
    current.cachedContext = context;
  },
  get 'disposeEffect'() {
    return current.disposeEffect;
  },
  'context': () => current.context(),
  'runFork': (effect, options) => current.runFork(effect, options),
  'runSync': (effect) => current.runSync(effect),
  'runSyncExit': (effect) => current.runSyncExit(effect),
  'runCallback': (effect, options) => current.runCallback(effect, options),
  'runPromise': (effect, options) => current.runPromise(effect, options),
  'runPromiseExit': (effect, options) =>
    current.runPromiseExit(effect, options),
  'dispose': () => current.dispose(),
  [Symbol.asyncDispose]: () => current.dispose(),
};
