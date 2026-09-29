// The `/ws` route on its own, over a Studio with no database: what the
// protocol-builder suite proves is that the wiring carries a real session, and
// what this proves is the route around the rpc server — that a socket lives as
// long as its request, that a stop closes the sockets it is draining rather
// than waiting out its whole window on them, and that a maintenance window
// closes the sockets the gate never sees (#1901).
//
// A call here is answered without a database: the caller belongs to no team,
// so `openSession` refuses it as `ProtocolNotFound` after reading the
// memberships — which is what counts a frame as dispatched.
import { randomUUID } from 'node:crypto';

import { NodeWS } from '@effect/platform-node/NodeSocket';
import {
  Cause,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  MutableRef,
  Option,
  Predicate,
  Scope,
} from 'effect';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import * as RpcSerialization from 'effect/unstable/rpc/RpcSerialization';
import * as Socket from 'effect/unstable/socket/Socket';
import { describe, expect, it } from 'vitest';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';
import { MAX_SOCKET_FRAME_BYTES } from '@codaco/studio-contract/limits';

import { authServiceStub } from '../../__tests__/support/auth.ts';
import { startStudioServer } from '../../__tests__/support/serve.ts';
import { createStudio } from '../../app.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { resolve } from '../../env/resolve.ts';
import { MaintenanceTriggers } from '../../http/middleware/maintenance.ts';
import { MaintenanceState } from '../../platform/maintenance-state.ts';

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'ws-route-user',
  email: 'ws-route@example.com',
  emailVerified: true,
  name: 'Socket Researcher',
  locale: null,
  sessionId: 'ws-route-session',
};

/** A Studio whose every call reaches `openSession` and is counted there. */
function counting() {
  let dispatched = 0;
  const studio = createStudio(resolve({ NODE_ENV: 'test' }), {
    // The upgrade's principal gate asks the auth service, so the stub is the
    // researcher the socket is admitted as.
    auth: authServiceStub({
      getSession: () => Effect.succeedSome(PRINCIPAL),
      listMemberships: () =>
        Effect.sync(() => {
          dispatched += 1;
          return [];
        }),
    }),
  });
  return { studio, dispatched: () => dispatched };
}

/**
 * The server with a maintenance flag and a migration lock a case flips, over
 * the real triggers; the schema is always current here.
 */
async function serverWithFlag(studio: ReturnType<typeof counting>['studio']) {
  const flag = MutableRef.make(false);
  const lock = MutableRef.make(false);
  const triggers = MaintenanceTriggers.layerWith({
    lockHeld: Effect.sync(() => MutableRef.get(lock)),
    schema: Effect.succeed({ kind: 'current' }),
  }).pipe(Layer.provide(MaintenanceState.layerTest(flag)));
  const server = await startStudioServer(
    resolve({ NODE_ENV: 'test' }),
    studio,
    studio.checks,
    triggers,
  );
  return { ...server, flag, lock };
}

const wsUrlOf = (origin: string) => `${origin.replace('http://', 'ws://')}/ws`;

/** The editor's client on a socket of its own, with reconnection left to it. */
async function connect(origin: string) {
  const runtime = ManagedRuntime.make(
    RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
      Layer.provide(Socket.layerWebSocket(wsUrlOf(origin))),
      Layer.provide(
        Layer.succeed(Socket.WebSocketConstructor)(
          (url) => new NodeWS.WebSocket(url),
        ),
      ),
      Layer.provide(
        RpcSerialization.layerSchemaBinary({
          maxFrameSize: MAX_SOCKET_FRAME_BYTES,
        }),
      ),
    ),
  );
  const scope = Scope.makeUnsafe();
  const client = await runtime.runPromise(
    Scope.provide(
      RpcClient.make(ProtocolBuilderGroup, { flatten: true }),
      scope,
    ),
  );
  return {
    /** One call, answered however it is answered. */
    list: () =>
      runtime.runPromiseExit(
        client('ListSections', { protocolId: randomUUID() }),
      ),
    close: async () => {
      await runtime.runPromise(Scope.close(scope, Exit.void));
      await runtime.dispose();
    },
  };
}

/** Whether a call was answered by the handlers, with the refusal they give. */
function answered(exit: Exit.Exit<unknown, unknown>): boolean {
  if (Exit.isSuccess(exit)) return false;
  const error = Cause.findErrorOption(exit.cause);
  return (
    Option.isSome(error) && Predicate.isTagged(error.value, 'ProtocolNotFound')
  );
}

/** A transport failure's close code and reason, when a close ended the call. */
function closeOf(
  exit: Exit.Exit<unknown, unknown>,
): { readonly code: unknown; readonly reason: unknown } | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const error = Cause.findErrorOption(exit.cause);
  if (
    Option.isNone(error) ||
    !Predicate.hasProperty(error.value, 'reason') ||
    !Predicate.isTagged(error.value.reason, 'SocketCloseError') ||
    !Predicate.hasProperty(error.value.reason, 'code')
  ) {
    return undefined;
  }
  const reason = error.value.reason;
  return {
    code: reason.code,
    reason: Predicate.hasProperty(reason, 'closeReason')
      ? reason.closeReason
      : undefined,
  };
}

/** An idle socket, open. */
async function openIdle(origin: string): Promise<NodeWS.WebSocket> {
  const socket = new NodeWS.WebSocket(wsUrlOf(origin));
  await new Promise<void>((settle, reject) => {
    socket.once('open', () => settle());
    socket.once('error', reject);
  });
  return socket;
}

type CloseEvent = {
  readonly at: number;
  readonly code: number;
  readonly reason: string;
};

