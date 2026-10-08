import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Queue,
  Redacted,
} from 'effect';
import * as NetAddress from 'effect/net/NetAddress';
import * as RpcClient from 'effect/rpc/RpcClient';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';
import * as RpcServer from 'effect/rpc/RpcServer';
import * as Socket from 'effect/socket/Socket';
import * as SocketServer from 'effect/socket/SocketServer';
import { onTestFinished, vi } from 'vitest';

import {
  ProtocolBuilderGroup,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';
import {
  HostCaller,
  HostSession,
  HostUnauthorized,
} from '@codaco/protocol-builder-core/contract/session';
import type { HandlersLayer } from '@codaco/protocol-builder/testing/host/createInMemoryHost';
import { CLIENT_SESSION_PARAM } from '@codaco/studio-contract/client-session';
import { MAX_SOCKET_FRAME_BYTES } from '@codaco/studio-contract/limits';

import { HostClient } from '../runtime/hostClient.ts';
import { setHostClientLayer } from '../runtime/hostSession.ts';

const restoreHostClient = () => setHostClientLayer(HostClient.layer);

const inProcessClient = Effect.gen(function* () {
  // oxlint-disable-next-line prefer-const
  let client!: Effect.Success<
    ReturnType<
      typeof RpcClient.makeNoSerialization<ProtocolBuilderRpcs, never, true>
    >
  >;
  const server = yield* RpcServer.makeNoSerialization(ProtocolBuilderGroup, {
    onFromServer: (response) => client.write(response),
    disableFatalDefects: true,
  });
  client = yield* RpcClient.makeNoSerialization(ProtocolBuilderGroup, {
    supportsAck: true,
    flatten: true,
    onFromClient: ({ message }) => server.write(0, message),
  });
  return client.client;
});

export async function installInProcessHost(
  handlers: HandlersLayer,
  session: Layer.Layer<HostSession>,
): Promise<void> {
  await setHostClientLayer(
    Layer.effect(HostClient)(inProcessClient).pipe(
      Layer.provide([handlers, session]),
    ),
  );
  onTestFinished(restoreHostClient);
}

export type HostAccount = Readonly<{ userId: string; displayName: string }>;

export type ServedCall = Readonly<{
  tag: string;
  payload: unknown;
  userId: string;
  socket: number;
}>;

type ServerLink = Readonly<{
  send: (data: Uint8Array | string) => void;
  cut: () => void;
}>;

export class FakeWebSocket implements Socket.WebSocketLike {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  static openImmediately = true;
  static opened: FakeWebSocket[] = [];
  static account: HostAccount | undefined;
  static server: ((socket: FakeWebSocket) => ServerLink) | undefined;

  readonly url: string;
  readonly account: HostAccount | undefined;
  readyState: number = FakeWebSocket.CONNECTING;
  frozen = false;
  readonly #listeners = new Map<
    string,
    Set<(event: Socket.WebSocketEvent) => void>
  >();
  #link: ServerLink | undefined;

  constructor(url: string | URL) {
    this.url = String(url);
    this.account = FakeWebSocket.account;
    FakeWebSocket.opened.push(this);
    if (FakeWebSocket.openImmediately) this.#connect();
  }

  get clientSession(): string | null {
    return new URL(this.url).searchParams.get(CLIENT_SESSION_PARAM);
  }

  open(): void {
    if (this.readyState !== FakeWebSocket.CONNECTING) return;
    this.#connect();
    this.#dispatch('open', { type: 'open' });
  }

  receive(data: Uint8Array): void {
    if (this.frozen || this.readyState !== FakeWebSocket.OPEN) return;
    this.#dispatch('message', { type: 'message', data });
  }

  freeze(): void {
    this.frozen = true;
  }

  /**
   * 1000 is a normal close, 1001 a deploy's, 1005 a close frame with no status
   * code, 1006 no close frame at all, which a browser reports as an error first.
   */
  drop(code: 1000 | 1001 | 1005 | 1006): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    if (code === 1006) this.#dispatch('error', { type: 'error' });
    this.#end(code);
  }

  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: Socket.WebSocketEvent) => void,
  ): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: Socket.WebSocketEvent) => void,
  ): void {
    this.#listeners.get(type)?.delete(listener);
  }

  readonly sent: Array<string | Uint8Array> = [];

  send(data: string | Uint8Array<ArrayBuffer>): void {
    this.sent.push(data);
    if (this.frozen || this.readyState !== FakeWebSocket.OPEN) return;
    this.#link?.send(data);
  }

  close(code = 1000): void {
    this.#end(code);
  }

  #connect(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.#link = FakeWebSocket.server?.(this);
  }

  #end(code: number): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.#link?.cut();
    this.#link = undefined;
    this.#dispatch('close', { type: 'close', code, reason: '' });
  }

  #dispatch(type: string, event: Socket.WebSocketEvent): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

