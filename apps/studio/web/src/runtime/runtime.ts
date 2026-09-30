import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Schema,
  type Scope,
} from 'effect';
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient';
import type * as Headers from 'effect/unstable/http/Headers';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientError from 'effect/unstable/http/HttpClientError';
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest';
import type * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import type * as RpcClientError from 'effect/unstable/rpc/RpcClientError';
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as Socket from 'effect/unstable/socket/Socket';

import {
  ProtocolBuilderGroup,
  type ProtocolBuilderClient,
} from '@codaco/protocol-builder-core/contract';
import {
  CLIENT_SESSION_HEADER,
  CLIENT_SESSION_PARAM,
} from '@codaco/studio-contract/client-session';
import { MAX_SOCKET_FRAME_BYTES } from '@codaco/studio-contract/limits';
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
   * As permissive as the vocabulary's most permissive member declares it, on
   * purpose: ONE document is decoded for every status, and the two classes
   * that carry an interval do not declare it alike. `RateLimited` bounds it to
   * a whole number of seconds; `Maintenance` does not, because a migration's
   * estimate is whatever the server measured. Bounding it here would bound it
   * for maintenance too — and a member that fails to decode drops the WHOLE
   * document, so a 503 saying `1.5` would lose its `detail` as well as its
   * interval. The rate limiter's bound is applied on the 429 branch below,
   * where the contract has it.
   */
  retryAfterSeconds: Schema.optionalKey(Schema.Number),
});

type ProblemDocument = typeof ProblemDocument.Type;

const decodeProblem = Schema.decodeUnknownOption(ProblemDocument);

/**
 * `Retry-After` in its delta-seconds form. RFC 9110 also allows an HTTP-date,
 * which is deliberately not read: Studio's own refusals are always seconds
 * (`apps/studio/api/src/app.ts` `tooManyRequests`), and a date would have to
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
 * `RateLimited`'s own bound on the interval, read off the contract rather than
 * repeated here, so the two cannot drift apart.
 *
 * It has to be applied before the class is constructed: an Effect class
 * constructor validates, so an interval the contract refuses — a body carrying
 * `-1` or `1.5`, or a `Retry-After` of more digits than a safe integer —
 * would make `new RateLimited(...)` throw inside the interceptor, turning a
 * refusal a screen can read into a defect it cannot. One that does not decode
 * counts as no interval at all, and the floor stands in for it.
 */
const rateLimitInterval = Schema.decodeUnknownOption(
  RateLimited.fields.retryAfterSeconds,
);

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

/**
 * Studio's rpc plane alone. The protocol builder's host is not merged in: its
 * layer dials the socket as it is built, so a runtime holding both would open
 * one for any Studio call a signed-out page makes, and it could not be ended at
 * sign-out without ending this with it. `runtime/hostSession.ts` builds it in a
 * runtime of its own per session.
 */
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
 * A runtime-shaped facade that delegates to whichever runtime `resolve` names
 * at the moment of each use.
 *
 * `makeRpcAdapter` reads its `runtime` option once, when the adapter is bound
 * at module load — so handing it one concrete runtime would pin the adapter to
 * it for the life of the tab. Handing it this instead means a screen binds its
 * adapter once and never re-binds, while what is underneath can still be
 * replaced: by a suite, or by the next host session.
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

/** Whichever web runtime is current; what `runtime/rpc.ts` binds the adapter to. */
export const runtime: WebRuntime = delegatingRuntime(() => current);

// ---------------------------------------------------------------------------
// The protocol builder's host
// ---------------------------------------------------------------------------

/**
 * The upgrade URL this tab's socket is opened at.
 *
 * The tab names itself on the query string because a browser cannot put a
 * header on a WebSocket handshake, and the server derives the protocol
 * builder's lock owner from it: a tab that reconnects has to still be the
 * holder of the section it has open, and two tabs of one researcher have to be
 * two editors (#1275). `CLIENT_SESSION_PARAM` is the name the server reads it
 * under, so the two spellings cannot drift.
 */
function hostSocketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${scheme}//${window.location.host}/ws`);
  url.searchParams.set(CLIENT_SESSION_PARAM, clientSessionId());
  return url.toString();
}

/**
 * The protocol builder's host, over `/ws`.
 *
 * `retryTransientErrors` is off. With it on, a ping timeout — which the
 * protocol classifies as a transient `SocketOpenError` — reconnects the socket
 * underneath an in-flight call and an open stream without ever failing them,
 * so both hang for good. Off, both fail with `RpcClientError`, and the
 * package's channel ladder owns resuming the stream. The socket reconnects
 * either way; nothing is replayed.
 */
export class HostClient extends Context.Service<
  HostClient,
  ProtocolBuilderClient
>()('@studio/HostClient') {
  static readonly layer: Layer.Layer<HostClient> = Layer.effect(HostClient)(
    RpcClient.make(ProtocolBuilderGroup, { flatten: true }),
  ).pipe(
    Layer.provide(
      RpcClient.layerProtocolSocket({ retryTransientErrors: false }),
    ),
    Layer.provide(Socket.layerWebSocket(Effect.sync(hostSocketUrl))),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    // The default 16 MiB would refuse an asset the server stores, and a
    // refused frame poisons the connection rather than closing it.
    Layer.provide(
      RpcSerialization.layerSchemaBinary({
        maxFrameSize: MAX_SOCKET_FRAME_BYTES,
      }),
    ),
  );
}
