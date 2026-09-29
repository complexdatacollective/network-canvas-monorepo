import { Effect, ManagedRuntime, Predicate } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLIENT_SESSION_HEADER,
  CLIENT_SESSION_PARAM,
} from '@codaco/studio-contract/client-session';
import { TeamId } from '@codaco/studio-contract/schema/ids';

import { clientSessionId } from '../../lib/clientSession.ts';
import { installFetchStub, requestUrl } from '../../test/fetchStub.ts';
import { FakeWebSocket } from '../../test/hostHarness.ts';
import { endHostSession, hostRuntime } from '../hostSession.ts';
import {
  rpcCall,
  rpcInfiniteQuery,
  rpcKey,
  rpcMutation,
  rpcQuery,
  useRpcStream,
} from '../rpc.ts';
import { getWebRuntime, HostClient, WebLayer } from '../runtime.ts';

// The transport, through a stubbed `fetch`. What is being proved is what every
// `/rpc` request carries rather than what any procedure answers, so the stub's
// reply here is deliberately useless and every call below is expected to
// reject; the refusal suite is where an answer is the subject.

const fetchStub = installFetchStub();

/** An answer the rpc parser cannot make sense of: the request is the subject. */
const answerEmptyOk = () => {
  fetchStub.mockImplementation(() =>
    Promise.resolve(new Response('', { status: 200 })),
  );
};

const callStatus = async (): Promise<void> => {
  await rpcCall('status', undefined).then(
    () => undefined,
    () => undefined,
  );
};

const initOf = (call: Parameters<typeof globalThis.fetch>): RequestInit => {
  const init = call[1];
  if (init === undefined) throw new Error('fetch was called with no init');
  return init;
};

const headerOf = (init: RequestInit, name: string): string | undefined => {
  const { headers } = init;
  if (!Predicate.isObject(headers)) return undefined;
  const value = Predicate.hasProperty(headers, name)
    ? headers[name]
    : undefined;
  return Predicate.isString(value) ? value : undefined;
};

const firstCall = (): Parameters<typeof globalThis.fetch> => {
  const call = fetchStub.mock.calls[0];
  if (call === undefined) throw new Error('fetch was not called');
  return call;
};

describe('the web runtime', () => {
  // First in the file on purpose: the runtime is a module singleton, and the
  // claim is about the state it is in before anything has asked it for
  // anything — a signed-out visitor on a marketing page pays for no transport.
  // Mutation: build the layer at module load in runtime.ts (a `runSync` of the
  // client) and `cachedContext` is populated here.
  it('builds nothing until the first call', async () => {
    expect(getWebRuntime().cachedContext).toBeUndefined();

    // And for a runtime built here, so the claim does not rest on this file
    // having been the first to import the module.
    const idle = ManagedRuntime.make(WebLayer);
    expect(idle.cachedContext).toBeUndefined();
    expect(fetchStub).not.toHaveBeenCalled();
    await idle.dispose();
  });

  it('posts to /rpc', async () => {
    answerEmptyOk();

    await callStatus();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(requestUrl(firstCall()[0])).toContain('/rpc');
    expect(initOf(firstCall()).method).toBe('POST');
  });

  it('names this tab on every request', async () => {
    // `lib/api.ts:20-23`'s reason, kept: the server derives a protocol-builder
    // lock's owner from this header, so a call that omitted it would be a
    // stranger to the section this tab is holding. It rides on the transport
    // rather than at the call sites precisely so that none of them can forget.
    answerEmptyOk();

    await callStatus();
    await callStatus();

    expect(fetchStub).toHaveBeenCalledTimes(2);
    for (const call of fetchStub.mock.calls) {
      expect(headerOf(initOf(call), CLIENT_SESSION_HEADER)).toBe(
        clientSessionId(),
      );
    }
  });

  it('sends the session cookie, and accepts one back', async () => {
    // `same-origin` rather than `include`: the SPA is same-origin with the API
    // in every topology. It is also what lets first-run setup's `Set-Cookie`
    // land, which is the only thing that makes that new session visible.
    answerEmptyOk();

    await callStatus();

    expect(initOf(firstCall()).credentials).toBe('same-origin');
  });
});

