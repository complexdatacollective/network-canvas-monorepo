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

const TAB = randomUUID();
const REJECTED = 'no';

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
    Layer.provide(RpcSerialization.layerNdjson),
  ),
  { disableLogger: true },
);

async function probeOverHttp(
  headers: Record<string, string>,
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
    const otherTab = randomUUID();
    expect(
      await probeOverHttp({ [CLIENT_SESSION_HEADER]: TAB }, [
        [CLIENT_SESSION_HEADER, otherTab],
      ]),
    ).toBe(TAB);

    expect(
      await probeOverHttp({}, [[CLIENT_SESSION_HEADER, otherTab]]),
    ).toBeNull();
  });

  it('reports no tab for an id the contract rejects', async () => {
    expect(
      await probeOverHttp({ [CLIENT_SESSION_HEADER]: REJECTED }),
    ).toBeNull();
  });
});

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
