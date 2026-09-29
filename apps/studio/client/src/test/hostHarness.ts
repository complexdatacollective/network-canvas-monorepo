import { Context, Effect, Layer, ManagedRuntime, Queue } from 'effect';
import * as NetAddress from 'effect/unstable/net/NetAddress';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';
import * as Socket from 'effect/unstable/socket/Socket';
import * as SocketServer from 'effect/unstable/socket/SocketServer';
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

import { setHostClientLayer } from '../runtime/hostSession.ts';
import { HOST_SOCKET_MAX_FRAME_BYTES, HostClient } from '../runtime/runtime.ts';

// The protocol builder's host, for the editor's suites: in process, or over the
// shipped `HostClient.layer` through a WebSocket stand-in whose far end is a
// real rpc server on the same serialization `/ws` uses.

/** Puts the shipped socket client back once the test is over. */
const restoreHostClient = () => setHostClientLayer(HostClient.layer);

/**
 * No socket and no serialization: what a handler answers is what the editor
 * gets. `disableFatalDefects` as on Studio's `/ws`, so a handler's defect fails
 * its own call rather than every call on the connection.
 */
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

/**
 * Serves `handlers` to the editor in process, as the caller `session` names,
 * for the length of the test.
 */
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

/** Who the browser's cookie says is signed in, as a handshake presents it. */
export type HostAccount = Readonly<{ userId: string; displayName: string }>;

/** One call the socket server let through its session, and whose it was. */
export type ServedCall = Readonly<{
  tag: string;
  payload: unknown;
  userId: string;
  /** Which socket carried it, counting from 1 in the order they opened. */
  socket: number;
}>;

type ServerLink = Readonly<{
  send: (data: Uint8Array | string) => void;
  cut: () => void;
}>;

/**
 * A WebSocket whose far end, once `installSocketHost` has run, is a real rpc
 * server. It stands in for the browser's own under
 * `Socket.layerWebSocketConstructorGlobal`, so what the client does with it is
 * the shipped layer's behaviour, not a double's.
 */
export class FakeWebSocket implements Socket.WebSocketLike {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  /**
   * Whether a socket is open the moment it is constructed. A real one is not —
   * it is CONNECTING for a round trip, which is the window a call parks in.
   */
  static openImmediately = true;
  static opened: FakeWebSocket[] = [];
  /** What a handshake made now would authenticate as; `undefined` is no cookie. */
  static account: HostAccount | undefined;
  static server: ((socket: FakeWebSocket) => ServerLink) | undefined;

  readonly url: string;
  readonly account: HostAccount | undefined;
  readyState: number = FakeWebSocket.CONNECTING;
  /** A half-open connection: nothing crosses in either direction, and nothing closes. */
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

  /** The tab id the upgrade URL names. */
  get clientSession(): string | null {
    return new URL(this.url).searchParams.get(CLIENT_SESSION_PARAM);
  }

  /** Completes the handshake of a socket left CONNECTING. */
  open(): void {
    if (this.readyState !== FakeWebSocket.CONNECTING) return;
    this.#connect();
    this.#dispatch('open', { type: 'open' });
  }

  /** A frame from the server, lost if the connection is frozen. */
  receive(data: Uint8Array): void {
    if (this.frozen || this.readyState !== FakeWebSocket.OPEN) return;
    this.#dispatch('message', { type: 'message', data });
  }

  /** Stops everything crossing without closing anything. */
  freeze(): void {
    this.frozen = true;
  }

  /**
   * The server going away: 1005 is a close frame with no status code, which
   * is what a deploy's socket close reaches the browser as; 1006 is no close
   * frame at all — a killed container or a dropped network — which a browser
   * reports as an error first.
   */
  drop(code: 1005 | 1006): void {
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

  /** Every frame the client put on the wire, whether or not it arrived. */
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

/** The connection a server-side call arrived on; unset is a handshake with no cookie. */
const ConnectionCaller = Context.Reference<Connection | undefined>(
  '@studio/test/hostHarness/ConnectionCaller',
  { defaultValue: () => undefined },
);

/** One direction of a connection, which either end can error. */
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
  /** Live: every call the server admitted, in order. */
  served: ReadonlyArray<ServedCall>;
}>;

/**
 * Serves `handlers` behind `FakeWebSocket` for the length of the test, and
 * makes the shipped `HostClient.layer` the editor's client again.
 *
 * The session reads the account the socket's handshake carried, the way
 * Studio's `/ws` reads the upgrade's cookie once for the life of the socket,
 * and the tab id from its URL — which is also the lock owner, so a tab that
 * reconnects still holds what it held.
 */
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
          maxFrameSize: HOST_SOCKET_MAX_FRAME_BYTES,
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
              displayName: account.displayName,
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
