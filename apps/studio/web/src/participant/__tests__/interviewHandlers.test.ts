import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionPayload } from '@codaco/interview/contract';
import { RateLimited } from '@codaco/studio-contract/schema/errors';
import {
  LinkUnavailable,
  SessionOutOfDate,
  SessionTakenOver,
} from '@codaco/studio-contract/schema/participant';

import { installParticipantHarness } from '../../test/participantHarness.ts';
import { createParticipantHandlers } from '../interviewHandlers.ts';

const session = (name: string): SessionPayload => ({
  id: 'session-1',
  startTime: '2026-01-01T00:00:00.000Z',
  finishTime: null,
  exportTime: null,
  lastUpdated: '2026-01-01T00:00:00.000Z',
  network: {
    ego: { _uid: 'ego-1', attributes: { name }, _secureAttributes: undefined },
    nodes: [
      {
        _uid: 'node-1',
        type: 'person',
        attributes: { name },
        stageId: 'second',
        promptIDs: [],
        _secureAttributes: undefined,
      },
    ],
    edges: [],
  },
  stageMetadata: {},
});

const handlersFor = (step = 1) => {
  const onNotice = vi.fn();
  const handlers = createParticipantHandlers({
    holderEpoch: 3,
    revision: '7',
    session: session('Initial'),
    stageIds: ['first', 'second'],
    getCurrentStep: () => step,
    onNotice,
  });
  return { ...handlers, onNotice };
};

const SYNC = { immediate: true, unloading: false };

afterEach(() => {
  vi.useRealTimers();
});

describe('the participant sync handler', () => {
  it('numbers each save from the stored revision and records the current stage', async () => {
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision }),
    });
    const { onSync } = handlersFor();

    await onSync('session-1', session('Ada'), SYNC);
    await onSync('session-1', session('Grace'), SYNC);

    expect(harness.calls).toEqual([
      {
        tag: 'participant.sync',
        payload: expect.objectContaining({
          holderEpoch: 3,
          revision: '8',
          stageIndex: 1,
          stageId: 'second',
        }),
      },
      {
        tag: 'participant.sync',
        payload: expect.objectContaining({ revision: '9' }),
      },
    ]);
  });

  it('records no stage id on the runtime’s own finish stage', async () => {
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision }),
    });
    const { onSync } = handlersFor(2);

    await onSync('session-1', session('Ada'), SYNC);

    expect(harness.calls[0]?.payload).toEqual(
      expect.objectContaining({ stageIndex: 2, stageId: null }),
    );
  });

  it('waits out a rate limit and retries the same revision', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const harness = installParticipantHarness({
      'participant.sync': (payload) => {
        attempts += 1;
        return attempts === 1
          ? Effect.fail(new RateLimited({ retryAfterSeconds: 2 }))
          : Effect.succeed({ revision: payload.revision });
      },
    });
    const { onSync, onNotice } = handlersFor();

    const saved = onSync('session-1', session('Ada'), SYNC);
    await vi.advanceTimersByTimeAsync(2000);
    await saved;

    expect(
      harness.calls.map(({ payload }) =>
        Reflect.get(Object(payload), 'revision'),
      ),
    ).toEqual(['8', '8']);
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('shows the taken-over notice when another page holds the session', async () => {
    installParticipantHarness({
      'participant.sync': () =>
        Effect.fail(new SessionTakenOver({ holderEpoch: 4 })),
    });
    const { onSync, onNotice } = handlersFor();

    await expect(
      onSync('session-1', session('Ada'), SYNC),
    ).rejects.toBeInstanceOf(SessionTakenOver);
    expect(onNotice).toHaveBeenCalledWith('takenOver');
  });

  it('shows the link notice when the study stops taking answers', async () => {
    installParticipantHarness({
      'participant.sync': () =>
        Effect.fail(new LinkUnavailable({ state: 'paused' })),
    });
    const { onSync, onNotice } = handlersFor();

    await expect(
      onSync('session-1', session('Ada'), SYNC),
    ).rejects.toBeInstanceOf(LinkUnavailable);
    expect(onNotice).toHaveBeenCalledWith('paused');
  });
});

describe('the participant sync handler’s recovery', () => {
  it('saves again past the server when an earlier page left it ahead', async () => {
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({
          revision: payload.revision === '8' ? '12' : payload.revision,
        }),
    });
    const { onSync } = handlersFor();

    await onSync('session-1', session('Ada'), SYNC);

    expect(
      harness.calls.map(({ payload }) =>
        Reflect.get(Object(payload), 'revision'),
      ),
    ).toEqual(['8', '13']);
  });

  it('gives up on a rate limit after three attempts', async () => {
    vi.useFakeTimers();
    const harness = installParticipantHarness({
      'participant.sync': () =>
        Effect.fail(new RateLimited({ retryAfterSeconds: 1 })),
    });
    const { onSync, onNotice } = handlersFor();

    const saved = onSync('session-1', session('Ada'), SYNC);
    const refused = expect(saved).rejects.toBeInstanceOf(RateLimited);
    await vi.advanceTimersByTimeAsync(5000);
    await refused;

    expect(harness.calls).toHaveLength(3);
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('does not wait out a rate limit longer than a minute', async () => {
    const harness = installParticipantHarness({
      'participant.sync': () =>
        Effect.fail(new RateLimited({ retryAfterSeconds: 600 })),
    });
    const { onSync } = handlersFor();

    await expect(
      onSync('session-1', session('Ada'), SYNC),
    ).rejects.toBeInstanceOf(RateLimited);
    expect(harness.calls).toHaveLength(1);
  });

  it('saves nothing more once a notice has replaced the interview', async () => {
    const harness = installParticipantHarness({
      'participant.sync': () =>
        Effect.fail(new SessionTakenOver({ holderEpoch: 4 })),
    });
    const { onSync } = handlersFor();

    await expect(
      onSync('session-1', session('Ada'), SYNC),
    ).rejects.toBeDefined();
    await onSync('session-1', session('Grace'), SYNC);

    expect(harness.calls).toHaveLength(1);
  });

  it('saves the stage reached when the participant moves on', async () => {
    let step = 0;
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision }),
    });
    const { saveStep } = createParticipantHandlers({
      holderEpoch: 3,
      revision: '7',
      session: session('Initial'),
      stageIds: ['first', 'second'],
      getCurrentStep: () => step,
      onNotice: vi.fn(),
    });

    step = 1;
    saveStep();

    await vi.waitFor(() => {
      expect(harness.calls[0]?.payload).toEqual(
        expect.objectContaining({
          revision: '8',
          stageIndex: 1,
          stageId: 'second',
          network: session('Initial').network,
        }),
      );
    });
  });
});