describe('the adapter bound to that runtime', () => {
  const TEAM = TeamId.make('team-under-test');

  it('derives a key that a tag-wide invalidation reaches', () => {
    // The property every screen's invalidation rests on: the tag-only key is a
    // prefix of the key any payload produces, so
    // `invalidateQueries({ queryKey: rpcKey('studies.list') })` refetches the
    // list for every team it is holding rather than one chosen payload's.
    expect(rpcKey('me')).toEqual(['rpc', 'me']);
    expect(rpcKey('studies.list', { teamId: TEAM })).toEqual([
      'rpc',
      'studies.list',
      { teamId: TEAM },
    ]);
    expect(rpcQuery('studies.list', { teamId: TEAM }).queryKey).toEqual(
      rpcKey('studies.list', { teamId: TEAM }),
    );
    expect(rpcMutation('studies.create').mutationKey).toEqual([
      'rpc',
      'studies.create',
    ]);
    expect(
      rpcInfiniteQuery(
        'audit.list',
        { teamId: TEAM },
        { getNextCursor: (page) => page.nextCursor ?? undefined },
      ).queryKey,
    ).toEqual(['rpc', 'audit.list', { teamId: TEAM }]);
  });

  it('binds all six members', () => {
    // The destructuring in `runtime/rpc.ts` is what the screens import; a
    // member left out of it is a screen that cannot be written.
    expect(
      [
        rpcKey,
        rpcCall,
        rpcQuery,
        rpcInfiniteQuery,
        rpcMutation,
        useRpcStream,
      ].map((member) => typeof member),
    ).toEqual(Array.from({ length: 6 }, () => 'function'));
  });
});

describe('the protocol builder host’s socket', () => {
  /** A host call nothing answers: what is being proved is what it opens. */
  const callTheHost = (): void => {
    void hostRuntime
      .runPromise(
        Effect.flatMap(HostClient, (client) =>
          client('ListSections', { protocolId: 'protocol-under-test' }),
        ),
      )
      .catch(() => undefined);
  };

  const firstSocket = async (): Promise<FakeWebSocket> => {
    await vi.waitFor(() => expect(FakeWebSocket.opened).toHaveLength(1));
    const socket = FakeWebSocket.opened[0];
    if (socket === undefined) throw new Error('no socket was opened');
    return socket;
  };

  beforeEach(() => {
    FakeWebSocket.opened = [];
    FakeWebSocket.openImmediately = true;
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(async () => {
    await endHostSession();
    vi.unstubAllGlobals();
  });

  it('is not opened until the first host call, whatever else the tab asks', async () => {
    // A signed-out visitor's page still asks Studio things — its status, the
    // session — and none of that may dial the editor's socket. Mutation: merge
    // `HostClient.layer` into `WebLayer`, and the Studio call below opens one.
    answerEmptyOk();
    await callStatus();
    expect(fetchStub).toHaveBeenCalledTimes(1);

    const idle = ManagedRuntime.make(HostClient.layer);
    expect(idle.cachedContext).toBeUndefined();
    await idle.dispose();
    // A built layer dials from a fiber it forks, so give one the time to.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(FakeWebSocket.opened).toEqual([]);

    callTheHost();
    await firstSocket();
  });

  it('names this tab on the upgrade URL', async () => {
    // The id this tab presents everywhere else, not one minted for the socket:
    // a second id would be a second lock owner, and the section this tab is
    // holding would be somebody else's the moment it reconnected.
    callTheHost();
    const url = new URL((await firstSocket()).url);

    expect(url.pathname).toBe('/ws');
    expect(url.searchParams.get(CLIENT_SESSION_PARAM)).toBe(clientSessionId());
    expect(clientSessionId()).not.toBe('');
  });

  it('frames its calls in binary, as `/ws` expects', async () => {
    // The server's `/ws` reads `layerSchemaBinary` frames, so a client on
    // `layerJson` would put text frames on a socket that cannot read them.
    callTheHost();
    const socket = await firstSocket();

    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(0));
    for (const frame of socket.sent) {
      expect(frame).toBeInstanceOf(Uint8Array);
    }
  });
});
