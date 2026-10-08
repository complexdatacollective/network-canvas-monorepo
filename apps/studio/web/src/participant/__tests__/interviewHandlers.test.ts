import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionSnapshot } from '@codaco/interview/contract';
import { RateLimited } from '@codaco/studio-contract/schema/errors';
import {
  LinkUnavailable,
  SessionOutOfDate,
  SessionTakenOver,
} from '@codaco/studio-contract/schema/participant';

import { installParticipantHarness } from '../../test/participantHarness.ts';
import {
  createParticipantHandlers,
  pageRevisionBase,
} from '../interviewHandlers.ts';

const session = (name: string): SessionSnapshot => ({
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
  localePreference: null,
  locale: null,
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

const savedName = (payload: unknown): unknown =>
  (payload as { network: SessionSnapshot['network'] }).network.ego.attributes
    .name;

afterEach(() => {
  vi.useRealTimers();
});

describe('the participant sync handler', () => {
  it('numbers each save from the stored revision and records the current stage', async () => {
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision, applied: true }),
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
        Effect.succeed({ revision: payload.revision, applied: true }),
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
          : Effect.succeed({ revision: payload.revision, applied: true });
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
        Effect.succeed(
          payload.revision === '8'
            ? { revision: '12', applied: false }
            : { revision: payload.revision, applied: true },
        ),
    });
    const { onSync } = handlersFor();

    await onSync('session-1', session('Ada'), SYNC);

    expect(
      harness.calls.map(({ payload }) =>
        Reflect.get(Object(payload), 'revision'),
      ),
    ).toEqual(['8', '13']);
  });

  it('saves again when the server already holds another page’s save at this number', async () => {
    // The page this one reloaded saved revision 8 as it unloaded, after this
    // page read revision 7, so this page's first save is a replay.
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed(
          payload.revision === '8'
            ? { revision: '8', applied: false }
            : { revision: payload.revision, applied: true },
        ),
      'participant.finish': () => Effect.succeed({ state: 'completed' }),
    });
    const { onSync, onFinish } = handlersFor();

    await onSync('session-1', session('Ada'), SYNC);
    await onFinish('session-1', new AbortController().signal);

    expect(harness.calls.map(({ tag, payload }) => [tag, payload])).toEqual([
      ['participant.sync', expect.objectContaining({ revision: '8' })],
      [
        'participant.sync',
        expect.objectContaining({
          revision: '9',
          network: session('Ada').network,
        }),
      ],
      ['participant.finish', { holderEpoch: 3, revision: '9' }],
    ]);
  });

  it('ends with its newest answers when its own later save overtook an older one', async () => {
    let releaseFirst: () => void = () => undefined;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        payload.revision === '8'
          ? Effect.promise(() => firstHeld).pipe(
              Effect.as({ revision: '9', applied: false }),
            )
          : Effect.succeed({ revision: payload.revision, applied: true }),
    });
    const { onSync } = handlersFor();

    const first = onSync('session-1', session('Ada'), SYNC);
    await vi.waitFor(() => expect(harness.calls).toHaveLength(1));
    // The tab is hidden while the first save is on the wire: its unloading
    // save, numbered 9, lands first.
    await onSync('session-1', session('Grace'), {
      immediate: true,
      unloading: true,
    });
    releaseFirst();
    await first;

    expect(
      harness.calls.map(({ payload }) => [
        Reflect.get(Object(payload), 'revision'),
        savedName(payload),
      ]),
    ).toEqual([
      ['8', 'Ada'],
      ['9', 'Grace'],
      ['10', 'Grace'],
    ]);
  });

  it('resends past the reloaded page’s saves, whichever numbers they took', async () => {
    // The page before the reload had saves 8 and 9 on the wire when this page
    // read revision 7; both landed before this page's first save.
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Number(payload.revision) <= 9
          ? Effect.succeed({ revision: '9', applied: false })
          : Effect.succeed({ revision: payload.revision, applied: true }),
    });
    const { onSync } = handlersFor();

    await onSync('session-1', session('Ada'), SYNC);
    await onSync('session-1', session('Grace'), {
      immediate: true,
      unloading: true,
    });

    expect(
      harness.calls.map(({ payload }) => [
        Reflect.get(Object(payload), 'revision'),
        savedName(payload),
      ]),
    ).toEqual([
      ['8', 'Ada'],
      ['10', 'Ada'],
      ['11', 'Grace'],
    ]);
  });

  it('resends a save made as the page goes when the server did not apply it', async () => {
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        payload.revision === '8'
          ? Effect.succeed({ revision: '9', applied: false })
          : Effect.succeed({ revision: payload.revision, applied: true }),
    });
    const { onSync } = handlersFor();

    await onSync('session-1', session('Ada'), {
      immediate: true,
      unloading: true,
    });

    expect(
      harness.calls.map(({ payload }) => [
        Reflect.get(Object(payload), 'revision'),
        savedName(payload),
      ]),
    ).toEqual([
      ['8', 'Ada'],
      ['10', 'Ada'],
    ]);
  });

  it('fails a save the server keeps refusing, so the runtime offers it again', async () => {
    installParticipantHarness({
      'participant.sync': () =>
        Effect.succeed({ revision: '99', applied: false }),
    });
    const { onSync } = handlersFor();

    await expect(onSync('session-1', session('Ada'), SYNC)).rejects.toThrow(
      'kept another save',
    );
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
        Effect.succeed({ revision: payload.revision, applied: true }),
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
        (payload as { network: SessionSnapshot['network'] }).network.ego
          .attributes.name,
    );

  it('saves the answer still waiting out the debounce when the participant moves on', async () => {
    vi.useFakeTimers();
    let step = 0;
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision, applied: true }),
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
        Effect.succeed({ revision: payload.revision, applied: true }),
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

describe('the participant stage flush', () => {
  const stepHandlers = () => {
    let step = 0;
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision, applied: true }),
      'participant.finish': () => Effect.succeed({ state: 'completed' }),
    });
    const handlers = createParticipantHandlers({
      holderEpoch: 3,
      revision: '7',
      session: session('Initial'),
      stageIds: ['first', 'second'],
      getCurrentStep: () => step,
      onNotice: vi.fn(),
    });
    return {
      ...handlers,
      harness,
      moveTo: (next: number) => {
        step = next;
      },
    };
  };

  it('sends the stage reached as the page goes when no save holds it', async () => {
    vi.useFakeTimers();
    const { onSync, saveStep, flushStep, harness, moveTo } = stepHandlers();
    await onSync('session-1', session('Ada'), SYNC);
    // Moving on inside the debounce window: the stage save waits.
    moveTo(1);
    saveStep();
    flushStep();
    await vi.waitFor(() => expect(harness.calls).toHaveLength(2));

    expect(harness.calls.at(-1)?.payload).toEqual(
      expect.objectContaining({ stageIndex: 1, stageId: 'second' }),
    );
  });

  it('saves the stage reached before finishing when its save is still waiting', async () => {
    vi.useFakeTimers();
    const { onSync, saveStep, onFinish, harness, moveTo } = stepHandlers();
    await onSync('session-1', session('Ada'), SYNC);
    // On to the runtime's finish stage inside the debounce window, changing
    // no answer, and straight to Finish.
    moveTo(2);
    saveStep();
    await onFinish('session-1', new AbortController().signal);

    expect(harness.calls.map(({ tag, payload }) => [tag, payload])).toEqual([
      ['participant.sync', expect.objectContaining({ revision: '8' })],
      [
        'participant.sync',
        expect.objectContaining({ revision: '9', stageIndex: 2 }),
      ],
      ['participant.finish', { holderEpoch: 3, revision: '9' }],
    ]);
  });

  it('sends nothing as the page goes once the stage reached is saved', async () => {
    const { onSync, flushStep, harness, moveTo } = stepHandlers();
    moveTo(1);
    await onSync('session-1', session('Ada'), SYNC);

    flushStep();
    await vi.waitFor(() => expect(harness.calls).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.calls).toHaveLength(1);
  });
});

