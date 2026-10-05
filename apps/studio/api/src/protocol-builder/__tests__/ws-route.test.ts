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
import * as RpcClient from 'effect/rpc/RpcClient';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';
import * as Socket from 'effect/socket/Socket';
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

function counting() {
  let dispatched = 0;
  const studio = createStudio(resolve({ NODE_ENV: 'test' }), {
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

function answered(exit: Exit.Exit<unknown, unknown>): boolean {
  if (Exit.isSuccess(exit)) return false;
  const error = Cause.findErrorOption(exit.cause);
  return (
    Option.isSome(error) && Predicate.isTagged(error.value, 'ProtocolNotFound')
  );
}

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
      expect(answered(await tab.list())).toBe(true);
      expect(dispatched()).toBe(1);

      const closed = closedWith(idle);
      const startedStopAt = performance.now();
      const stoppedAt = await dispose().then(() => performance.now());
      const event = await closed;

      // The client's `close` event and the stop's promise settle in either
      // order, so the two are bounded from the start of the stop.
      expect(event.at - startedStopAt).toBeLessThan(1000);
      expect(stoppedAt - startedStopAt).toBeLessThan(1000);
      expect(event.code).toBe(1001);
      expect(event.reason).toBe('server shutting down');
    } finally {
      idle.close();
      await tab.close();
    }
  });

  it('drops a frame sent during a maintenance window and closes the socket', async () => {
    const { studio, dispatched } = counting();
    const { origin, dispose, flag } = await serverWithFlag(studio);
    const tab = await connect(origin);
    try {
      expect(answered(await tab.list())).toBe(true);
      expect(dispatched()).toBe(1);

      MutableRef.set(flag, true);
      const during = await tab.list();

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
      const event = await closedWithin(idle, 2500);
      expect(event.code).toBe(1013);
      expect(event.at - flippedAt).toBeLessThan(2500);
      expect(dispatched()).toBe(0);

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
