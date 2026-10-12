import { Context, Effect, Layer, ManagedRuntime, Queue } from 'effect';
import * as NetAddress from 'effect/net/NetAddress';
import * as RpcClient from 'effect/rpc/RpcClient';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';
import * as RpcServer from 'effect/rpc/RpcServer';
import * as Socket from 'effect/socket/Socket';
import * as SocketServer from 'effect/socket/SocketServer';

import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import {
  ProtocolBuilderGroup,
  type ProtocolBuilderClient,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';

import type { ProtocolBuilderAdapter } from '../../state/context.ts';
import {
  createInMemoryHost,
  hostSessionFor,
  type InMemoryHost,
  type InMemoryHostSeed,
} from './createInMemoryHost.ts';
import type { HostPrincipal } from './protocolStore.ts';

export type WebSocketHost = Readonly<{
  host: InMemoryHost;
  adapter: ProtocolBuilderAdapter;
  dropConnection(): void;
  close(): Promise<void>;
}>;

const MAX_FRAME_BYTES = 101 * 1024 * 1024;

const serialization = RpcSerialization.layerSchemaBinary({
  maxFrameSize: MAX_FRAME_BYTES,
});

class WireClient extends Context.Service<WireClient, ProtocolBuilderClient>()(
  '@codaco/protocol-builder/testing/WireClient',
) {}

type Link = Readonly<{ cut: (reason: Error) => void }>;

function pipe() {
  let controller: TransformStreamDefaultController<Uint8Array> | undefined;
  const stream = new TransformStream<Uint8Array, Uint8Array>(
    {
      start: (started) => {
        controller = started;
      },
    },
    undefined,
    { highWaterMark: 1024 },
  );
  return {
    stream,
    fail: (reason: Error) => controller?.error(reason),
  };
}

export async function createWebSocketHost(
  seed: InMemoryHostSeed,
  principal?: HostPrincipal,
): Promise<WebSocketHost> {
  const host = createInMemoryHost(seed);
  const incoming = Effect.runSync(Queue.unbounded<Socket.Socket>());
  const links = new Set<Link>();

  const socketServer = Layer.succeed(SocketServer.SocketServer)({
    address: NetAddress.unixPathAddress('in-memory'),
    run: (handler) =>
      Effect.forever(
        Effect.flatMap(Queue.take(incoming), (socket) =>
          Effect.forkChild(handler(socket)),
        ),
      ),
  });

  const server = RpcServer.layer(ProtocolBuilderGroup, {
    disableFatalDefects: true,
  }).pipe(
    Layer.provide(RpcServer.layerProtocolSocketServer),
    Layer.provide([socketServer, serialization]),
    Layer.provide([
      host.handlers,
      hostSessionFor(
        principal ?? {
          sessionId: 'wire-session',
          userId: 'wire-user',
          displayName: 'Wire',
        },
      ),
    ]),
  );
  const serverRuntime = ManagedRuntime.make(server);
  await serverRuntime.runPromise(Effect.void);

  const connect = Effect.gen(function* () {
    const toServer = pipe();
    const toClient = pipe();
    const link: Link = {
      cut: (reason) => {
        links.delete(link);
        toServer.fail(reason);
        toClient.fail(reason);
      },
    };
    links.add(link);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => link.cut(new Error('the client closed its socket'))),
    );
    const serverSide = yield* Socket.fromTransformStream(
      Effect.succeed({
        readable: toServer.stream.readable,
        writable: toClient.stream.writable,
      }),
    );
    yield* Queue.offer(incoming, serverSide);
    return {
      readable: toClient.stream.readable,
      writable: toServer.stream.writable,
    };
  });

  const client = Layer.effect(WireClient)(
    RpcClient.make(ProtocolBuilderGroup, { flatten: true }),
  ).pipe(
    Layer.provide(
      RpcClient.layerProtocolSocket({ retryTransientErrors: false }),
    ),
    Layer.provide([
      Layer.effect(Socket.Socket)(Socket.fromTransformStream(connect)),
      serialization,
    ]),
  );
  const clientRuntime = ManagedRuntime.make(client);

  return {
    host,
    adapter: makeRpcAdapter<ProtocolBuilderRpcs, WireClient, WireClient>({
      runtime: clientRuntime,
      client: WireClient,
    }),
    dropConnection: () => {
      for (const link of links) link.cut(new Error('the connection dropped'));
    },
    close: async () => {
      await clientRuntime.dispose();
      for (const link of links) link.cut(new Error('the host closed'));
      await serverRuntime.dispose();
    },
  };
}
