// Which browser tab is calling, read from one header on both transports.
//
// A protocol-builder lock belongs to a tab rather than to a connection, so this
// id is what a lease's owner will be (#1930, stage 8). The two halves below are
// the two ways it arrives: a fetch request to `/rpc` carries the header itself,
// and a `/ws` handshake — which a browser cannot put a header on — names the tab
// on the upgrade URL, where a route middleware rewrites it into the same header
// before anything downstream reads it.
//
// No `StudioRpcs` procedure declares `ClientSessionMiddleware` yet, so the `/rpc`
// half is a scratch mount: a group of one procedure whose whole implementation
// is to report the id it was given, served by a scratch `RpcServer.layerHttp`
// rather than by `RpcRoutes`. What it shares with the deployment is the real rpc
// server, the real ndjson framing and the real middleware layer — not the mount.
// So nothing here is an oracle for `/rpc`'s own provision of that middleware:
// deleting `Layer.provide(ClientSessionMiddlewareLive)` from
// `http/rpc-routes.ts` is behaviour-identical today and fails no case. It gets
// one when a procedure declares the middleware, at stage 8.
import { randomUUID } from 'node:crypto';

import { Effect, Layer, Predicate, Schema } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import {
  Rpc,
  RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/unstable/rpc';
import { Hono } from 'hono';
import { afterAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import {
  CLIENT_SESSION_HEADER,
  CLIENT_SESSION_PARAM,
} from '@codaco/studio-contract/client-session';
import {
  ClientSession,
  ClientSessionMiddleware,
} from '@codaco/studio-contract/middleware/client-session';

import type { Studio, WsBridgeDeps } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { getDeploymentStatus } from '../domain.ts';
import { resolve } from '../env/resolve.ts';
import { ClientSessionMiddlewareLive } from '../rpc/client-session.ts';
import type { RpcDeps } from '../rpc/deps.ts';
import { authServiceStub } from './support/auth.ts';
import { startStudioServer } from './support/serve.ts';

/** A minted id, as `crypto.randomUUID()` produces and the contract accepts. */
const TAB = randomUUID();
/**
 * A spelling `readClientSessionId` rejects: the pattern bounds the id at eight
 * characters, because it ends up in the `leases.owner` column.
 */
const REJECTED = 'no';

// ---------------------------------------------------------------- /rpc ----

/**
 * One procedure that reports the tab it was called by, and nothing else. It
 * declares the real `ClientSessionMiddleware`, so what is under test is the
 * server half of the contract's middleware rather than a second reading of the
 * header.
 */
const ClientSessionProbe = RpcGroup.make(
  Rpc.make('probe', { success: Schema.NullOr(Schema.String) }).middleware(
    ClientSessionMiddleware,
  ),
);

const ProbeHandlers = ClientSessionProbe.toLayer({
  probe: () =>
    Effect.gen(function* () {
      const session = yield* ClientSession;
      return session.id;
    }),
});

const probeServed = HttpRouter.toWebHandler(
  RpcServer.layerHttp({
    group: ClientSessionProbe,
    path: '/rpc',
    protocol: 'http',
  }).pipe(
    Layer.provide(ProbeHandlers),
    Layer.provide(ClientSessionMiddlewareLive),
    // ndjson, as `/rpc` itself is served (http/rpc-routes.ts).
    Layer.provide(RpcSerialization.layerNdjson),
  ),
  { disableLogger: true },
);

/**
 * The one `Exit` frame's value out of an ndjson response body — the shape
 * `rpc-setup.test.ts` reads a `/rpc` response with.
 */
async function probeOverHttp(
  headers: Record<string, string>,
  /**
   * Headers on the message rather than on the request — what a caller attaches
   * with `RpcClient.withHeaders`, which the rpc server merges over the
   * request's own before a middleware sees them.
   */
  messageHeaders: ReadonlyArray<readonly [string, string]> = [],
): Promise<unknown> {
  const response = await probeServed.handler(
    new Request('http://studio.test/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/ndjson', ...headers },
      body: `${JSON.stringify({
        _tag: 'Request',
        id: 1,
        tag: 'probe',
        payload: null,
        headers: messageHeaders,
      })}\n`,
    }),
  );
  expect(response.status).toBe(200);
  const frames = (await response.text())
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line: string): unknown => JSON.parse(line));
  const exit = frames.find(
    (frame) => Predicate.hasProperty(frame, '_tag') && frame._tag === 'Exit',
  );
  if (
    !Predicate.hasProperty(exit, 'exit') ||
    !Predicate.hasProperty(exit.exit, 'value')
  ) {
    throw new Error(`no successful Exit frame in ${JSON.stringify(frames)}`);
  }
  return exit.exit.value;
}

