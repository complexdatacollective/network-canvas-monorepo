import { Context, Effect, Layer, ManagedRuntime, Queue } from 'effect';
import * as NetAddress from 'effect/unstable/net/NetAddress';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';
import * as Socket from 'effect/unstable/socket/Socket';
import * as SocketServer from 'effect/unstable/socket/SocketServer';

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
  /** The same contract, reached over a serialized socket rather than in process. */
  adapter: ProtocolBuilderAdapter;
  /** Kills the socket under both ends, as a lost connection does. */
  dropConnection(): void;
  close(): Promise<void>;
}>;

/**
 * The frame bound both ends are built with. Explicit, because the default
 * (16 MiB) refuses an asset the host accepts, and a refused frame poisons the
 * connection rather than closing it.
 */
const MAX_FRAME_BYTES = 101 * 1024 * 1024;

const serialization = RpcSerialization.layerSchemaBinary({
  maxFrameSize: MAX_FRAME_BYTES,
});

class WireClient extends Context.Service<WireClient, ProtocolBuilderClient>()(
  '@codaco/protocol-builder/testing/WireClient',
) {}

type Link = Readonly<{ cut: (reason: Error) => void }>;

/** One direction of a connection, which either end can error. */
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

/**
 * The in-memory host served over the rpc socket protocol Studio's editor uses,
 * through an in-memory socket pair and the same serialization, so a test can
 * watch the package across a real encoding boundary: revisions arrive as
 * decoded `bigint`s and staged bytes as decoded `Uint8Array`s, and a dropped
 * connection fails what was in flight on it.
 */
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

  const server = RpcServer.layer(ProtocolBuilderGroup).pipe(
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

  // A connection is opened each time the client's socket protocol connects,
  // which it does again after a drop.
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
