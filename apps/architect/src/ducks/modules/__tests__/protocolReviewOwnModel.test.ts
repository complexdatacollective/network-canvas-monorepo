// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { posthog } from '~/analytics';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId } from '~/ducks/modules/app';
import {
  cancelReview,
  chooseReviewProvider,
  getProtocolReviewFindings,
  getProtocolReviewRun,
  getProtocolReviewStartBlock,
  getProtocolReviewWriter,
  reviewProviderFor,
  saveOwnModelSettings,
  setShareReviews,
  startReview,
} from '~/ducks/modules/protocolReview';
import { rootReducer } from '~/ducks/modules/root';
import {
  makeFinding,
  makeProtocol,
  op,
} from '~/protocolReview/__tests__/fixtures';
import { OWN_MODEL, type OwnModelSettings } from '~/protocolReview/ownModel';
import { keepProtocolReviewOnActiveProtocol } from '~/protocolReview/reviewListener';
import { readReviewRecord } from '~/protocolReview/reviewStore';
import {
  PROTOCOL_REVIEW_OWN_MODEL_KEY,
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

const SETTINGS: OwnModelSettings = {
  address: 'http://localhost:11434/v1',
  model: 'llama',
  apiKey: 'sk-own',
};

const ENDPOINT = 'http://localhost:11434/v1/chat/completions';

const { id: _id, ...WRITTEN } = makeFinding(
  'x',
  [op('set', '/stages/names/prompts/p1/text', 'Name everyone you know')],
  { stageId: 'names', severity: 'serious', category: 'wording' },
);
const ANSWER = JSON.stringify({ findings: [WRITTEN] });

/** A stand-in for the researcher's endpoint, which answers when released. */
const ownEndpoint = () => {
  const encoder = new TextEncoder();
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  const urls: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    urls.push(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    init?.signal?.addEventListener('abort', () => {
      try {
        stream?.error(new DOMException('Aborted', 'AbortError'));
      } catch {
        // Already closed.
      }
    });
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
  return {
    fetchImpl,
    urls,
    answer: (content: string = ANSWER) => {
      stream?.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
        ),
      );
      stream?.close();
    },
  };
};

let protocolCounter = 0;

const open = async (store: Store) => {
  protocolCounter += 1;
  const id = `own-model-${protocolCounter}`;
  store.dispatch(setActiveProtocolId(id));
  store.dispatch(setActiveProtocol(makeProtocol()));
  await vi.waitFor(() => {
    expect(store.getState().protocolReview.record?.protocolId).toBe(id);
  });
  return id;
};

/** Opens a protocol in a browser that has chosen its own model. */
const openWithOwnModel = async (store: Store) => {
  const id = await open(store);
  store.dispatch(saveOwnModelSettings(SETTINGS));
  store.dispatch(chooseReviewProvider(OWN_MODEL));
  return id;
};

const spentQuota = () =>
  JSON.stringify({
    limit: 5,
    remaining: 0,
    resetsAt: new Date(Date.now() + 60_000).toISOString(),
  });

let store: Store;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () => {
      throw new Error('This test must not send a request');
    }),
  );
  store = makeStore();
  localStorage.clear();
  vi.mocked(posthog.capture).mockClear();
});

