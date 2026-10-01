// Which browser tab is calling, read from one header on the request.
//
// A protocol-builder lock belongs to a tab rather than to a connection, so this
// id is what a lease's owner is. A fetch request carries the header itself, and
// a `/ws` handshake — which a browser cannot put a header on — names the tab on
// the upgrade URL, where a route middleware rewrites it into the same header
// before anything downstream reads it; that half is proved over a real socket,
// by lock ownership, in `ws-protocol-builder.test.ts`.
//
// Two readers of the header are proved here, each through a scratch group of
// one procedure whose whole implementation is to report what it was given,
// over the real rpc server and the real ndjson framing: the contract's
// `ClientSessionMiddleware`, and the protocol builder's `HostSessionLive`,
// which resolves the tab itself because the core group declares `HostSession`
// alone. No `StudioRpcs` procedure declares `ClientSessionMiddleware`, so
// nothing here is an oracle for `/rpc`'s own provision of it: deleting
// `Layer.provide(ClientSessionMiddlewareLive)` from `http/rpc-routes.ts` is
// behaviour-identical today and fails no case.
import { randomUUID } from 'node:crypto';

import { Effect, Layer, Option, Predicate, Schema } from 'effect';
import * as HttpRouter from 'effect/http/HttpRouter';
import * as Rpc from 'effect/rpc/Rpc';
import * as RpcGroup from 'effect/rpc/RpcGroup';
import * as RpcSerialization from 'effect/rpc/RpcSerialization';
import * as RpcServer from 'effect/rpc/RpcServer';
import { afterAll, describe, expect, it } from 'vitest';

import {
  HostCaller,
  HostSession,
} from '@codaco/protocol-builder-core/contract/session';
import { CLIENT_SESSION_HEADER } from '@codaco/studio-contract/client-session';
import {
  ClientSession,
  ClientSessionMiddleware,
} from '@codaco/studio-contract/middleware/client-session';

import type { SessionPrincipal } from '../auth/service.ts';
import { HostSessionLive } from '../protocol-builder/session.ts';
import { ClientSessionMiddlewareLive } from '../rpc/client-session.ts';
import { AuthServiceStub } from './support/auth.ts';

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

// ------------------------------------------------------- HostSession ----

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'client-session-user',
  email: 'client-session@example.com',
  emailVerified: true,
  name: 'Tab Researcher',
  locale: null,
  sessionId: 'client-session-session',
};

const OTHER: SessionPrincipal = {
  ...PRINCIPAL,
  userId: 'client-session-other-user',
  sessionId: 'client-session-other-session',
};

/** Reports the caller `HostSessionLive` resolved, and nothing else. */
const CallerProbe = RpcGroup.make(
  Rpc.make('caller', {
    success: Schema.Struct({
      connectionId: Schema.String,
      clientSessionId: Schema.String,
      userId: Schema.String,
    }),
  }).middleware(HostSession),
);

const CallerHandlers = CallerProbe.toLayer({
  caller: () =>
    Effect.map(HostCaller, ({ connectionId, clientSessionId, userId }) => ({
      connectionId,
      clientSessionId,
      userId,
    })),
});

const callerServed = HttpRouter.toWebHandler(
  RpcServer.layerHttp({
    group: CallerProbe,
    path: '/rpc/protocol-builder',
    protocol: 'http',
  }).pipe(
    Layer.provide(CallerHandlers),
    Layer.provide(HostSessionLive),
    Layer.provide(
      AuthServiceStub({
        getSession: (headers) =>
          Effect.succeed(
            headers.cookie === 'session=principal'
              ? Option.some(PRINCIPAL)
              : headers.cookie === 'session=other'
                ? Option.some(OTHER)
                : Option.none(),
          ),
      }),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
  ),
  { disableLogger: true },
);

/** The caller a unary request resolves to, as the probe reports it. */
async function callerOverHttp(
  headers: Record<string, string>,
  messageHeaders: ReadonlyArray<readonly [string, string]> = [],
): Promise<unknown> {
  const response = await callerServed.handler(
    new Request('http://studio.test/rpc/protocol-builder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/ndjson', ...headers },
      body: `${JSON.stringify({
        _tag: 'Request',
        id: 1,
        tag: 'caller',
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
  if (!Predicate.hasProperty(exit, 'exit')) {
    throw new Error(`no Exit frame in ${JSON.stringify(frames)}`);
  }
  return exit.exit;
}

describe('the caller behind a protocol-builder call', () => {
  it('names the tab the request carried', async () => {
    expect(
      await callerOverHttp({
        cookie: 'session=principal',
        [CLIENT_SESSION_HEADER]: TAB,
      }),
    ).toEqual({
      _tag: 'Success',
      value: {
        // No socket: the connection is the cookie session.
        connectionId: PRINCIPAL.sessionId,
        clientSessionId: TAB,
        userId: PRINCIPAL.userId,
      },
    });
  });

  it('falls back to the connection for a request that named no usable tab', async () => {
    const unnamed: ReadonlyArray<Record<string, string>> = [
      {},
      { [CLIENT_SESSION_HEADER]: REJECTED },
    ];
    for (const named of unnamed) {
      expect(
        await callerOverHttp({ cookie: 'session=principal', ...named }),
      ).toMatchObject({
        _tag: 'Success',
        value: { clientSessionId: PRINCIPAL.sessionId },
      });
    }
  });

  it('never lets a message name the caller or its tab', async () => {
    // `RpcServer` merges a message's own headers over the request's, so a
    // middleware reading the merged set would let a caller present another
    // cookie, or name another tab as the owner of a lock. Mutation: read
    // `options.headers` in `HostSessionLive` → the message's cookie and tab
    // win.
    const otherTab = randomUUID();
    expect(
      await callerOverHttp(
        { cookie: 'session=principal', [CLIENT_SESSION_HEADER]: TAB },
        [
          ['cookie', 'session=other'],
          [CLIENT_SESSION_HEADER, otherTab],
        ],
      ),
    ).toMatchObject({
      _tag: 'Success',
      value: { clientSessionId: TAB, userId: PRINCIPAL.userId },
    });
    // And a request with no cookie stays unauthenticated, whatever the message
    // carries.
    expect(
      await callerOverHttp({}, [['cookie', 'session=principal']]),
    ).toMatchObject({
      _tag: 'Failure',
      cause: [{ _tag: 'Fail', error: { _tag: 'HostUnauthorized' } }],
    });
  });
});

afterAll(async () => {
  await probeServed.dispose();
  await callerServed.dispose();
});
