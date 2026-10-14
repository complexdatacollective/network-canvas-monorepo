import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Predicate,
  type Scope,
} from 'effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as RpcClient from 'effect/rpc/RpcClient';
import type * as RpcClientError from 'effect/rpc/RpcClientError';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import type * as RpcMessage from 'effect/rpc/RpcMessage';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';

import { RPC_PATH, StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import {
  logResearcher,
  NO_TEAM,
  type ResearcherLogScope,
  teamScope,
} from './browserLogs.ts';
import { faultCodeOf } from './errors.ts';
import { delegatingRuntime, interceptRefusals } from './transport.ts';

export type StudioRpcsType = RpcGroup.Rpcs<typeof StudioRpcs>;

export type StudioRpcClient = RpcClient.RpcClient.Flat<
  StudioRpcsType,
  RpcClientError.RpcClientError
>;

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

const requestScope = (
  request: RpcMessage.FromClientEncoded,
): ResearcherLogScope =>
  request._tag === 'Request' &&
  Predicate.hasProperty(request.payload, 'teamId') &&
  Predicate.isString(request.payload.teamId)
    ? teamScope(request.payload.teamId)
    : NO_TEAM;

const ObservedProtocol = Layer.effect(RpcClient.Protocol)(
  Effect.map(RpcClient.Protocol, (protocol) =>
    RpcClient.Protocol.of({
      ...protocol,
      send: (clientId, request, transferables) =>
        protocol.send(clientId, request, transferables).pipe(
          Effect.tapError((error) =>
            Effect.sync(() => {
              if (
                request._tag === 'Request' &&
                faultCodeOf(error) === 'transport'
              ) {
                logResearcher(
                  {
                    message: 'Request to the server failed',
                    level: 'Warn',
                    attributes: { error_code: 'transport' },
                  },
                  requestScope(request),
                );
              }
            }),
          ),
        ),
    }),
  ),
).pipe(Layer.provide(HttpProtocol));

export class StudioClient extends Context.Service<
  StudioClient,
  StudioRpcClient
>()('@studio/StudioClient') {
  static readonly layer: Layer.Layer<StudioClient> = Layer.effect(StudioClient)(
    RpcClient.make(StudioRpcs, { flatten: true }),
  ).pipe(Layer.provide(ObservedProtocol));
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

export const runtime: WebRuntime = delegatingRuntime(() => current);