afterEach(() => {
  store.dispatch(cancelReview());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('who writes the review', () => {
  it('is the researcher’s own model only while it is the choice and its settings are kept', async () => {
    await open(store);
    expect(getProtocolReviewWriter(store.getState())).toBe('anthropic');

    // Chosen with nothing kept: there is nowhere to send a review.
    store.dispatch(chooseReviewProvider(OWN_MODEL));
    expect(getProtocolReviewWriter(store.getState())).toBe('anthropic');

    store.dispatch(saveOwnModelSettings(SETTINGS));
    expect(getProtocolReviewWriter(store.getState())).toBe(OWN_MODEL);

    // Kept, but another model chosen.
    store.dispatch(chooseReviewProvider('openai'));
    expect(getProtocolReviewWriter(store.getState())).toBe('openai');
  });

  it('is never moved to the researcher’s own model because a provider’s budget is spent', () => {
    const spent = [
      { provider: 'anthropic', available: false, retryAt: null },
      { provider: 'openai', available: false, retryAt: null },
    ] as const;
    expect(reviewProviderFor('openai', spent, SETTINGS)).toBe('openai');
  });

  it('is read from this browser when a protocol opens', async () => {
    localStorage.setItem(
      PROTOCOL_REVIEW_OWN_MODEL_KEY,
      JSON.stringify(SETTINGS),
    );
    localStorage.setItem(PROTOCOL_REVIEW_PROVIDER_KEY, OWN_MODEL);
    await open(store);
    expect(store.getState().protocolReview.ownModel).toEqual(SETTINGS);
    expect(getProtocolReviewWriter(store.getState())).toBe(OWN_MODEL);
  });

  it('keeps the endpoint in this browser when it is saved', async () => {
    await openWithOwnModel(store);
    expect(
      JSON.parse(localStorage.getItem(PROTOCOL_REVIEW_OWN_MODEL_KEY) ?? ''),
    ).toEqual(SETTINGS);
    expect(localStorage.getItem(PROTOCOL_REVIEW_PROVIDER_KEY)).toBe(OWN_MODEL);
  });
});

describe('a review the researcher’s own model writes', () => {
  it('goes only to their endpoint, and is saved as any review is', async () => {
    const id = await openWithOwnModel(store);
    await store.dispatch(setShareReviews(true));
    const endpoint = ownEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);

    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(endpoint.fetchImpl).toHaveBeenCalled());
    expect(getProtocolReviewRun(store.getState())).toMatchObject({
      status: 'running',
      provider: OWN_MODEL,
    });
    endpoint.answer();

    expect(await run).toEqual({ status: 'completed', findingCount: 1 });
    // One request, to the endpoint: nothing went to the review service.
    expect(endpoint.urls).toEqual([ENDPOINT]);

    const record = await readReviewRecord(id);
    expect(record.review).toMatchObject({
      provider: OWN_MODEL,
      locale: 'en',
      findings: [{ decision: 'undecided' }],
    });
    expect(record.review?.reviewId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(getProtocolReviewFindings(store.getState())).toMatchObject([
      { id: 'f1', severity: 'serious' },
    ]);
  });

  it('is never shared, whatever was chosen for the protocol, and says so in its analytics', async () => {
    await openWithOwnModel(store);
    await store.dispatch(setShareReviews(true));
    const endpoint = ownEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(endpoint.fetchImpl).toHaveBeenCalled());
    endpoint.answer();
    await run;

    expect(posthog.capture).toHaveBeenCalledWith('protocol_review_started', {
      share: false,
      provider: OWN_MODEL,
    });
    expect(posthog.capture).toHaveBeenCalledWith(
      'protocol_review_completed',
      expect.objectContaining({ provider: OWN_MODEL, finding_count: 1 }),
    );
    // Where the endpoint is, which model and the key are told to nobody.
    expect(JSON.stringify(vi.mocked(posthog.capture).mock.calls)).not.toMatch(
      /localhost|llama|sk-own/u,
    );
  });

  it('is not held by the service’s hourly limit, and does not count against it', async () => {
    localStorage.setItem(PROTOCOL_REVIEW_QUOTA_KEY, spentQuota());
    await open(store);
    expect(getProtocolReviewStartBlock(store.getState())).toMatchObject({
      code: 'hourly_limit',
    });

    store.dispatch(saveOwnModelSettings(SETTINGS));
    store.dispatch(chooseReviewProvider(OWN_MODEL));
    expect(getProtocolReviewStartBlock(store.getState())).toBeNull();

    const before = localStorage.getItem(PROTOCOL_REVIEW_QUOTA_KEY);
    const endpoint = ownEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(endpoint.fetchImpl).toHaveBeenCalled());
    endpoint.answer();
    expect(await run).toMatchObject({ status: 'completed' });
    expect(localStorage.getItem(PROTOCOL_REVIEW_QUOTA_KEY)).toBe(before);
  });

  it('starts while offline: the endpoint may be on this computer', async () => {
    await openWithOwnModel(store);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const endpoint = ownEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(endpoint.fetchImpl).toHaveBeenCalled());
    endpoint.answer();
    expect(await run).toMatchObject({ status: 'completed' });
  });

  it('fails with the endpoint’s own code, and saves nothing', async () => {
    const id = await openWithOwnModel(store);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response('{}', { status: 401 })),
    );
    expect(await store.dispatch(startReview())).toEqual({
      status: 'failed',
      code: 'refused',
      retryAt: null,
    });
    expect(getProtocolReviewRun(store.getState())).toEqual({
      status: 'failed',
      code: 'refused',
      retryAt: null,
      provider: OWN_MODEL,
    });
    expect((await readReviewRecord(id)).review).toBeNull();
    expect(posthog.capture).toHaveBeenCalledWith('protocol_review_failed', {
      error_code: 'refused',
      provider: OWN_MODEL,
    });
  });

  it('does not take an answer it cannot read for a review with no problems', async () => {
    const id = await openWithOwnModel(store);
    const endpoint = ownEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(endpoint.fetchImpl).toHaveBeenCalled());
    endpoint.answer('Your protocol looks fine to me.');
    expect(await run).toMatchObject({
      status: 'failed',
      code: 'unreadable_answer',
    });
    expect((await readReviewRecord(id)).review).toBeNull();
  });

  it('stops when cancelled, without counting against the hourly limit', async () => {
    await openWithOwnModel(store);
    const endpoint = ownEndpoint();
    vi.stubGlobal('fetch', endpoint.fetchImpl);
    const run = store.dispatch(startReview());
    await vi.waitFor(() => expect(endpoint.fetchImpl).toHaveBeenCalled());

    store.dispatch(cancelReview());
    expect(await run).toEqual({ status: 'cancelled' });
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
    // A review of the service's that is stopped is counted; this one is not.
    expect(localStorage.getItem(PROTOCOL_REVIEW_QUOTA_KEY)).toBeNull();
    expect(store.getState().protocolReview.quota).toBeNull();
  });
});