describe('the participant page’s save numbers', () => {
  const numbered = (numberSavesFrom: bigint) =>
    createParticipantHandlers({
      holderEpoch: 3,
      revision: '7',
      session: session('Initial'),
      stageIds: ['first', 'second'],
      getCurrentStep: () => 1,
      onNotice: vi.fn(),
      numberSavesFrom,
    });

  it('outranks the page it reloaded from its first save as the page goes', async () => {
    // The page before the reload left saves 8 and 9; this page loaded at 7.
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        BigInt(payload.revision) <= 9n
          ? Effect.succeed({ revision: '9', applied: false })
          : Effect.succeed({ revision: payload.revision, applied: true }),
    });
    const { onSync } = numbered(5000n);

    await onSync('session-1', session('Ada'), {
      immediate: true,
      unloading: true,
    });

    // One request: nothing has to run after the page has gone.
    expect(
      harness.calls.map(({ payload }) =>
        Reflect.get(Object(payload), 'revision'),
      ),
    ).toEqual(['5000']);
  });

  it('finishes at the revision the server holds, not the next number', async () => {
    const harness = installParticipantHarness({
      'participant.finish': () => Effect.succeed({ state: 'completed' }),
    });
    const { onFinish } = numbered(5000n);

    await onFinish('session-1', new AbortController().signal);

    expect(harness.calls).toEqual([
      { tag: 'participant.finish', payload: { holderEpoch: 3, revision: '7' } },
    ]);
  });

  it('gives a later page numbers past any an earlier page could have used', () => {
    expect(pageRevisionBase(1_001)).toBeGreaterThan(
      pageRevisionBase(1_000) + 999n,
    );
  });
});

