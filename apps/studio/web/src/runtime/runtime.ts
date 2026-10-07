import { Context, Effect, Layer, ManagedRuntime, type Scope } from 'effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as RpcClient from 'effect/rpc/RpcClient';
import type * as RpcClientError from 'effect/rpc/RpcClientError';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';

import { RPC_PATH, StudioRpcs } from '@codaco/studio-contract/rpc/studio';

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

export const runtime: WebRuntime = delegatingRuntime(() => current);
