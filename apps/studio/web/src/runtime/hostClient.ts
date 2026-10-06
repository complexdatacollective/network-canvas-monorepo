import { Context, Effect, Layer } from 'effect';
import * as RpcClient from 'effect/rpc/RpcClient';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';
import * as Socket from 'effect/socket/Socket';

import {
  ProtocolBuilderGroup,
  type ProtocolBuilderClient,
} from '@codaco/protocol-builder-core/contract';
import { CLIENT_SESSION_PARAM } from '@codaco/studio-contract/client-session';
import { MAX_SOCKET_FRAME_BYTES } from '@codaco/studio-contract/limits';

import { clientSessionId } from '../lib/clientSession.ts';

/**
 * The tab names itself on the query string because a browser cannot put a
 * header on a WebSocket handshake.
 */
function hostSocketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${scheme}//${window.location.host}/ws`);
  url.searchParams.set(CLIENT_SESSION_PARAM, clientSessionId());
  return url.toString();
}

/**
 * `retryTransientErrors` is off, so a dead socket fails the in-flight call and
 * the open stream rather than holding them across the reconnect.
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