describe('the participant finish handler', () => {
  const signal = new AbortController().signal;

  it('finishes at the last revision it saved, then shows the finished notice', async () => {
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision, applied: true }),
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
          : Effect.succeed({ revision: payload.revision, applied: true }),
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
      // The save at 8 was refused, so the server still holds 7.
      ['participant.finish', { holderEpoch: 3, revision: '7' }],
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

  it('stops when the participant cancels while the finish is on the wire', async () => {
    const harness = installParticipantHarness({
      'participant.sync': (payload) =>
        Effect.succeed({ revision: payload.revision, applied: true }),
      'participant.finish': () => Effect.never,
    });
    const { onSync, onFinish, onNotice } = handlersFor();
    const cancel = new AbortController();

    await onSync('session-1', session('Ada'), SYNC);
    const finishing = onFinish('session-1', cancel.signal);
    await vi.waitFor(() => expect(harness.calls).toHaveLength(2));
    cancel.abort();

    await expect(finishing).rejects.toMatchObject({ name: 'AbortError' });
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('does not finish again after a resend the participant cancelled', async () => {
    const cancel = new AbortController();
    const harness = installParticipantHarness({
      'participant.sync': (payload) => {
        if (payload.revision === '9') cancel.abort();
        return Effect.succeed({ revision: payload.revision, applied: true });
      },
      'participant.finish': () =>
        Effect.fail(new SessionOutOfDate({ revision: '7' })),
    });
    const { onSync, onFinish, onNotice } = handlersFor();

    await onSync('session-1', session('Ada'), SYNC);
    await expect(onFinish('session-1', cancel.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    expect(harness.calls.map(({ tag }) => tag)).toEqual([
      'participant.sync',
      'participant.finish',
      'participant.sync',
    ]);
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('shows the finished notice when the interview was already finished', async () => {
    installParticipantHarness({
      'participant.finish': () =>
        Effect.fail(new LinkUnavailable({ state: 'finished' })),
    });
    const { onFinish, onNotice } = handlersFor();

    await expect(onFinish('session-1', signal)).resolves.toBeUndefined();

    expect(onNotice).toHaveBeenCalledWith('finished');
  });

  it('shows the refusal and rejects, so the runtime does not count a finish', async () => {
    installParticipantHarness({
      'participant.finish': () =>
        Effect.fail(new SessionTakenOver({ holderEpoch: 3 })),
    });
    const { onFinish, onNotice } = handlersFor();

    await expect(onFinish('session-1', signal)).rejects.toBeInstanceOf(
      SessionTakenOver,
    );
    expect(onNotice).toHaveBeenCalledWith('takenOver');
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
