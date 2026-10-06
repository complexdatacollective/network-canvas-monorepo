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
import { HostClient } from '../hostClient.ts';
import { endHostSession, hostRuntime } from '../hostSession.ts';
import {
  rpcCall,
  rpcInfiniteQuery,
  rpcKey,
  rpcMutation,
  rpcQuery,
  useRpcStream,
} from '../rpc.ts';
import { getWebRuntime, WebLayer } from '../runtime.ts';

const fetchStub = installFetchStub();

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
  // First in the file on purpose: the runtime is a module singleton.
  it('builds nothing until the first call', async () => {
    expect(getWebRuntime().cachedContext).toBeUndefined();

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

  it('does not name this tab on a /rpc request', async () => {
    answerEmptyOk();

    await callStatus();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(headerOf(initOf(firstCall()), 'content-type')).toBeDefined();
    expect(
      headerOf(initOf(firstCall()), CLIENT_SESSION_HEADER),
    ).toBeUndefined();
  });

  it('sends the session cookie, and accepts one back', async () => {
    answerEmptyOk();

    await callStatus();

    expect(initOf(firstCall()).credentials).toBe('same-origin');
  });
});

describe('the adapter bound to that runtime', () => {
  const TEAM = TeamId.make('team-under-test');

  it('derives a key that a tag-wide invalidation reaches', () => {
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
    callTheHost();
    const url = new URL((await firstSocket()).url);

    expect(url.pathname).toBe('/ws');
    expect(url.searchParams.get(CLIENT_SESSION_PARAM)).toBe(clientSessionId());
    expect(clientSessionId()).not.toBe('');
  });

  it('frames its calls in binary, as `/ws` expects', async () => {
    callTheHost();
    const socket = await firstSocket();

    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(0));
    for (const frame of socket.sent) {
      expect(frame).toBeInstanceOf(Uint8Array);
    }
  });
});