function closedWith(socket: NodeWS.WebSocket): Promise<CloseEvent> {
  return new Promise<CloseEvent>((settle, reject) => {
    socket.once('close', (code: number, reason: Buffer) =>
      settle({ at: performance.now(), code, reason: String(reason) }),
    );
    socket.once('error', reject);
  });
}

/** The close, or a refusal naming how long it did not come. */
function closedWithin(
  socket: NodeWS.WebSocket,
  ms: number,
): Promise<CloseEvent> {
  return Promise.race([
    closedWith(socket),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`the socket was still open after ${ms} ms`)),
        ms,
      ),
    ),
  ]);
}

describe('the /ws route', () => {
  it('answers a frame, and closes the socket when the server stops', async () => {
    const { studio, dispatched } = counting();
    const { origin, dispose } = await startStudioServer(
      resolve({ NODE_ENV: 'test' }),
      studio,
    );
    const idle = await openIdle(origin);
    const tab = await connect(origin);
    try {
      // Mutation: fork the upgrade instead of running it inside the route →
      // the request scope closes as the handler returns and this is never
      // answered.
      expect(answered(await tab.list())).toBe(true);
      expect(dispatched()).toBe(1);

      const closed = closedWith(idle);
      const startedStopAt = performance.now();
      const stoppedAt = await dispose().then(() => performance.now());
      const event = await closed;

      // The drain signals the socket routes and waits for them to leave
      // before the listener closes, so a stopping process tells its clients
      // rather than leaving them to notice. The client's `close` event and the
      // stop's promise settle a fraction of a millisecond apart, in either
      // order, so the two are bounded from the start of the stop rather than
      // ordered against each other.
      //
      // Mutation: drop `Effect.race(drain.closing)` from the route and the
      // stop instead waits out the drain's whole five-second bound with the
      // socket still open, which both bounds catch.
      expect(event.at - startedStopAt).toBeLessThan(1000);
      expect(stoppedAt - startedStopAt).toBeLessThan(1000);
      // Codeless, per the shutdown decision on #1929: the upgrade's release
      // is `ws.close()` with no status. A client reads that as 1005 — a close
      // frame that arrived and named no code, rather than the 1006 a dropped
      // connection gives.
      expect(event.code).toBe(1005);
      expect(event.reason).toBe('');
    } finally {
      idle.close();
      await tab.close();
    }
  });

  // #1901: "no procedure runs" during a window, and the gate sees only the
  // upgrade. A socket opened before the window must neither dispatch another
  // frame nor stay open through it.
  it('drops a frame sent during a maintenance window and closes the socket', async () => {
    const { studio, dispatched } = counting();
    const { origin, dispose, flag } = await serverWithFlag(studio);
    const tab = await connect(origin);
    try {
      expect(answered(await tab.list())).toBe(true);
      expect(dispatched()).toBe(1);

      MutableRef.set(flag, true);
      const during = await tab.list();

      // Mutation: hand a batch to the rpc server without asking the triggers
      // first → the call is answered and counted.
      expect(dispatched()).toBe(1);
      expect(closeOf(during)).toEqual({
        code: 1013,
        reason: 'down for maintenance',
      });
    } finally {
      await tab.close();
      await dispose();
    }
  });

  // A `migrate` with nothing to apply holds its lock for milliseconds on every
  // deploy; the gate refuses new requests meanwhile, but an open editor keeps
  // working.
  it('keeps a socket open while only a migration lock is held', async () => {
    const { studio, dispatched } = counting();
    const { origin, dispose, lock } = await serverWithFlag(studio);
    const idle = await openIdle(origin);
    const tab = await connect(origin);
    try {
      expect(answered(await tab.list())).toBe(true);
      const closed = closedWith(idle).then(() => 'closed');
      MutableRef.set(lock, true);
      // Past the watch interval and the reading's TTL, so both have seen it.
      await new Promise((settle) => setTimeout(settle, 1500));
      // Mutation: close on any closure, not only the operator's window → the
      // watch closes the sockets and this call fails on the close.
      expect(answered(await tab.list())).toBe(true);
      expect(dispatched()).toBe(2);
      expect(
        await Promise.race([
          closed,
          new Promise((settle) => setTimeout(() => settle('open'), 100)),
        ]),
      ).toBe('open');
      expect(idle.readyState).toBe(NodeWS.WebSocket.OPEN);
    } finally {
      idle.close();
      await tab.close();
      await dispose();
    }
  });

  it('closes an idle socket when a maintenance window opens', async () => {
    const { studio, dispatched } = counting();
    const { origin, dispose, flag } = await serverWithFlag(studio);
    const idle = await openIdle(origin);
    try {
      const flippedAt = performance.now();
      MutableRef.set(flag, true);
      // Mutation: drop the maintenance watch from the route's races → the
      // socket stays open and this rejects.
      const event = await closedWithin(idle, 2500);
      expect(event.code).toBe(1013);
      expect(event.at - flippedAt).toBeLessThan(2500);
      expect(dispatched()).toBe(0);

      // And the reconnect meets the gate.
      const again = new NodeWS.WebSocket(wsUrlOf(origin));
      const refused = await new Promise<number>((settle, reject) => {
        // A listener here owns the refused handshake, so it ends it.
        again.once('unexpected-response', (request, response) => {
          settle(response.statusCode ?? 0);
          response.resume();
          request.destroy();
        });
        again.once('open', () => {
          again.close();
          reject(new Error('the reconnect was admitted'));
        });
      });
      expect(refused).toBe(503);
    } finally {
      idle.close();
      await dispose();
    }
  });
});