type Connection = Readonly<{ caller: HostCaller['Service']; socket: number }>;

const ConnectionCaller = Context.Reference<Connection | undefined>(
  '@studio/test/hostHarness/ConnectionCaller',
  { defaultValue: () => undefined },
);

function direction() {
  let controller: TransformStreamDefaultController<Uint8Array> | undefined;
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    start: (started) => {
      controller = started;
    },
  });
  return { stream, fail: (reason: Error) => controller?.error(reason) };
}

const encoder = new TextEncoder();

export type SocketHost = Readonly<{
  served: ReadonlyArray<ServedCall>;
}>;

export async function installSocketHost(
  handlers: HandlersLayer,
): Promise<SocketHost> {
  const served: ServedCall[] = [];
  const incoming = Effect.runSync(
    Queue.unbounded<
      Readonly<{ socket: Socket.Socket; connection: Connection | undefined }>
    >(),
  );

  const socketServer = Layer.succeed(SocketServer.SocketServer)({
    address: NetAddress.unixPathAddress('fake-websocket'),
    run: (handler) =>
      Effect.forever(
        Effect.flatMap(Queue.take(incoming), ({ socket, connection }) =>
          Effect.forkChild(
            Effect.provideService(
              handler(socket),
              ConnectionCaller,
              connection,
            ),
          ),
        ),
      ),
  });

  const session = Layer.succeed(HostSession)(
    HostSession.of((effect, { payload, rpc }) =>
      Effect.gen(function* () {
        const connection = yield* ConnectionCaller;
        if (connection === undefined) {
          return yield* new HostUnauthorized({});
        }
        served.push({
          tag: rpc._tag,
          payload,
          userId: connection.caller.userId,
          socket: connection.socket,
        });
        return yield* Effect.provideService(
          effect,
          HostCaller,
          connection.caller,
        );
      }),
    ),
  );

  const server = ManagedRuntime.make(
    RpcServer.layer(ProtocolBuilderGroup, { disableFatalDefects: true }).pipe(
      Layer.provide(RpcServer.layerProtocolSocketServer),
      Layer.provide([
        socketServer,
        RpcSerialization.layerSchemaBinary({
          maxFrameSize: MAX_SOCKET_FRAME_BYTES,
        }),
      ]),
      Layer.provide([handlers, session]),
    ),
  );
  await server.runPromise(Effect.void);

  FakeWebSocket.server = (webSocket) => {
    const toServer = direction();
    const toClient = direction();
    const socket = Effect.runSync(
      Socket.fromTransformStream(
        Effect.succeed({
          readable: toServer.stream.readable,
          writable: toClient.stream.writable,
        }),
      ),
    );
    const tab = webSocket.clientSession ?? '';
    const account = webSocket.account;
    const connection =
      account === undefined
        ? undefined
        : {
            caller: HostCaller.of({
              connectionId: tab,
              clientSessionId: tab,
              userId: account.userId,
              displayName: Redacted.make(account.displayName),
            }),
            socket: FakeWebSocket.opened.indexOf(webSocket) + 1,
          };
    Effect.runSync(Queue.offer(incoming, { socket, connection }));

    void (async () => {
      const reader = toClient.stream.readable.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          webSocket.receive(value);
        }
      } catch {
        // The connection was cut; the client learns that from its own socket.
      }
    })();

    const writer = toServer.stream.writable.getWriter();
    return {
      send: (data) => {
        writer
          .write(typeof data === 'string' ? encoder.encode(data) : data)
          .catch(() => undefined);
      },
      cut: () => {
        const reason = new Error('the connection dropped');
        toServer.fail(reason);
        toClient.fail(reason);
      },
    };
  };

  const previous = globalThis.WebSocket;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  await setHostClientLayer(HostClient.layer);

  onTestFinished(async () => {
    await setHostClientLayer(HostClient.layer);
    FakeWebSocket.server = undefined;
    vi.stubGlobal('WebSocket', previous);
    await server.dispose();
  });

  return { served };
}
