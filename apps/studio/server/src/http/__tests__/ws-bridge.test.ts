import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { WebSocket } from 'ws';

import { stubAuthService } from '../../__tests__/support/auth.ts';
import { startStudioServer } from '../../__tests__/support/serve.ts';
import type { Studio, WsBridgeDeps } from '../../app.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import { getDeploymentStatus } from '../../domain.ts';
import { resolve } from '../../env/resolve.ts';
import type { RpcDeps } from '../../rpc/deps.ts';

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

/**
 * A socket handler that answers every frame, so the loop is observable, and
 * counts the peers it was told had gone.
 */
function echoing(): Studio & { readonly closed: () => number } {
  let closed = 0;
  const ws: WsBridgeDeps = {
    admit: () => Promise.resolve({ principal: PRINCIPAL }),
    socket: {
      message: (peer, data) => {
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
    auth: stubAuthService(),
    capabilities: {
      enabled: false,
      magicLink: false,
      emailAndPassword: false,
      socialProviders: [],
    },
    deployment: getDeploymentStatus('self-hosted'),
    readInstallation: () => Promise.resolve(null),
  };
  return { app: new Hono(), ws, rpc, checks: {}, closed: () => closed };
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
});
