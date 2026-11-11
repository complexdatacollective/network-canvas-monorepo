// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  type Finding,
  REVIEW_ERROR_CODES,
  type ReviewEvent,
  type ReviewResult,
} from '@codaco/protocol-review-worker/contract';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { posthog } from '~/analytics';
import { timelineActions } from '~/ducks/middleware/timeline';
import {
  actionCreators,
  setActiveProtocol,
  setProtocolTranslation,
} from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import {
  cancelReview,
  checkFixAvailability,
  decideFinding,
  getProtocolReviewCounts,
  getProtocolReviewFindings,
  getProtocolReviewProgress,
  getProtocolReviewRun,
  getProtocolReviewStartBlock,
  getShareProtocolReviews,
  reviewProgressFraction,
  setShareReviews,
  startReview,
  undoFix,
} from '~/ducks/modules/protocolReview';
import { rootReducer } from '~/ducks/modules/root';
import {
  makeFinding,
  makeProtocol,
  op,
  STUDY_CONTEXT,
} from '~/protocolReview/__tests__/fixtures';
import { keepProtocolReviewOnActiveProtocol } from '~/protocolReview/reviewListener';
import {
  FINDING_DECISIONS,
  readReviewRecord,
} from '~/protocolReview/reviewStore';
import { PROTOCOL_REVIEW_QUOTA_KEY } from '~/utils/storageNames';

vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

const makeStore = () => {
  const created = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  keepProtocolReviewOnActiveProtocol(created);
  return created;
};

type Store = ReturnType<typeof makeStore>;

const FINDINGS: Finding[] = [
  makeFinding(
    'prompt',
    [op('set', '/stages/names/prompts/p1/text', 'Name everyone you know')],
    { stageId: 'names', severity: 'serious', category: 'wording' },
  ),
  makeFinding(
    'title',
    [op('set', '/stages/welcome/title/en', 'Welcome to our study')],
    { stageId: 'welcome', severity: 'suggestion', category: 'burden' },
  ),
  makeFinding('broken', [op('set', '/stages/welcome/type', 'NotAStage')], {
    codebookEntity: 'node',
    codebookTypeId: 'person',
    category: 'structure',
  }),
  makeFinding('advice', [], { category: 'research_fit' }),
];

const RESULT: ReviewResult = {
  reviewId: '0b8f4c1e-9d0a-4a3e-8f8f-1f2e3d4c5b6a',
  findings: FINDINGS,
  quota: { limit: 5, remaining: 4, resetsAt: '2099-01-01T00:00:00.000Z' },
};

