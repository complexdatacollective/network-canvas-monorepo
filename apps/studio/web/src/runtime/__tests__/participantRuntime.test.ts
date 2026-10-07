import { Predicate } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { PARTICIPANT_SESSION_HEADER } from '@codaco/studio-contract/middleware/session';
import { LinkToken } from '@codaco/studio-contract/schema/ids';

import { installFetchStub, requestUrl } from '../../test/fetchStub.ts';
import {
  participantCall,
  participantUnloadingAnalytics,
  participantUnloadingSync,
} from '../participantRpc.ts';
import { setParticipantSessionToken } from '../participantRuntime.ts';

const fetchStub = installFetchStub();

const answerEmptyOk = () => {
  fetchStub.mockImplementation(() =>
    Promise.resolve(new Response('', { status: 200 })),
  );
};

const lastInit = (): RequestInit => {
  const call = fetchStub.mock.calls.at(-1);
  if (call === undefined) throw new Error('fetch was not called');
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

const ignore = (): undefined => undefined;

const syncPayload = (attributes: Record<string, unknown>) => ({
  holderEpoch: 1,
  revision: '2',
  stageIndex: 0,
  stageId: null,
  network: {
    nodes: [],
    edges: [],
    ego: { _uid: 'ego', attributes },
  },
  stageMetadata: {},
});

afterEach(() => {
  setParticipantSessionToken(null);
});

describe('the participant runtime', () => {
  it('posts to /rpc without cookies', async () => {
    answerEmptyOk();

    await participantCall('participant.redeem', {
      linkToken: LinkToken.make('l'.repeat(32)),
    }).then(ignore, ignore);

    expect(requestUrl(fetchStub.mock.calls[0]?.[0] ?? '')).toContain('/rpc');
    expect(lastInit().credentials).toBe('omit');
  });

  it('stamps the session header only once a session is held', async () => {
    answerEmptyOk();

    await participantCall('participant.redeem', {
      linkToken: LinkToken.make('l'.repeat(32)),
    }).then(ignore, ignore);
    expect(headerOf(lastInit(), PARTICIPANT_SESSION_HEADER)).toBeUndefined();

    setParticipantSessionToken('s'.repeat(32));
    await participantCall('participant.session', { holderId: 'holder' }).then(
      ignore,
      ignore,
    );
    expect(headerOf(lastInit(), PARTICIPANT_SESSION_HEADER)).toBe(
      's'.repeat(32),
    );
    expect(lastInit().keepalive).not.toBe(true);
  });

  it('sends an unloading save with keepalive, still without cookies', async () => {
    answerEmptyOk();
    setParticipantSessionToken('s'.repeat(32));

    await participantUnloadingSync(syncPayload({})).then(ignore, ignore);

    expect(lastInit().keepalive).toBe(true);
    expect(lastInit().credentials).toBe('omit');
    expect(headerOf(lastInit(), PARTICIPANT_SESSION_HEADER)).toBe(
      's'.repeat(32),
    );
  });

  it('drops keepalive for a save too large for it to carry', async () => {
    answerEmptyOk();
    setParticipantSessionToken('s'.repeat(32));

    await participantUnloadingSync(
      syncPayload({ notes: 'x'.repeat(70_000) }),
    ).then(ignore, ignore);

    expect(lastInit().keepalive).toBe(false);
    expect(lastInit().credentials).toBe('omit');
  });

  it('sends a small leave-time analytics batch with keepalive', async () => {
    answerEmptyOk();
    setParticipantSessionToken('s'.repeat(32));

    await participantUnloadingAnalytics({
      events: [
        {
          event: 'stage_exited',
          properties: { stage_index: 1 },
          timestamp: '2026-10-07T09:00:00.000Z',
        },
      ],
    }).then(ignore, ignore);

    expect(lastInit().keepalive).toBe(true);
    expect(lastInit().credentials).toBe('omit');
  });

  it('leaves the keepalive budget to answers for a larger analytics batch', async () => {
    answerEmptyOk();
    setParticipantSessionToken('s'.repeat(32));

    await participantUnloadingAnalytics({
      events: Array.from({ length: 4 }, () => ({
        event: 'stage_exited',
        properties: { padding: 'x'.repeat(1_500) },
        timestamp: '2026-10-07T09:00:00.000Z',
      })),
    }).then(ignore, ignore);

    expect(lastInit().keepalive).toBe(false);
  });
});
