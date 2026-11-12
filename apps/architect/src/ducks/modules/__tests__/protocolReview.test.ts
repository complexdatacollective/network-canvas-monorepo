// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withSuppliedWording } from '@codaco/interview/supplied-wording';
import {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  type Finding,
  type ProviderAvailability,
  REVIEW_ERROR_CODES,
  REVIEW_PROVIDERS,
  type ReviewEvent,
  type ReviewResult,
} from '@codaco/protocol-review-worker/contract';
import { type CurrentProtocol } from '@codaco/protocol-validation';
import { posthog } from '~/analytics';
import { timelineActions } from '~/ducks/middleware/timeline';
import {
  setActiveProtocol,
  setProtocolTranslation,
} from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import {
  cancelReview,
  checkFixAvailability,
  chooseReviewProvider,
  decideFinding,
  getProtocolReviewCounts,
  getProtocolReviewFindings,
  getProtocolReviewPhase,
  getProtocolReviewProgress,
  getProtocolReviewRun,
  getProtocolReviewStartBlock,
  dismissReview,
  getShareReviewsChoice,
  refreshReviewProviders,
  reviewProgressFraction,
  reviewProviderChoices,
  reviewProviderFor,
  setShareReviews,
  startReview,
  undoFix,
  WITHHELD_API_KEY,
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
import {
  PROTOCOL_REVIEW_PROVIDER_KEY,
  PROTOCOL_REVIEW_QUOTA_KEY,
} from '~/utils/storageNames';

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
            studyContext: { ...STUDY_CONTEXT, synopsis: ' ' },
          },
        },
      }),
    );
    expect(await store.dispatch(startReview())).toMatchObject({
      reason: 'missing_study_context',
    });
  });

  it('reviews a protocol whose study details have no research questions, sending none', async () => {
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
    expect(getProtocolReviewStartBlock(store.getState())).toBeNull();
    const answer = answering();
    vi.stubGlobal('fetch', answer.fetchImpl);
    expect(await store.dispatch(startReview())).toMatchObject({
      status: 'completed',
    });
    expect(answer.requestBody()).toMatchObject({
      studyContext: { ...STUDY_CONTEXT, researchQuestions: [] },
    });
  });

  it('names what stops a review being asked for ahead of study details still to give', async () => {
    // The dialog a review is asked for through is where the details are
    // given, so they are the last thing to stand in the way.
    const now = Date.now();
    localStorage.setItem(
      PROTOCOL_REVIEW_QUOTA_KEY,
      JSON.stringify({
        limit: 5,
        remaining: 0,
        resetsAt: new Date(now + 60_000).toISOString(),
      }),
    );
    await open(store, makeProtocol({ experiments: { protocolReview: {} } }));
    expect(getProtocolReviewStartBlock(store.getState(), now)).toMatchObject({
      code: 'hourly_limit',
    });
    expect(getProtocolReviewStartBlock(store.getState(), now + 60_000)).toEqual(
      { code: 'missing_study_context' },
    );
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

  it('reviews again though nothing has changed since the last review', async () => {
    await reviewed(store);
    const first = store.getState().protocolReview.record?.review?.reviewId;
    expect(getProtocolReviewStartBlock(store.getState())).toBeNull();
    vi.stubGlobal(
      'fetch',
      answering({
        ...RESULT,
        reviewId: '5d2c1b0a-7e6f-4a3b-9c8d-0f1e2d3c4b5a',
      }).fetchImpl,
    );
    expect(await store.dispatch(startReview())).toMatchObject({
      status: 'completed',
    });
    expect(store.getState().protocolReview.record?.review?.reviewId).toBe(
      '5d2c1b0a-7e6f-4a3b-9c8d-0f1e2d3c4b5a',
    );
    expect(first).not.toBe('5d2c1b0a-7e6f-4a3b-9c8d-0f1e2d3c4b5a');
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
  it('sends the protocol with the wording a participant is shown written out, and saves the result beside it', async () => {
    const id = await open(store);
    const answer = gatedAnswer();
    vi.stubGlobal('fetch', answer.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(answer.fetchImpl).toHaveBeenCalled());

    // The store holds none of the Finish button's wording, because it reads
    // as Network Canvas words it; the review is sent it all the same.
    expect(protocolOf(store).stages[2]).not.toHaveProperty('finishLabel');
    const sent = answer.requestBody();
    expect(sent).toEqual({
      installationId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      provider: 'anthropic',
      locale: 'en',
      share: false,
      studyContext: STUDY_CONTEXT,
      protocol: JSON.parse(
        JSON.stringify({
          ...withSuppliedWording(protocolOf(store)),
          experiments: undefined,
        }),
      ),
    });
    expect(sent).toMatchObject({
      protocol: {
        stages: [{}, {}, { finishLabel: { en: 'Finish', fr: 'Terminer' } }],
      },
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
    expect(stored.review?.provider).toBe('anthropic');
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

  it('withholds every API key from the protocol it sends, and sends the other resources as the protocol names them', async () => {
    await open(
      store,
      makeProtocol({
        assetManifest: {
          map: {
            id: 'map',
            type: 'apikey',
            name: 'Mapbox key',
            value: 'pk.a-real-secret',
          },
          photo: {
            id: 'photo',
            type: 'image',
            name: 'Campus',
            source: 'campus.png',
          },
        },
      }),
    );
    const answer = gatedAnswer();
    vi.stubGlobal('fetch', answer.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(answer.fetchImpl).toHaveBeenCalled());

    const sent = answer.requestBody();
    expect(JSON.stringify(sent)).not.toContain('pk.a-real-secret');
    expect(sent).toMatchObject({
      protocol: {
        assetManifest: {
          map: {
            id: 'map',
            type: 'apikey',
            name: 'Mapbox key',
            value: WITHHELD_API_KEY,
          },
          photo: {
            id: 'photo',
            type: 'image',
            name: 'Campus',
            source: 'campus.png',
          },
        },
      },
    });
    // Only the copy that is sent: the protocol keeps its key.
    expect(protocolOf(store).assetManifest?.map).toMatchObject({
      value: 'pk.a-real-secret',
    });
    answer.finish();
    await run;
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
      provider: 'anthropic',
    });
    expect(getProtocolReviewStartBlock(store.getState())).toEqual({
      code: 'hourly_limit',
      resetsAt: retryAt,
    });
    expect(posthog.capture).toHaveBeenCalledWith('protocol_review_failed', {
      error_code: 'hourly_limit',
      provider: 'anthropic',
    });
  });

  it('only ever moves its progress estimate forward, short of the end', () => {
    // A review as it goes: the thinking grows, then the answer.
    const steps: [received: number, thinking: number][] = [
      [0, 0],
      [0, 200],
      [0, 2500],
      [0, 1_000_000],
      [1, 1_000_000],
      [500, 1_000_000],
      [5000, 1_000_000],
      [1_000_000, 1_000_000],
    ];
    let previous = 0;
    for (const [received, thinking] of steps) {
      const fraction = reviewProgressFraction(received, thinking);
      expect(fraction).toBeGreaterThan(previous);
      expect(fraction).toBeLessThanOrEqual(0.95);
      previous = fraction;
    }
    expect(reviewProgressFraction(0, 0)).toBeCloseTo(0.05);
  });

  it('moves during the thinking, and never as far as any of the answer takes it', () => {
    // However long the model thinks, the first of its answer still moves the
    // estimate on, with or without a service that reports the thinking.
    expect(reviewProgressFraction(0, 1_000_000)).toBeLessThan(
      reviewProgressFraction(1, 0),
    );
    expect(reviewProgressFraction(0, 2500)).toBeGreaterThan(
      reviewProgressFraction(0, 0) + 0.2,
    );
  });

  it('is thinking until any of the answer has arrived, then writing', async () => {
    await open(store);
    expect(getProtocolReviewPhase(store.getState())).toBeNull();
    const answer = gatedAnswer();
    vi.stubGlobal('fetch', answer.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(answer.fetchImpl).toHaveBeenCalled());
    expect(getProtocolReviewPhase(store.getState())).toBe('thinking');

    answer.send({ type: 'progress', received: 0, thinking: 3000 });
    await vi.waitFor(() => {
      expect(getProtocolReviewRun(store.getState())).toMatchObject({
        received: 0,
        thinking: 3000,
      });
    });
    expect(getProtocolReviewPhase(store.getState())).toBe('thinking');
    expect(getProtocolReviewProgress(store.getState())).toBeCloseTo(
      reviewProgressFraction(0, 3000),
    );

    answer.send({ type: 'progress', received: 40, thinking: 3000 });
    await vi.waitFor(() => {
      expect(getProtocolReviewPhase(store.getState())).toBe('writing');
    });
    answer.finish();
    await run;
    expect(getProtocolReviewPhase(store.getState())).toBeNull();
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

  it('returns a fix that reorders stages to undecided when the order is put back', async () => {
    await open(store);
    const stageIds = () => protocolOf(store).stages.map((stage) => stage.id);
    const [first, second, ...rest] = protocolOf(store).stages;
    if (!first || !second) throw new Error('The fixture needs two stages');
    // Moves the first stage to just after the second.
    const moved = makeFinding(
      'order',
      [
        op('remove', `/stages/${first.id}`),
        op('insert', `/stages/${rest[0]?.id ?? '-'}`, first),
      ],
      { stageId: first.id, category: 'structure' },
    );
    vi.stubGlobal(
      'fetch',
      answering({ ...RESULT, findings: [moved] }).fetchImpl,
    );
    await store.dispatch(startReview());
    await store.dispatch(checkFixAvailability());
    const original = stageIds();

    expect(await store.dispatch(decideFinding('order', 'fix'))).toEqual({
      ok: true,
    });
    expect(stageIds().slice(0, 2)).toEqual([second.id, first.id]);
    expect(findingOf(store, 'order')).toMatchObject({
      status: 'fixed',
      canUndo: true,
    });

    // The stage's own content is as the fix left it; only the order is not.
    store.dispatch(timelineActions.undo());
    expect(stageIds()).toEqual(original);
    expect(findingOf(store, 'order')).toMatchObject({
      status: 'undecided',
      canUndo: false,
    });

    store.dispatch(timelineActions.redo());
    expect(findingOf(store, 'order').status).toBe('fixed');
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
      canFix: true,
      canUndo: false,
    });
    // The record of the applied fix is kept, so the fix is recognised if the
    // app's own Undo puts it back.
    const stored = await readReviewRecord(id);
    expect(stored.review?.findings[1]).toMatchObject({ decision: 'fix' });
    expect(stored.review?.findings[1]?.inverse).not.toBeNull();
  });

  it('shows a fix the researcher adjusted as fixed again when the app’s Undo takes back its Undo', async () => {
    await reviewed(store);
    const path = findingOf(store, 'prompt').textEdits[0]?.path;
    if (path === undefined) throw new Error('The fix rewrites no text');
    expect(
      await store.dispatch(
        decideFinding('prompt', 'fix', { [path]: 'Name your friends' }),
      ),
    ).toEqual({ ok: true });
    expect(promptText(store)).toEqual({
      en: 'Name your friends',
      fr: 'Nommez',
    });

    expect(await store.dispatch(undoFix('prompt'))).toEqual({ ok: true });
    expect(promptText(store)).toEqual({ en: 'Name people', fr: 'Nommez' });
    expect(findingOf(store, 'prompt').status).toBe('undecided');

    // The app's Undo takes the finding's Undo back: the adjusted text is in
    // the protocol again, which the review's own suggestion does not match.
    store.dispatch(timelineActions.undo());
    expect(promptText(store)).toEqual({
      en: 'Name your friends',
      fr: 'Nommez',
    });
    await vi.waitFor(() =>
      expect(findingOf(store, 'prompt')).toMatchObject({
        status: 'fixed',
        canUndo: true,
      }),
    );

    // And the finding's Undo works on it again.
    expect(await store.dispatch(undoFix('prompt'))).toEqual({ ok: true });
    expect(promptText(store)).toEqual({ en: 'Name people', fr: 'Nommez' });
    expect(findingOf(store, 'prompt').status).toBe('undecided');
  });

  it('rewords text Network Canvas supplies, which the protocol holds only once it differs, and Undo takes it back out', async () => {
    await open(store);
    vi.stubGlobal(
      'fetch',
      answering({
        ...RESULT,
        findings: [
          makeFinding(
            'finish',
            [op('set', '/stages/finish/finishLabel/en', 'Send my answers')],
            { stageId: 'finish' },
          ),
        ],
      }).fetchImpl,
    );
    await store.dispatch(startReview());
    await store.dispatch(checkFixAvailability());
    const original = protocolOf(store);
    expect(original.stages[2]).not.toHaveProperty('finishLabel');
    expect(findingOf(store, 'finish')).toMatchObject({
      status: 'undecided',
      availability: 'available',
      textEdits: [{ now: 'Finish', after: 'Send my answers', locale: 'en' }],
    });

    expect(await store.dispatch(decideFinding('finish', 'fix'))).toEqual({
      ok: true,
    });
    expect(protocolOf(store).stages[2]).toMatchObject({
      finishLabel: { en: 'Send my answers' },
    });
    expect(findingOf(store, 'finish')).toMatchObject({
      status: 'fixed',
      canUndo: true,
    });

    expect(await store.dispatch(undoFix('finish'))).toEqual({ ok: true });
    expect(protocolOf(store)).toEqual(original);
    expect(findingOf(store, 'finish')).toMatchObject({
      status: 'undecided',
      availability: 'available',
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

  it('shows a problem as fixed once another fix has already made its change, and undecided again once that is undone', async () => {
    await open(store);
    vi.stubGlobal(
      'fetch',
      answering({
        ...RESULT,
        findings: [
          makeFinding('dropWelcome', [op('remove', '/stages/welcome')], {
            stageId: 'welcome',
            category: 'structure',
          }),
          makeFinding('alsoDropWelcome', [op('remove', '/stages/welcome')], {
            category: 'structure',
          }),
        ],
      }).fetchImpl,
    );
    await store.dispatch(startReview());
    await store.dispatch(checkFixAvailability());

    expect(await store.dispatch(decideFinding('dropWelcome', 'fix'))).toEqual({
      ok: true,
    });
    expect(findingOf(store, 'alsoDropWelcome')).toMatchObject({
      status: 'fixed',
      decision: 'undecided',
      canFix: false,
      canUndo: false,
    });
    expect(getProtocolReviewCounts(store.getState()).fixed).toBe(2);
    expect(await store.dispatch(undoFix('alsoDropWelcome'))).toEqual({
      ok: false,
      reason: 'not_fixed',
    });

    store.dispatch(timelineActions.undo());
    await store.dispatch(checkFixAvailability());
    expect(findingOf(store, 'alsoDropWelcome')).toMatchObject({
      status: 'undecided',
      availability: 'available',
    });
  });

  it('numbers the stages a problem names as the protocol stands now', async () => {
    await open(store);
    vi.stubGlobal(
      'fetch',
      answering({
        ...RESULT,
        findings: [
          makeFinding('dropWelcome', [op('remove', '/stages/welcome')], {
            stageId: 'welcome',
            category: 'structure',
          }),
          makeFinding(
            'finishCopy',
            [op('set', '/stages/finish/content/en', 'All done.')],
            {
              stageId: 'finish',
              title: 'Stage 3 · Finish is abrupt.',
              explanation:
                'Stage 1 · Welcome promises more than Stage 3 · Finish.',
              fix: {
                summary: 'Reword Stage 3 · Finish.',
                changes: ['Stage 3 · Finish: say the interview is over.'],
                operations: [
                  op('set', '/stages/finish/content/en', 'All done.'),
                ],
              },
            },
          ),
        ],
      }).fetchImpl,
    );
    await store.dispatch(startReview());
    await store.dispatch(checkFixAvailability());
    expect(findingOf(store, 'finishCopy')).toMatchObject({
      title: 'Stage 3 · Finish is abrupt.',
      location: { kind: 'stage', position: 3 },
    });

    await store.dispatch(decideFinding('dropWelcome', 'fix'));
    expect(findingOf(store, 'finishCopy')).toMatchObject({
      title: 'Stage 2 · Finish is abrupt.',
      explanation: 'Welcome promises more than Stage 2 · Finish.',
      fixSummary: 'Reword Stage 2 · Finish.',
      fixChanges: ['Stage 2 · Finish: say the interview is over.'],
      location: { kind: 'stage', position: 2 },
    });
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
  it('is not chosen until the researcher chooses, and nothing is shared meanwhile', async () => {
    await open(store);
    expect(getShareReviewsChoice(store.getState())).toBeNull();
    const answer = answering();
    vi.stubGlobal('fetch', answer.fetchImpl);
    await store.dispatch(startReview());
    expect(answer.requestBody()).toMatchObject({ share: false });
    expect(getShareReviewsChoice(store.getState())).toBeNull();
  });

  it.each([true, false])(
    'keeps a choice of %s between reviews, and sends it with the request',
    async (choice) => {
      await open(store);
      await store.dispatch(setShareReviews(choice));
      const answer = answering();
      vi.stubGlobal('fetch', answer.fetchImpl);
      await store.dispatch(startReview());
      expect(answer.requestBody()).toMatchObject({ share: choice });
      expect(getShareReviewsChoice(store.getState())).toBe(choice);
    },
  );
});

describe('dismissing a review', () => {
  it('removes the review from the record, keeping the sharing choice and what its fixes changed', async () => {
    const id = await reviewed(store);
    await store.dispatch(setShareReviews(true));
    await store.dispatch(decideFinding('title', 'fix'));
    const fixed = store.getState().activeProtocol.present;

    expect(await store.dispatch(dismissReview())).toBe(true);

    expect(store.getState().protocolReview.record).toEqual({
      protocolId: id,
      shareReviews: true,
      review: null,
    });
    expect(await readReviewRecord(id)).toEqual({
      protocolId: id,
      shareReviews: true,
      review: null,
    });
    expect(getProtocolReviewFindings(store.getState())).toEqual([]);
    expect(store.getState().activeProtocol.present).toBe(fixed);
    // Dismissed, the protocol can be reviewed afresh.
    expect(getProtocolReviewStartBlock(store.getState())).toBeNull();
  });

  it('does nothing with no review, or in a tab that does not hold the protocol', async () => {
    await open(store);
    expect(await store.dispatch(dismissReview())).toBe(false);

    const id = await reviewed(store);
    const reviewId = store.getState().protocolReview.record?.review?.reviewId;
    store.dispatch(setProtocolLockState('open-elsewhere'));
    expect(await store.dispatch(dismissReview())).toBe(false);
    expect(store.getState().protocolReview.record?.review?.reviewId).toBe(
      reviewId,
    );
    expect((await readReviewRecord(id)).review?.reviewId).toBe(reviewId);
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
    expect(calls[0]?.[1]).toEqual({ share: false, provider: 'anthropic' });
    expect(calls[1]?.[1]).toEqual({
      finding_count: 4,
      serious_count: 1,
      worth_fixing_count: 2,
      suggestion_count: 1,
      duration_ms: expect.any(Number),
      provider: 'anthropic',
    });

    const allowed = new Set<string>([
      ...FINDING_SEVERITIES,
      ...FINDING_CATEGORIES,
      ...FINDING_DECISIONS,
      ...REVIEW_ERROR_CODES,
      ...REVIEW_PROVIDERS,
    ]);
    for (const [, properties] of calls) {
      for (const value of Object.values(properties ?? {})) {
        if (typeof value === 'string') expect(allowed).toContain(value);
        else expect(['number', 'boolean']).toContain(typeof value);
      }
    }
  });
});

describe('providers', () => {
  const NOW = Date.parse('2026-11-12T12:00:00.000Z');
  const LATER = '2026-11-13T00:00:00.000Z';
  const MUCH_LATER = '2026-12-01T00:00:00.000Z';
  const idle = { status: 'idle' } as const;
  const refused = (
    provider: 'anthropic' | 'openai',
    code: 'daily_limit' | 'monthly_limit' | 'too_large',
    retryAt: string | null,
  ) => ({ status: 'failed', code, retryAt, provider }) as const;

  /**
   * A stand-in for the service: `status` answers which providers have budget
   * left, and `review` every review. Records what each review asked for.
   */
  const service = ({
    status,
    review,
  }: {
    status?: ProviderAvailability[] | 'down';
    review?: () => Response;
  }) => {
    const reviews: { provider?: string }[] = [];
    let statusRequests = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const href =
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (href.endsWith('/providers')) {
        statusRequests += 1;
        if (status === undefined || status === 'down') {
          throw new TypeError('Failed to fetch');
        }
        return new Response(JSON.stringify({ providers: status }));
      }
      reviews.push(
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as { provider?: string })
          : {},
      );
      if (review) return review();
      return answering({
        ...RESULT,
        reviewId: crypto.randomUUID(),
      }).fetchImpl(url, init);
    });
    vi.stubGlobal('fetch', fetchImpl);
    return { reviews, statusRequests: () => statusRequests };
  };

  const spent = (
    provider: 'anthropic' | 'openai',
    retryAt: string | null,
  ): ProviderAvailability => ({
    provider,
    available: false,
    reason: 'daily_limit',
    retryAt,
  });
  const open_ = (provider: 'anthropic' | 'openai'): ProviderAvailability => ({
    provider,
    available: true,
    reason: null,
    retryAt: null,
  });

  it('takes every provider to have budget until the service says otherwise', () => {
    expect(reviewProviderChoices({ spent: {}, run: idle }, NOW)).toEqual([
      { provider: 'anthropic', available: true, retryAt: null },
      { provider: 'openai', available: true, retryAt: null },
    ]);
  });

  it('holds a provider the service said is spent until the time it gave', () => {
    const state = { spent: { openai: { retryAt: LATER } }, run: idle };
    expect(reviewProviderChoices(state, NOW)[1]).toEqual({
      provider: 'openai',
      available: false,
      retryAt: Date.parse(LATER),
    });
    expect(
      reviewProviderChoices(state, Date.parse(LATER) - 1)[1],
    ).toMatchObject({ available: false });
    expect(reviewProviderChoices(state, Date.parse(LATER))[1]).toEqual({
      provider: 'openai',
      available: true,
      retryAt: null,
    });
    expect(reviewProviderChoices(state, NOW)[0]).toMatchObject({
      available: true,
    });
  });

  it('holds a provider given no time until the service is asked again', () => {
    expect(
      reviewProviderChoices(
        { spent: { anthropic: { retryAt: null } }, run: idle },
        Date.parse(MUCH_LATER),
      )[0],
    ).toEqual({ provider: 'anthropic', available: false, retryAt: null });
  });

  it.each(['daily_limit', 'monthly_limit'] as const)(
    'holds the provider a review was refused for (%s), though the service has not said it is spent',
    (code) => {
      const state = { spent: {}, run: refused('openai', code, LATER) };
      expect(reviewProviderChoices(state, NOW)).toEqual([
        { provider: 'anthropic', available: true, retryAt: null },
        { provider: 'openai', available: false, retryAt: Date.parse(LATER) },
      ]);
      expect(reviewProviderChoices(state, Date.parse(LATER))[1]).toMatchObject({
        available: true,
      });
      expect(
        reviewProviderChoices(
          { spent: {}, run: refused('openai', code, null) },
          Date.parse(MUCH_LATER),
        )[1],
      ).toEqual({ provider: 'openai', available: false, retryAt: null });
    },
  );

  it('does not hold a provider for a failure that is not about its budget', () => {
    expect(
      reviewProviderChoices(
        { spent: {}, run: refused('openai', 'too_large', LATER) },
        NOW,
      )[1],
    ).toMatchObject({ available: true });
  });

  it('holds a provider until the later of two times it was given', () => {
    expect(
      reviewProviderChoices(
        {
          spent: { openai: { retryAt: LATER } },
          run: refused('openai', 'monthly_limit', MUCH_LATER),
        },
        NOW,
      )[1],
    ).toEqual({
      provider: 'openai',
      available: false,
      retryAt: Date.parse(MUCH_LATER),
    });
  });

  it('asks the chosen provider, or the first with budget while the chosen one has none', () => {
    const choices = (anthropic: boolean, openai: boolean) => [
      { provider: 'anthropic' as const, available: anthropic, retryAt: null },
      { provider: 'openai' as const, available: openai, retryAt: null },
    ];
    expect(reviewProviderFor('openai', choices(true, true))).toBe('openai');
    expect(reviewProviderFor('openai', choices(true, false))).toBe('anthropic');
    expect(reviewProviderFor('anthropic', choices(false, true))).toBe('openai');
    expect(reviewProviderFor('openai', choices(false, false))).toBe('openai');
  });

  it('names the chosen provider in the request, records it with the review, and remembers the choice', async () => {
    const { reviews } = service({});
    const id = await open(store);
    store.dispatch(chooseReviewProvider('openai'));
    expect(localStorage.getItem(PROTOCOL_REVIEW_PROVIDER_KEY)).toBe('openai');
    expect(await store.dispatch(startReview())).toMatchObject({
      status: 'completed',
    });
    expect(reviews).toEqual([expect.objectContaining({ provider: 'openai' })]);
    expect((await readReviewRecord(id)).review?.provider).toBe('openai');
    expect(posthog.capture).toHaveBeenCalledWith('protocol_review_started', {
      share: false,
      provider: 'openai',
    });

    // A new session in this browser starts from the same choice.
    const next = makeStore();
    await open(next);
    expect(next.getState().protocolReview.provider).toBe('openai');
    next.dispatch(cancelReview());
  });

  it.each(['daily_limit', 'monthly_limit'] as const)(
    'after a %s refusal asks the service about the others, and sends the next review to one with budget',
    async (code) => {
      let refuse = true;
      const { reviews, statusRequests } = service({
        status: [spent('anthropic', MUCH_LATER), open_('openai')],
        review: () => {
          if (!refuse) {
            return new Response(
              `data: ${JSON.stringify({ type: 'result', result: RESULT })}\n\n`,
              { headers: { 'Content-Type': 'text/event-stream' } },
            );
          }
          refuse = false;
          return new Response(
            JSON.stringify({ error: code, retryAt: MUCH_LATER }),
            { status: 503 },
          );
        },
      });
      await open(store);
      expect(await store.dispatch(startReview())).toEqual({
        status: 'failed',
        code,
        retryAt: MUCH_LATER,
      });
      expect(getProtocolReviewRun(store.getState())).toEqual({
        status: 'failed',
        code,
        retryAt: MUCH_LATER,
        provider: 'anthropic',
      });
      await vi.waitFor(() => expect(statusRequests()).toBe(1));

      expect(getProtocolReviewStartBlock(store.getState())).toBeNull();
      expect(await store.dispatch(startReview())).toMatchObject({
        status: 'completed',
      });
      expect(reviews.map((review) => review.provider)).toEqual([
        'anthropic',
        'openai',
      ]);
      expect(
        (
          await readReviewRecord(
            store.getState().protocolReview.record?.protocolId ?? '',
          )
        ).review?.provider,
      ).toBe('openai');
      // The choice itself stands, for when its budget starts again.
      expect(store.getState().protocolReview.provider).toBe('anthropic');
      expect(localStorage.getItem(PROTOCOL_REVIEW_PROVIDER_KEY)).toBeNull();
    },
  );

  it('starts nothing while every provider’s budget is spent, and starts again when one does', async () => {
    const { reviews } = service({
      status: [spent('anthropic', MUCH_LATER), spent('openai', LATER)],
    });
    await open(store);
    await store.dispatch(refreshReviewProviders());

    expect(getProtocolReviewStartBlock(store.getState(), NOW)).toEqual({
      code: 'budget_spent',
    });
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    expect(await store.dispatch(startReview())).toEqual({
      status: 'refused',
      reason: 'budget_spent',
    });
    expect(reviews).toEqual([]);

    vi.setSystemTime(Date.parse(LATER));
    expect(getProtocolReviewStartBlock(store.getState())).toBeNull();
    expect(await store.dispatch(startReview())).toMatchObject({
      status: 'completed',
    });
    expect(reviews.map((review) => review.provider)).toEqual(['openai']);
    vi.useRealTimers();
  });

  it('replaces what it knew with each answer, and keeps it when no answer comes', async () => {
    const first = service({
      status: [open_('anthropic'), spent('openai', LATER)],
    });
    await store.dispatch(refreshReviewProviders());
    expect(first.statusRequests()).toBe(1);
    expect(store.getState().protocolReview.spent).toEqual({
      openai: { retryAt: LATER },
    });

    service({ status: 'down' });
    await store.dispatch(refreshReviewProviders());
    expect(store.getState().protocolReview.spent).toEqual({
      openai: { retryAt: LATER },
    });

    service({ status: [spent('anthropic', null), open_('openai')] });
    await store.dispatch(refreshReviewProviders());
    expect(store.getState().protocolReview.spent).toEqual({
      anthropic: { retryAt: null },
    });
  });

  it('keeps the choice and what the service said when another protocol opens', async () => {
    service({ status: [open_('anthropic'), spent('openai', LATER)] });
    await open(store);
    store.dispatch(chooseReviewProvider('openai'));
    await store.dispatch(refreshReviewProviders());
    await open(store);
    expect(store.getState().protocolReview.provider).toBe('openai');
    expect(store.getState().protocolReview.spent).toEqual({
      openai: { retryAt: LATER },
    });
  });

  it('asks the service once while an answer is awaited', async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchImpl = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchImpl);
    const both = Promise.all([
      store.dispatch(refreshReviewProviders()),
      store.dispatch(refreshReviewProviders()),
    ]);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    release(
      new Response(
        JSON.stringify({
          providers: [spent('anthropic', LATER), open_('openai')],
        }),
      ),
    );
    await both;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.getState().protocolReview.spent).toEqual({
      anthropic: { retryAt: LATER },
    });
  });
});
