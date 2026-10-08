import { Context, Effect, Layer, ManagedRuntime, type Scope } from 'effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as HttpClient from 'effect/http/HttpClient';
import * as HttpClientRequest from 'effect/http/HttpClientRequest';
import * as RpcClient from 'effect/rpc/RpcClient';
import type * as RpcClientError from 'effect/rpc/RpcClientError';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';

import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';
import { ParticipantRpcs } from '@codaco/studio-contract/rpc/participant';
import { RPC_PATH } from '@codaco/studio-contract/rpc/studio';

import { delegatingRuntime, interceptRefusals } from './transport.ts';

export type ParticipantRpcsType = RpcGroup.Rpcs<typeof ParticipantRpcs>;

export type ParticipantRpcClient = RpcClient.RpcClient.Flat<
  ParticipantRpcsType,
  RpcClientError.RpcClientError
>;

let sessionToken: string | null = null;

export const setParticipantSessionToken = (token: string | null): void => {
  sessionToken = token;
};

export const ParticipantSessionToken = Context.Reference<string | null>(
  '@studio/ParticipantSessionToken',
  { defaultValue: () => null },
);

const stampSession = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.mapRequestEffect(client, (request) =>
    Effect.map(ParticipantSessionToken, (bound) => {
      const token = bound ?? sessionToken;
      return token === null
        ? request
        : HttpClientRequest.setHeader(
            request,
            PARTICIPANT_SESSION_HEADER,
            token,
          );
    }),
  );

export const participantRequestInit: globalThis.RequestInit = {
  credentials: 'omit',
};

const protocol = RpcClient.layerProtocolHttp({ url: RPC_PATH }).pipe(
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(
    Layer.effect(HttpClient.HttpClient)(
      Effect.map(HttpClient.HttpClient, (client) =>
        interceptRefusals(stampSession(client)),
      ),
    ).pipe(
      Layer.provide(
        FetchHttpClient.layer.pipe(
          Layer.provide(
            Layer.succeed(FetchHttpClient.RequestInit)(participantRequestInit),
          ),
        ),
      ),
    ),
  ),
);

export class ParticipantClient extends Context.Service<
  ParticipantClient,
  ParticipantRpcClient
>()('@studio/ParticipantClient') {
  static readonly layer: Layer.Layer<ParticipantClient> = Layer.effect(
    ParticipantClient,
  )(RpcClient.make(ParticipantRpcs, { flatten: true })).pipe(
    Layer.provide(protocol),
  );
}

export type ParticipantRuntime = ManagedRuntime.ManagedRuntime<
  ParticipantClient,
  never
>;

export const makeParticipantRuntime = (
  client: Effect.Effect<ParticipantRpcClient, never, Scope.Scope>,
): ParticipantRuntime =>
  ManagedRuntime.make(Layer.effect(ParticipantClient)(client));

let current: ParticipantRuntime = ManagedRuntime.make(ParticipantClient.layer);

export const getParticipantRuntime = (): ParticipantRuntime => current;

export const setParticipantRuntime = (next: ParticipantRuntime): void => {
  current = next;
};

export const participantRuntime: ParticipantRuntime = delegatingRuntime(
  () => current,
);
