import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/websocket';
import { RPCHandler } from '@orpc/server/websocket';
import {
  WebSocket as WebSocketClient,
  WebSocketServer,
  type RawData,
  type WebSocket as NodeWebSocket,
} from 'ws';

import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';

import {
  createInMemoryHost,
  type InMemoryHost,
  type InMemoryHostSeed,
} from './createInMemoryHost.ts';
import type { HostPrincipal } from './protocolStore.ts';

export type WebSocketHost = Readonly<{
  host: InMemoryHost;
  /** The same contract, reached over a real socket rather than in process. */
  client: ProtocolBuilderClient;
  /** Kills the server's side of the socket, as a lost connection does. */
  dropConnection(): void;
  close(): Promise<void>;
}>;

/**
 * The in-memory host served over a Node WebSocket, so a test can watch the
 * package behave against the transport Studio will use.
 */
export async function createWebSocketHost(
  seed: InMemoryHostSeed,
  principal?: HostPrincipal,
): Promise<WebSocketHost> {
  const host = createInMemoryHost(seed);
  const handler = new RPCHandler(host.router);
  const server = new WebSocketServer({ port: 0 });
  const serverSockets = new Set<NodeWebSocket>();
  const context = {
    principal: principal ?? {
      sessionId: 'wire-session',
      userId: 'wire-user',
      displayName: 'Wire',
    },
  };

  server.on('connection', (socket) => {
    serverSockets.add(socket);
    socket.on('message', (data, isBinary) => {
      void handler.message(socket, decodeFrame(data, isBinary), { context });
    });
    socket.on('close', () => {
      serverSockets.delete(socket);
      void handler.close(socket);
    });
  });

  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the WebSocket test server did not take a port');
  }
  const url = `ws://127.0.0.1:${address.port}`;

  const clientSockets = new Set<NodeWebSocket>();
  const link = new RPCLink({
    connect: () => {
      const socket = new WebSocketClient(url);
      clientSockets.add(socket);
      return socket;
    },
    reconnect: { enabled: true, delay: () => 10 },
  });

  return {
    host,
    client: createORPCClient<ProtocolBuilderClient>(link),
    dropConnection: () => {
      for (const socket of serverSockets) socket.terminate();
      serverSockets.clear();
    },
    close: async () => {
      for (const socket of clientSockets) socket.close();
      for (const socket of serverSockets) socket.terminate();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

/**
 * `ws` delivers a frame as a Buffer (or a list of them) whichever kind it is,
 * while the handler wants an ArrayBuffer for a binary frame and a string for a
 * text one.
 */
function decodeFrame(data: RawData, isBinary: boolean): string | ArrayBuffer {
  const bytes = new Uint8Array(
    Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data),
  );
  return isBinary ? bytes.buffer : new TextDecoder().decode(bytes);
}
