import { randomUUID } from 'node:crypto';

import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer, MutableRef, Predicate } from 'effect';
import { Hono } from 'hono';
import { WebSocket } from 'ws';

import { CLIENT_SESSION_HEADER } from '@codaco/studio-contract/client-session';

import { authServiceStub } from '../../__tests__/support/auth.ts';
import { startStudioServer } from '../../__tests__/support/serve.ts';
import type { Studio, WsBridgeDeps } from '../../app.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { getDeploymentStatus } from '../../domain.ts';
import { resolve } from '../../env/resolve.ts';
import { MaintenanceState } from '../../platform/maintenance-state.ts';
import type { RpcDeps } from '../../rpc/deps.ts';
import { MaintenanceTriggers } from '../middleware/maintenance.ts';

// The socket route on its own, with the RPC router stubbed out: what the
// protocol-builder suite proves is that the wiring carries a real session,
// and what this proves is the two things that suite cannot see — that the
// pull loop lives as long as the request, and that a stop closes the sockets
// it is draining rather than waiting out its whole window on them.

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'ws-bridge-user',
  email: 'ws-bridge@example.com',
  emailVerified: true,
  name: 'Socket Researcher',
  locale: null,
  sessionId: 'ws-bridge-session',
};

/** Nothing has been asked of the handler yet, which is not "named no tab". */
const NO_FRAME = 'no frame arrived';

/**
 * The tab id in the context the bridge built, or null when it named none: the
 * bridge leaves the field off entirely for a socket with no tab, because
 * Effect's header record has no entry for a header nobody set.
 */
function tabIn(context: unknown): string | null {
  return Predicate.hasProperty(context, 'clientSessionId') &&
    Predicate.isString(context.clientSessionId)
    ? context.clientSessionId
    : null;
}

/**
 * A socket handler that answers every frame, so the loop is observable, counts
 * the peers it was told had gone, and remembers the tab id the bridge handed
 * it — `tab()` is only meaningful once a frame has been answered.
 */
function echoing(): Studio & {
  readonly closed: () => number;
  readonly dispatched: () => number;
  readonly tab: () => string | null | typeof NO_FRAME;
} {
  let closed = 0;
  let dispatched = 0;
  let tab: string | null | typeof NO_FRAME = NO_FRAME;
  const ws: WsBridgeDeps = {
    socket: {
      message: (peer, data, options) => {
        dispatched += 1;
        tab = tabIn(options?.context);
        peer.send(typeof data === 'string' ? `echo:${data}` : 'echo:binary');
        return Promise.resolve({ matched: true });
      },
      close: () => {
        closed += 1;
        return Promise.resolve();
      },
    },
  };
  // The `/rpc` route is registered from this too, and answers nothing useful
  // here: this suite drives the socket alone.
  const rpc: RpcDeps = {
    capabilities: {
      enabled: false,
      magicLink: false,
      emailAndPassword: false,
      socialProviders: [],
    },
    deployment: getDeploymentStatus('self-hosted'),
    readInstallation: () => Promise.resolve(null),
  };
  return {
    app: new Hono(),
    ws,
    // The upgrade's principal gate asks the auth service, so the stub is the
    // researcher the socket is admitted as.
    auth: authServiceStub({ getSession: () => Effect.succeedSome(PRINCIPAL) }),
    limiter: undefined,
    rpc,
    checks: {},
    closed: () => closed,
    dispatched: () => dispatched,
    tab: () => tab,
  };
}