describe('the participant sync handler’s own saves', () => {
  const ORDINARY = { immediate: false, unloading: false };
  const savedNames = (calls: ReadonlyArray<{ readonly payload: unknown }>) =>
    calls.map(
      ({ payload }) =>
        (payload as { network: SessionPayload['network'] }).network.ego
          .attributes.name,
    );

  it('saves the answer still waiting out the debounce when the participant moves on', async () => {
    vi.useFakeTimers();
    let step = 0;
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision }),
    });
    const { onSync, saveStep } = createParticipantHandlers({
      holderEpoch: 3,
      revision: '7',
      session: session('Initial'),
      stageIds: ['first', 'second'],
      getCurrentStep: () => step,
      onNotice: vi.fn(),
    });

    await onSync('session-1', session('Ada'), SYNC);
    // Changed inside the debounce window, so it waits.
    const grace = onSync('session-1', session('Grace'), ORDINARY);
    step = 1;
    saveStep();
    await vi.advanceTimersByTimeAsync(3000);
    await grace;

    expect(savedNames(harness.calls)).toEqual(['Ada', 'Grace']);
    expect(harness.calls.at(-1)?.payload).toEqual(
      expect.objectContaining({ stageIndex: 1, stageId: 'second' }),
    );
  });

  it('saves the answer still waiting out the debounce when the server is behind at finish', async () => {
    vi.useFakeTimers();
    let finishes = 0;
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision }),
      'participant.finish': () => {
        finishes += 1;
        return finishes === 1
          ? Effect.fail(new SessionOutOfDate({ revision: '8' }))
          : Effect.succeed({ state: 'completed' });
      },
    });
    const { onSync, onFinish } = handlersFor();

    await onSync('session-1', session('Ada'), SYNC);
    void onSync('session-1', session('Grace'), ORDINARY).catch(() => undefined);
    await onFinish('session-1', new AbortController().signal);

    expect(
      savedNames(harness.calls.filter(({ tag }) => tag === 'participant.sync')),
    ).toEqual(['Ada', 'Grace']);
  });
});

describe('the participant finish handler', () => {
  const signal = new AbortController().signal;

  it('finishes at the last revision it saved, then shows the finished notice', async () => {
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision }),
      'participant.finish': () => Effect.succeed({ state: 'completed' }),
    });
    const { onSync, onFinish, onNotice } = handlersFor();

    await onSync('session-1', session('Ada'), SYNC);
    await onFinish('session-1', signal);

    expect(harness.calls.at(-1)).toEqual({
      tag: 'participant.finish',
      payload: { holderEpoch: 3, revision: '8' },
    });
    expect(onNotice).toHaveBeenCalledWith('finished');
  });

  it('saves the latest answers again when the server is behind, then finishes', async () => {
    let finishes = 0;
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        payload.revision === '8'
          ? Effect.fail(new RateLimited({ retryAfterSeconds: 0 }))
          : Effect.succeed({ revision: payload.revision }),
      'participant.finish': () => {
        finishes += 1;
        return finishes === 1
          ? Effect.fail(new SessionOutOfDate({ revision: '7' }))
          : Effect.succeed({ state: 'completed' });
      },
    });
    const { onSync, onFinish, onNotice } = handlersFor();
    vi.useFakeTimers();

    const saved = onSync('session-1', session('Ada'), {
      immediate: true,
      unloading: true,
    });
    await expect(saved).rejects.toBeInstanceOf(RateLimited);
    await onFinish('session-1', signal);

    expect(harness.calls.map(({ tag, payload }) => [tag, payload])).toEqual([
      ['participant.sync', expect.objectContaining({ revision: '8' })],
      ['participant.finish', { holderEpoch: 3, revision: '8' }],
      [
        'participant.sync',
        expect.objectContaining({
          revision: '9',
          network: session('Ada').network,
        }),
      ],
      ['participant.finish', { holderEpoch: 3, revision: '9' }],
    ]);
    expect(onNotice).toHaveBeenCalledWith('finished');
  });

  it('shows the finished notice when the interview was already finished', async () => {
    installParticipantHarness({
      'participant.finish': () =>
        Effect.fail(new LinkUnavailable({ state: 'finished' })),
    });
    const { onFinish, onNotice } = handlersFor();

    await onFinish('session-1', signal);

    expect(onNotice).toHaveBeenCalledWith('finished');
  });

  it('leaves any other failure to the finish dialog', async () => {
    installParticipantHarness({
      'participant.finish': () => Effect.die(new Error('boom')),
    });
    const { onFinish, onNotice } = handlersFor();

    await expect(onFinish('session-1', signal)).rejects.toBeDefined();
    expect(onNotice).not.toHaveBeenCalled();
  });
});