// ----------------------------------------------------------------- /ws ----

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'client-session-user',
  email: 'client-session@example.com',
  emailVerified: true,
  name: 'Tab Researcher',
  locale: null,
  sessionId: 'client-session-session',
};

/**
 * The tab id out of the context the bridge hands its socket handler.
 *
 * oRPC types `context` as a `Value`: a context, a promise of one, or a function
 * that produces one. The bridge passes a plain object, so this narrows with
 * `Predicate` rather than asserting — and a context that named no tab reads as
 * null, because a header nobody set has no entry in Effect's header record at
 * all.
 */
function tabIn(context: unknown): string | null {
  return Predicate.hasProperty(context, 'clientSessionId') &&
    Predicate.isString(context.clientSessionId)
    ? context.clientSessionId
    : null;
}

/**
 * A Studio whose socket handler answers every frame with the tab id it was
 * handed, so the assertion reads the value off the wire rather than polling a
 * variable the bridge may not have written yet.
 */
function reporting(): Studio {
  const ws: WsBridgeDeps = {
    admit: () => Promise.resolve({ principal: PRINCIPAL }),
    socket: (() => {
      const deps: WsBridgeDeps['socket'] = {
        message: (peer, _data, options) => {
          peer.send(
            JSON.stringify({ clientSessionId: tabIn(options?.context) }),
          );
          return Promise.resolve({ matched: true });
        },
        close: () => Promise.resolve(),
      };
      return deps;
    })(),
  };
  // The `/rpc` route is registered from this too; this half drives the socket
  // alone, so the plane behind it answers nothing useful.
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
    auth: authServiceStub(),
    limiter: undefined,
    rpc,
    checks: {},
  };
}

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

const env = resolve({ NODE_ENV: 'test' });
const server = await startStudioServer(env, reporting());

/** Opens a socket with the given query string and reports what reached the bridge. */
async function tabReachingTheBridge(query: string): Promise<unknown> {
  const socket = new WebSocket(
    `${server.origin.replace('http://', 'ws://')}/ws${query}`,
  );
  try {
    await opened(socket);
    const answered = nextMessage(socket);
    socket.send('name the tab');
    const reported: unknown = JSON.parse(await answered);
    return Predicate.hasProperty(reported, 'clientSessionId')
      ? reported.clientSessionId
      : reported;
  } finally {
    socket.close();
  }
}

afterAll(async () => {
  await server.dispose();
  await probeServed.dispose();
});

describe('the tab behind a call, over /rpc', () => {
  it('reports the tab a request named in the header', async () => {
    expect(await probeOverHttp({ [CLIENT_SESSION_HEADER]: TAB })).toBe(TAB);
  });

  it('reports no tab for a request that named none', async () => {
    expect(await probeOverHttp({})).toBeNull();
  });

  it('names the tab the request carried, whatever tab the message names', async () => {
    // A lease belongs to the tab the transport says is calling. `RpcServer`
    // merges a message's own headers over the request's, so reading the merged
    // set would let a caller name another tab as the owner of a lock —
    // the same thing the `/ws` query-only rule was hardened against.
    const otherTab = randomUUID();
    expect(
      await probeOverHttp({ [CLIENT_SESSION_HEADER]: TAB }, [
        [CLIENT_SESSION_HEADER, otherTab],
      ]),
    ).toBe(TAB);

    // And a request that named no tab stays nameless: a message cannot mint
    // an owner the transport never carried.
    expect(
      await probeOverHttp({}, [[CLIENT_SESSION_HEADER, otherTab]]),
    ).toBeNull();
  });

  it('reports no tab for an id the contract rejects', async () => {
    // Not a refusal: a tab that names an id this rejects is treated exactly
    // like one that named nothing, because no procedure needs one.
    expect(
      await probeOverHttp({ [CLIENT_SESSION_HEADER]: REJECTED }),
    ).toBeNull();
  });
});

describe('the tab behind a socket, over /ws', () => {
  it('carries the tab from the upgrade URL to the bridge', async () => {
    // A browser cannot set a header on a WebSocket handshake, so the id rides
    // on the query string and `ClientSessionQuery` rewrites it into the header
    // the bridge reads.
    expect(await tabReachingTheBridge(`?${CLIENT_SESSION_PARAM}=${TAB}`)).toBe(
      TAB,
    );
  });

  it('names no tab for a socket that named none', async () => {
    expect(await tabReachingTheBridge('')).toBeNull();
  });

  it('names no tab for a socket that named two', async () => {
    // A parameter given twice arrives as an array, which names no tab: the
    // rewrite refuses it rather than picking one of them.
    expect(
      await tabReachingTheBridge(
        `?${CLIENT_SESSION_PARAM}=${TAB}&${CLIENT_SESSION_PARAM}=${randomUUID()}`,
      ),
    ).toBeNull();
  });
});