/** Resolves on the socket's next event of this kind, or rejects on its error. */
function opened(socket: WebSocket): Promise<void> {
  return new Promise<void>((settle, reject) => {
    socket.once('open', () => settle());
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise<string>((settle, reject) => {
    socket.once('message', (data: Buffer) => settle(String(data)));
    socket.once('error', reject);
  });
}

type CloseEvent = {
  readonly at: number;
  readonly code: number;
  readonly reason: string;
};

function closedWith(socket: WebSocket): Promise<CloseEvent> {
  return new Promise<CloseEvent>((settle, reject) => {
    socket.once('close', (code: number, reason: Buffer) =>
      settle({ at: performance.now(), code, reason: String(reason) }),
    );
    socket.once('error', reject);
  });
}

describe('the socket bridge', () => {
  it.live('answers a frame, and closes the socket when the server stops', () =>
    // A real socket and a real listener, so the real clock: `it.effect` would
    // run this under the TestClock, where nothing over a wire ever arrives.
    Effect.promise(async () => {
      const env = resolve({ NODE_ENV: 'test' });
      const studio = echoing();
      const { origin, dispose } = await startStudioServer(env, studio);
      const socket = new WebSocket(`${origin.replace('http://', 'ws://')}/ws`);
      try {
        await opened(socket);

        // Mutation: fork the pull loop instead of running it inline, and this
        // never arrives — the forked fiber is a child of the request scope,
        // which closes the moment the handler returns its response.
        const echoed = nextMessage(socket);
        socket.send('ping');
        expect(await echoed).toBe('echo:ping');

        const closed = closedWith(socket);
        const startedStopAt = performance.now();
        const stoppedAt = await dispose().then(() => performance.now());
        const event = await closed;

        // The drain signals the socket routes and waits for them to leave
        // before the listener closes, so a stopping process tells its clients
        // rather than leaving them to notice. Observed: the whole stop takes
        // about 3 ms and the close frame lands just inside it.
        //
        // Mutation: drop `Effect.race(drain.closing)` from the pull loop and
        // the stop instead waits out the drain's whole five-second bound with
        // the socket still open, which the bound below catches.
        expect(event.at).toBeLessThanOrEqual(stoppedAt);
        expect(stoppedAt - startedStopAt).toBeLessThan(1000);
        // Codeless, per the shutdown decision on #1929: the upgrade's release
        // is `ws.close()` with no status. A client reads that as 1005 — a
        // close frame that arrived and named no code, rather than the 1006 a
        // dropped connection gives.
        expect(event.code).toBe(1005);
        expect(event.reason).toBe('');
        // oRPC was told the peer is gone, exactly once, on the way out.
        // Mutation: drop the `close` finalizer from the bridge → 0.
        expect(studio.closed()).toBe(1);
      } finally {
        socket.close();
      }
    }),
  );

  /**
   * Opens a socket with these handshake headers and no query string, and
   * reports the tab id the bridge handed the socket handler. The echo is the
   * sync point: the handler records the id on the way to answering.
   */
  const tabFromHandshake = (headers: Record<string, string>) =>
    Effect.promise(async () => {
      const env = resolve({ NODE_ENV: 'test' });
      const studio = echoing();
      const { origin, dispose } = await startStudioServer(env, studio);
      const socket = new WebSocket(`${origin.replace('http://', 'ws://')}/ws`, {
        headers,
      });
      try {
        const echoed = nextMessage(socket);
        await opened(socket);
        socket.send('ping');
        expect(await echoed).toBe('echo:ping');
        return studio.tab();
      } finally {
        socket.close();
        await dispose();
      }
    });

  // The query string is the only thing that names a tab on `/ws`. A browser
  // cannot put a header on a handshake, so a header here comes from a client
  // that wrote the request itself — and the id it carries goes on to be a
  // `leases.owner` value, so it must have passed the contract's check.
  it.live('ignores a tab id a handshake supplied as a header', () =>
    Effect.gen(function* () {
      // Well-formed, so nothing but the rewrite's authority can refuse it.
      const named = yield* tabFromHandshake({
        [CLIENT_SESSION_HEADER]: randomUUID(),
      });
      expect(named).toBeNull();
    }),
  );

  it.live('never hands the bridge an id the contract would refuse', () =>
    Effect.gen(function* () {
      // 65 characters: one past the bound `readClientSessionId` enforces.
      const exotic = yield* tabFromHandshake({
        [CLIENT_SESSION_HEADER]: 'x'.repeat(65),
      });
      expect(exotic).toBeNull();
    }),
  );

  /**
   * The server with a maintenance flag and a migration lock a case flips,
   * over the real triggers; the schema is always current here.
   */
  async function serverWithFlag(studio: Studio) {
    const flag = MutableRef.make(false);
    const lock = MutableRef.make(false);
    const triggers = MaintenanceTriggers.layerWith({
      lockHeld: Effect.sync(() => MutableRef.get(lock)),
      schema: Effect.succeed({ kind: 'current' }),
    }).pipe(Layer.provide(MaintenanceState.layerTest(flag)));
    const env = resolve({ NODE_ENV: 'test' });
    const server = await startStudioServer(
      env,
      studio,
      studio.checks,
      triggers,
    );
    return { ...server, flag, lock };
  }

  /** The close, or a refusal naming how long it did not come. */
  function closedWithin(socket: WebSocket, ms: number): Promise<CloseEvent> {
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

  // #1901: "no procedure runs" during a window, and the gate sees only the
  // upgrade. A socket opened before the window must neither dispatch another
  // frame nor stay open through it.
  it.live(
    'drops a frame sent during a maintenance window and closes the socket',
    () =>
      Effect.promise(async () => {
        const studio = echoing();
        const { origin, dispose, flag } = await serverWithFlag(studio);
        const socket = new WebSocket(
          `${origin.replace('http://', 'ws://')}/ws`,
        );
        try {
          await opened(socket);
          const echoed = nextMessage(socket);
          socket.send('before');
          expect(await echoed).toBe('echo:before');
          expect(studio.dispatched()).toBe(1);

          MutableRef.set(flag, true);
          const closed = closedWithin(socket, 2500);
          const unanswered = nextMessage(socket);
          socket.send('during');
          const event = await closed;

          // Mutation: dispatch a batch without asking the triggers first → the
          // frame is answered and counted.
          expect(studio.dispatched()).toBe(1);
          await expect(
            Promise.race([
              unanswered,
              new Promise((settle) => setTimeout(() => settle('silence'), 100)),
            ]),
          ).resolves.toBe('silence');
          expect(event.code).toBe(1013);
          expect(event.reason).toBe('down for maintenance');
          expect(studio.closed()).toBe(1);
        } finally {
          socket.close();
          await dispose();
        }
      }),
  );

  // A `migrate` with nothing to apply holds its lock for milliseconds on every
  // deploy; the gate refuses new requests meanwhile, but an open editor keeps
  // working.
  it.live('keeps a socket open while only a migration lock is held', () =>
    Effect.promise(async () => {
      const studio = echoing();
      const { origin, dispose, lock } = await serverWithFlag(studio);
      const socket = new WebSocket(`${origin.replace('http://', 'ws://')}/ws`);
      try {
        await opened(socket);
        const closed = closedWith(socket).then(() => 'closed');
        MutableRef.set(lock, true);
        // Past the watch interval and the reading's TTL, so both have seen it.
        await new Promise((settle) => setTimeout(settle, 1500));
        const echoed = Promise.race([nextMessage(socket), closed]);
        socket.send('during');
        // Mutation: close on any closure, not only the operator's window → the
        // watch closes the socket and this reads 'closed'.
        expect(await echoed).toBe('echo:during');
        expect(socket.readyState).toBe(WebSocket.OPEN);
        expect(studio.closed()).toBe(0);
      } finally {
        socket.close();
        await dispose();
      }
    }),
  );

  it.live('closes an idle socket when a maintenance window opens', () =>
    Effect.promise(async () => {
      const studio = echoing();
      const { origin, dispose, flag } = await serverWithFlag(studio);
      const socket = new WebSocket(`${origin.replace('http://', 'ws://')}/ws`);
      try {
        await opened(socket);
        const flippedAt = performance.now();
        MutableRef.set(flag, true);
        // Mutation: drop the maintenance watch from the loop's races → the
        // socket stays open and this rejects.
        const event = await closedWithin(socket, 2500);
        expect(event.code).toBe(1013);
        expect(event.at - flippedAt).toBeLessThan(2500);
        expect(studio.dispatched()).toBe(0);

        // And the reconnect meets the gate.
        const again = new WebSocket(`${origin.replace('http://', 'ws://')}/ws`);
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
        socket.close();
        await dispose();
      }
    }),
  );
});