/** A streamed answer the test releases event by event. */
const gatedAnswer = () => {
  const encoder = new TextEncoder();
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  let requestBody: unknown;
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
  return {
    fetchImpl,
    requestBody: () => requestBody,
    send: (event: ReviewEvent) =>
      stream?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    finish: (result: ReviewResult = RESULT) => {
      stream?.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'result', result })}\n\n`,
        ),
      );
      stream?.close();
    },
  };
};

const answering = (result: ReviewResult = RESULT) => {
  const answer = gatedAnswer();
  answer.finish(result);
  return answer;
};

let protocolCounter = 0;

/** Opens `protocol` under a fresh library id, as the app does. */
const open = async (
  store: Store,
  protocol: CurrentProtocol = makeProtocol(),
) => {
  protocolCounter += 1;
  const id = `protocol-${protocolCounter}`;
  store.dispatch(setActiveProtocolId(id));
  store.dispatch(setActiveProtocol(protocol));
  await vi.waitFor(() => {
    expect(store.getState().protocolReview.record?.protocolId).toBe(id);
  });
  return id;
};

const protocolOf = (store: Store) => {
  const protocol = store.getState().activeProtocol.present;
  if (!protocol) throw new Error('No protocol open');
  return protocol;
};

const promptText = (store: Store) => {
  const stage = protocolOf(store).stages[1];
  return stage && 'prompts' in stage ? stage.prompts[0]?.text : undefined;
};

const findingOf = (store: Store, id: string) => {
  const finding = getProtocolReviewFindings(store.getState()).find(
    (candidate) => candidate.id === id,
  );
  if (!finding) throw new Error(`No finding ${id}`);
  return finding;
};

/** Opens a protocol and completes a review of it. */
const reviewed = async (store: Store) => {
  const id = await open(store);
  vi.stubGlobal('fetch', answering().fetchImpl);
  expect(await store.dispatch(startReview())).toEqual({
    status: 'completed',
    findingCount: FINDINGS.length,
  });
  await store.dispatch(checkFixAvailability());
  return id;
};

let store: Store;

beforeEach(() => {
  // A test that does not answer the request itself must never reach a network.
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () => {
      throw new Error('This test must not request a review');
    }),
  );
  store = makeStore();
  localStorage.clear();
  vi.mocked(posthog.capture).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  store.dispatch(cancelReview());
});

describe('startReview refusals', () => {
  it('refuses when offline', async () => {
    await open(store);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await store.dispatch(startReview())).toEqual({
      status: 'refused',
      reason: 'offline',
    });
  });

  it('refuses with nothing open', async () => {
    expect(await store.dispatch(startReview())).toEqual({
      status: 'refused',
      reason: 'no_protocol',
    });
  });

  it('refuses when the experiment is off', async () => {
    const { experiments: _off, ...withoutExperiment } = makeProtocol();
    await open(store, withoutExperiment);
    expect(await store.dispatch(startReview())).toMatchObject({
      reason: 'experiment_off',
    });
  });

  it('refuses when the study details are missing or incomplete', async () => {
    await open(store, makeProtocol({ experiments: { protocolReview: {} } }));
    expect(await store.dispatch(startReview())).toMatchObject({
      reason: 'missing_study_context',
    });
    await open(
      store,
      makeProtocol({
        experiments: {
          protocolReview: {
            studyContext: { ...STUDY_CONTEXT, researchQuestions: [] },
          },
        },
      }),
    );
    expect(await store.dispatch(startReview())).toMatchObject({
      reason: 'missing_study_context',
    });
  });

  it('refuses while a review is running', async () => {
    await open(store);
    const answer = gatedAnswer();
    vi.stubGlobal('fetch', answer.fetchImpl);
    const first = store.dispatch(startReview());
    await vi.waitFor(() => {
      expect(getProtocolReviewRun(store.getState()).status).toBe('running');
    });
    expect(getProtocolReviewStartBlock(store.getState())).toEqual({
      code: 'running',
    });
    expect(await store.dispatch(startReview())).toMatchObject({
      reason: 'running',
    });
    answer.finish();
    expect(await first).toMatchObject({ status: 'completed' });
    expect(answer.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses when nothing has changed since the last review, and allows one after a change', async () => {
    await reviewed(store);
    expect(getProtocolReviewStartBlock(store.getState())).toEqual({
      code: 'unchanged',
    });
    expect(await store.dispatch(startReview())).toMatchObject({
      reason: 'unchanged',
    });
    // The protocol's name is not something a review reads.
    store.dispatch(actionCreators.updateProtocolName({ name: 'Renamed' }));
    expect(getProtocolReviewStartBlock(store.getState())).toEqual({
      code: 'unchanged',
    });
    // The study details are.
    store.dispatch(
      actionCreators.updateProtocol({
        experiments: {
          protocolReview: {
            studyContext: { ...STUDY_CONTEXT, population: 'Students' },
          },
        },
      }),
    );
    expect(getProtocolReviewStartBlock(store.getState())).toBeNull();
  });

  it('refuses while the stored hourly quota is used up, and not once it resets', async () => {
    const now = Date.now();
    localStorage.setItem(
      PROTOCOL_REVIEW_QUOTA_KEY,
      JSON.stringify({
        limit: 5,
        remaining: 0,
        resetsAt: new Date(now + 60_000).toISOString(),
      }),
    );
    await open(store);
    expect(getProtocolReviewStartBlock(store.getState(), now)).toEqual({
      code: 'hourly_limit',
      resetsAt: new Date(now + 60_000).toISOString(),
    });
    expect(await store.dispatch(startReview())).toMatchObject({
      reason: 'hourly_limit',
    });
    expect(
      getProtocolReviewStartBlock(store.getState(), now + 60_000),
    ).toBeNull();
  });
});

describe('a review run', () => {
  it('sends the protocol as the store holds it and saves the result beside it', async () => {
    const id = await open(store);
    const answer = gatedAnswer();
    vi.stubGlobal('fetch', answer.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(answer.fetchImpl).toHaveBeenCalled());

    expect(answer.requestBody()).toEqual({
      installationId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      locale: 'en',
      share: false,
      studyContext: STUDY_CONTEXT,
      protocol: JSON.parse(
        JSON.stringify({ ...protocolOf(store), experiments: undefined }),
      ),
    });

    answer.send({ type: 'progress', received: 2000 });
    await vi.waitFor(() => {
      expect(getProtocolReviewRun(store.getState())).toMatchObject({
        status: 'running',
        received: 2000,
      });
    });
    const progress = getProtocolReviewProgress(store.getState());
    expect(progress).toBeCloseTo(reviewProgressFraction(2000));
    answer.finish();
    expect(await run).toEqual({ status: 'completed', findingCount: 4 });

    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
    expect(getProtocolReviewProgress(store.getState())).toBeNull();
    const stored = await readReviewRecord(id);
    expect(stored.review?.findings.map((f) => f.finding.id)).toEqual([
      'prompt',
      'title',
      'broken',
      'advice',
    ]);
    expect(stored.review?.locale).toBe('en');
    expect(getProtocolReviewCounts(store.getState())).toEqual({
      total: 4,
      undecided: 4,
      fixed: 0,
      mine: 0,
      dismissed: 0,
    });
    expect(
      JSON.parse(localStorage.getItem(PROTOCOL_REVIEW_QUOTA_KEY) ?? ''),
    ).toEqual(RESULT.quota);
  });

  it('records targets against the protocol sent, when the answer arrives after it changed', async () => {
    await open(store);
    const answer = gatedAnswer();
    vi.stubGlobal('fetch', answer.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(answer.fetchImpl).toHaveBeenCalled());

    // The researcher rewrites the prompt while the review runs, as the
    // stage editor writes a translation.
    store.dispatch(
      setProtocolTranslation({
        path: ['stages', 1, 'prompts', 0, 'text'],
        locale: 'en',
        text: 'My own words',
      }),
    );
    answer.finish();
    await run;
    await store.dispatch(checkFixAvailability());

    expect(findingOf(store, 'prompt').availability).toBe('changed');
    expect(findingOf(store, 'prompt').canFix).toBe(false);
    expect(findingOf(store, 'title').availability).toBe('available');
    expect(await store.dispatch(decideFinding('prompt', 'fix'))).toEqual({
      ok: false,
      reason: 'changed',
    });
    expect(promptText(store)).toEqual({ en: 'My own words', fr: 'Nommez' });
  });

  it('aborts a review in flight when its protocol closes, and saves nothing', async () => {
    const id = await open(store);
    const answer = gatedAnswer();
    vi.stubGlobal('fetch', answer.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(answer.fetchImpl).toHaveBeenCalled());
    store.dispatch(setActiveProtocolId(null));
    expect(await run).toEqual({ status: 'cancelled' });
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
    expect((await readReviewRecord(id)).review).toBeNull();
  });

  it('cancels on request', async () => {
    const id = await open(store);
    const answer = gatedAnswer();
    vi.stubGlobal('fetch', answer.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(answer.fetchImpl).toHaveBeenCalled());
    store.dispatch(cancelReview());
    expect(await run).toEqual({ status: 'cancelled' });
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
    expect((await readReviewRecord(id)).review).toBeNull();
  });

  it('fails with the service’s code, and remembers an hourly limit', async () => {
    await open(store);
    const retryAt = '2099-01-01T00:00:00.000Z';
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ error: 'hourly_limit', retryAt }), {
            status: 429,
          }),
      ),
    );
    expect(await store.dispatch(startReview())).toEqual({
      status: 'failed',
      code: 'hourly_limit',
      retryAt,
    });
    expect(getProtocolReviewRun(store.getState())).toEqual({
      status: 'failed',
      code: 'hourly_limit',
      retryAt,
    });
    expect(getProtocolReviewStartBlock(store.getState())).toEqual({
      code: 'hourly_limit',
      resetsAt: retryAt,
    });
    expect(posthog.capture).toHaveBeenCalledWith('protocol_review_failed', {
      error_code: 'hourly_limit',
    });
  });

  it('only ever moves its progress estimate forward, short of the end', () => {
    let previous = 0;
    for (const received of [0, 10, 500, 5000, 20_000, 1_000_000]) {
      const fraction = reviewProgressFraction(received);
      expect(fraction).toBeGreaterThanOrEqual(previous);
      expect(fraction).toBeLessThanOrEqual(0.95);
      previous = fraction;
    }
    expect(reviewProgressFraction(0)).toBeCloseTo(0.08);
  });
});

describe('decisions', () => {
  it('derives availability from the protocol as it stands', async () => {
    await reviewed(store);
    expect(findingOf(store, 'prompt')).toMatchObject({
      status: 'undecided',
      availability: 'available',
      canFix: true,
      location: { kind: 'stage', position: 2, href: '/protocol/stage/names' },
      textEdits: [
        {
          now: 'Name people',
          after: 'Name everyone you know',
          locale: 'en',
          otherTranslations: ['fr'],
        },
      ],
    });
    expect(findingOf(store, 'broken')).toMatchObject({
      availability: 'invalid',
      canFix: false,
    });
    expect(findingOf(store, 'advice')).toMatchObject({
      availability: 'none',
      canFix: false,
    });
  });

  it('Fix for me applies the edits as one undo step, which the app’s Undo takes back', async () => {
    await reviewed(store);
    const pastBefore = store.getState().activeProtocol.past.length;
    expect(await store.dispatch(decideFinding('prompt', 'fix'))).toEqual({
      ok: true,
    });
    expect(store.getState().activeProtocol.past).toHaveLength(pastBefore + 1);
    // The other translation is kept, as Architect's own editors keep it.
    expect(promptText(store)).toEqual({
      en: 'Name everyone you know',
      fr: 'Nommez',
    });
    expect(findingOf(store, 'prompt')).toMatchObject({
      status: 'fixed',
      decision: 'fix',
      canUndo: true,
    });
    expect(getProtocolReviewCounts(store.getState()).fixed).toBe(1);

    store.dispatch(timelineActions.undo());
    expect(promptText(store)).toEqual({ en: 'Name people', fr: 'Nommez' });
    expect(findingOf(store, 'prompt')).toMatchObject({
      status: 'undecided',
      canUndo: false,
    });

    store.dispatch(timelineActions.redo());
    expect(findingOf(store, 'prompt').status).toBe('fixed');
  });

  it('refuses Fix for me in a tab that does not own the saved copy', async () => {
    await reviewed(store);
    store.dispatch(setProtocolLockState('open-elsewhere'));
    const before = protocolOf(store);
    expect(await store.dispatch(decideFinding('prompt', 'fix'))).toEqual({
      ok: false,
      reason: 'not_owned',
    });
    expect(protocolOf(store)).toBe(before);
  });

  it('never lets an invalid fix reach the store', async () => {
    await reviewed(store);
    const before = protocolOf(store);
    expect(await store.dispatch(decideFinding('broken', 'fix'))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(protocolOf(store)).toBe(before);
  });

  it('Undo on the finding applies the inverse as a new step and returns it to undecided', async () => {
    const id = await reviewed(store);
    const original = protocolOf(store);
    await store.dispatch(decideFinding('title', 'fix'));
    const pastAfterFix = store.getState().activeProtocol.past.length;
    expect(await store.dispatch(undoFix('title'))).toEqual({ ok: true });
    expect(store.getState().activeProtocol.past).toHaveLength(pastAfterFix + 1);
    expect(protocolOf(store).stages).toEqual(original.stages);
    expect(findingOf(store, 'title')).toMatchObject({
      status: 'undecided',
      availability: 'available',
    });
    const stored = await readReviewRecord(id);
    expect(stored.review?.findings[1]).toMatchObject({
      decision: 'undecided',
      inverse: null,
    });
  });

  it('withdraws Undo once the researcher rewrites what the fix wrote', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('title', 'fix'));
    store.dispatch(
      setProtocolTranslation({
        path: ['stages', 0, 'title'],
        locale: 'en',
        text: 'Mine now',
      }),
    );
    expect(findingOf(store, 'title')).toMatchObject({
      status: 'undecided',
      canUndo: false,
      availability: 'changed',
    });
    expect(await store.dispatch(undoFix('title'))).toEqual({
      ok: false,
      reason: 'not_fixed',
    });
  });

  it('keeps I will fix this and Dismiss, and restores either to undecided', async () => {
    const id = await reviewed(store);
    await store.dispatch(decideFinding('prompt', 'mine'));
    await store.dispatch(decideFinding('title', 'dismissed'));
    expect(findingOf(store, 'prompt')).toMatchObject({
      status: 'mine',
      canFix: true,
      canRestore: true,
    });
    expect(findingOf(store, 'title')).toMatchObject({
      status: 'dismissed',
      canFix: false,
      canRestore: true,
    });
    expect(getProtocolReviewCounts(store.getState())).toMatchObject({
      undecided: 2,
      mine: 1,
      dismissed: 1,
    });
    await store.dispatch(decideFinding('title', 'undecided'));
    expect(findingOf(store, 'title').status).toBe('undecided');
    // Kept beside the protocol, so a reopened protocol finds them again.
    const reopened = makeStore();
    reopened.dispatch(setActiveProtocolId(id));
    reopened.dispatch(setActiveProtocol(makeProtocol()));
    await vi.waitFor(() => {
      expect(reopened.getState().protocolReview.record?.protocolId).toBe(id);
    });
    expect(
      getProtocolReviewFindings(reopened.getState()).map((f) => f.status),
    ).toEqual(['mine', 'undecided', 'undecided', 'undecided']);
  });

  it('refuses to re-decide a fix that holds; Undo is the way back', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('title', 'fix'));
    expect(await store.dispatch(decideFinding('title', 'dismissed'))).toEqual({
      ok: false,
      reason: 'fixed',
    });
  });
});

describe('sharing', () => {
  it('is off by default, kept between reviews, and sent with the request', async () => {
    await open(store);
    expect(getShareProtocolReviews(store.getState())).toBe(false);
    await store.dispatch(setShareReviews(true));
    const answer = answering();
    vi.stubGlobal('fetch', answer.fetchImpl);
    await store.dispatch(startReview());
    expect(answer.requestBody()).toMatchObject({ share: true });
    expect(getShareProtocolReviews(store.getState())).toBe(true);
  });
});

describe('analytics', () => {
  it('sends only fixed codes, numbers and booleans', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('prompt', 'fix'));
    await store.dispatch(undoFix('prompt'));
    await store.dispatch(decideFinding('title', 'mine'));
    await store.dispatch(decideFinding('broken', 'dismissed'));

    const calls = vi.mocked(posthog.capture).mock.calls;
    expect(calls.map(([event]) => event)).toEqual([
      'protocol_review_started',
      'protocol_review_completed',
      'protocol_review_decision',
      'protocol_review_decision',
      'protocol_review_decision',
      'protocol_review_decision',
    ]);
    expect(calls[1]?.[1]).toEqual({
      finding_count: 4,
      serious_count: 1,
      worth_fixing_count: 2,
      suggestion_count: 1,
      duration_ms: expect.any(Number),
    });

    const allowed = new Set<string>([
      ...FINDING_SEVERITIES,
      ...FINDING_CATEGORIES,
      ...FINDING_DECISIONS,
      ...REVIEW_ERROR_CODES,
    ]);
    for (const [, properties] of calls) {
      for (const value of Object.values(properties ?? {})) {
        if (typeof value === 'string') expect(allowed).toContain(value);
        else expect(['number', 'boolean']).toContain(typeof value);
      }
    }
  });
});
