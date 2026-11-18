// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FEEDBACK_PATH,
  type FeedbackErrorCode,
  type FeedbackRequest,
  FeedbackRequestSchema,
  type Finding,
  REVIEW_LIMITS,
  REVIEW_PATH,
  type ReviewResult,
} from '@codaco/protocol-review-worker/contract';
import { timelineActions } from '~/ducks/middleware/timeline';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId } from '~/ducks/modules/app';
import {
  cancelReview,
  checkFixAvailability,
  commentOnReview,
  decideFinding,
  dismissReview,
  getIsProtocolReviewShared,
  getProtocolReviewComment,
  getProtocolReviewFindings,
  rateFinding,
  sendFeedback,
  setShareReviews,
  startReview,
  undoFix,
} from '~/ducks/modules/protocolReview';
import { rootReducer } from '~/ducks/modules/root';
import {
  makeFinding,
  makeProtocol,
  op,
} from '~/protocolReview/__tests__/fixtures';
import { getReviewInstallationId } from '~/protocolReview/browserState';
import { keepProtocolReviewOnActiveProtocol } from '~/protocolReview/reviewListener';
import { readReviewRecord } from '~/protocolReview/reviewStore';

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
  makeFinding('advice', [], { category: 'research_fit' }),
];

const RESULT: ReviewResult = {
  reviewId: '0b8f4c1e-9d0a-4a3e-8f8f-1f2e3d4c5b6a',
  findings: FINDINGS,
  quota: { limit: 5, remaining: 4, resetsAt: '2099-01-01T00:00:00.000Z' },
};

/**
 * The review service: answers a review with `RESULT`, and keeps every
 * feedback request it is sent, answering each as `feedbackAnswer` says.
 */
const service = () => {
  const feedback: FeedbackRequest[] = [];
  const state: { feedbackAnswer: 'sent' | FeedbackErrorCode } = {
    feedbackAnswer: 'sent',
  };
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const { pathname } = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (pathname === REVIEW_PATH) {
      return new Response(
        `data: ${JSON.stringify({ type: 'result', result: RESULT })}\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    if (pathname !== FEEDBACK_PATH) throw new Error(`Unexpected ${pathname}`);
    // Whatever Architect sends must be what the service accepts.
    feedback.push(
      FeedbackRequestSchema.parse(
        JSON.parse(typeof init?.body === 'string' ? init.body : 'null'),
      ),
    );
    return state.feedbackAnswer === 'sent'
      ? new Response(null, { status: 204 })
      : new Response(
          JSON.stringify({ error: state.feedbackAnswer, retryAt: null }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
  });
  return { fetchImpl, feedback, state };
};

let protocolCounter = 0;
let store: Store;
let server: ReturnType<typeof service>;

/** Opens a protocol and completes a review of it, shared or not. */
const reviewed = async (share: boolean) => {
  protocolCounter += 1;
  const id = `feedback-protocol-${protocolCounter}`;
  store.dispatch(setActiveProtocolId(id));
  store.dispatch(setActiveProtocol(makeProtocol()));
  await vi.waitFor(() => {
    expect(store.getState().protocolReview.record?.protocolId).toBe(id);
  });
  await store.dispatch(setShareReviews(share));
  expect(await store.dispatch(startReview())).toMatchObject({
    status: 'completed',
  });
  await store.dispatch(checkFixAvailability());
  return id;
};

const lastFeedback = () => {
  const last = server.feedback.at(-1);
  if (!last) throw new Error('No feedback was sent');
  return last;
};

const outcomes = (request: FeedbackRequest) =>
  Object.fromEntries(request.findings.map(({ id, outcome }) => [id, outcome]));

beforeEach(() => {
  server = service();
  vi.stubGlobal('fetch', server.fetchImpl);
  store = makeStore();
  localStorage.clear();
});

afterEach(() => {
  store.dispatch(cancelReview());
  // Closing the protocol drops any feedback still waiting to be sent.
  store.dispatch(setActiveProtocolId(null));
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('feedback on a review that was not shared', () => {
  it('is never sent, and no rating or comment is kept', async () => {
    const id = await reviewed(false);
    expect(getIsProtocolReviewShared(store.getState())).toBe(false);

    await store.dispatch(decideFinding('title', 'fix'));
    await store.dispatch(decideFinding('advice', 'dismissed'));
    expect(await store.dispatch(rateFinding('prompt', 'useful'))).toEqual({
      ok: false,
      reason: 'no_review',
    });
    expect(await store.dispatch(commentOnReview('Helpful'))).toBe(false);
    await store.dispatch(sendFeedback());
    await store.dispatch(dismissReview());

    expect(server.feedback).toEqual([]);
    expect((await readReviewRecord(id)).review).toBeNull();
  });
});

describe('feedback on a shared review', () => {
  it('sends nothing while nothing has been done with the review', async () => {
    await reviewed(true);
    expect(getIsProtocolReviewShared(store.getState())).toBe(true);
    await store.dispatch(sendFeedback());
    expect(server.feedback).toEqual([]);
  });

  it('says what was done with each problem, once, and again only when that changes', async () => {
    const id = await reviewed(true);
    await store.dispatch(decideFinding('title', 'fix'));
    await store.dispatch(decideFinding('prompt', 'mine'));
    await store.dispatch(decideFinding('advice', 'dismissed'));
    await store.dispatch(sendFeedback());

    expect(server.feedback).toHaveLength(1);
    expect(lastFeedback()).toEqual({
      installationId: getReviewInstallationId(),
      reviewId: RESULT.reviewId,
      findings: [
        { id: 'prompt', outcome: 'mine', rating: null, reason: null },
        { id: 'title', outcome: 'fixed', rating: null, reason: null },
        { id: 'advice', outcome: 'dismissed', rating: null, reason: null },
      ],
      comment: null,
    });
    // What the service took is remembered beside the review.
    expect((await readReviewRecord(id)).review?.feedbackSent).toBe(
      JSON.stringify({
        findings: lastFeedback().findings,
        comment: null,
      }),
    );

    await store.dispatch(sendFeedback());
    expect(server.feedback).toHaveLength(1);

    await store.dispatch(decideFinding('prompt', 'done'));
    await store.dispatch(sendFeedback());
    expect(server.feedback).toHaveLength(2);
    expect(outcomes(lastFeedback())).toEqual({
      prompt: 'done',
      title: 'fixed',
      advice: 'dismissed',
    });
  });

  it('goes by itself a little after the last choice, as one request', async () => {
    await reviewed(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await store.dispatch(decideFinding('title', 'fix'));
    await vi.advanceTimersByTimeAsync(2000);
    await store.dispatch(decideFinding('advice', 'dismissed'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(server.feedback).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(server.feedback).toHaveLength(1));
    expect(outcomes(lastFeedback())).toEqual({
      prompt: 'undecided',
      title: 'fixed',
      advice: 'dismissed',
    });
  });

  it('tells a fix made as written from one the researcher edited first', async () => {
    await reviewed(true);
    const [edit] =
      getProtocolReviewFindings(store.getState()).find(
        (finding) => finding.id === 'title',
      )?.textEdits ?? [];
    if (!edit) throw new Error('The title fix rewrites no text');
    expect(
      await store.dispatch(
        decideFinding('title', 'fix', { [edit.path]: 'Welcome, everyone' }),
      ),
    ).toEqual({ ok: true });
    expect(await store.dispatch(decideFinding('prompt', 'fix'))).toEqual({
      ok: true,
    });
    await store.dispatch(sendFeedback());
    expect(outcomes(lastFeedback())).toEqual({
      prompt: 'fixed',
      title: 'fixed_edited',
      advice: 'undecided',
    });
  });

  it('follows a fix that is undone, from the review or the toolbar', async () => {
    await reviewed(true);
    await store.dispatch(decideFinding('title', 'fix'));
    await store.dispatch(decideFinding('prompt', 'fix'));
    await store.dispatch(sendFeedback());
    expect(outcomes(lastFeedback())).toMatchObject({
      prompt: 'fixed',
      title: 'fixed',
    });

    expect(await store.dispatch(undoFix('prompt'))).toEqual({ ok: true });
    await store.dispatch(sendFeedback());
    expect(outcomes(lastFeedback())).toMatchObject({
      prompt: 'undecided',
      title: 'fixed',
    });

    // The app's own Undo takes the fix to the prompt back in (its undo was
    // the last change), then a second takes it out again with the title's.
    store.dispatch(timelineActions.undo());
    store.dispatch(timelineActions.undo());
    store.dispatch(timelineActions.undo());
    await store.dispatch(sendFeedback());
    expect(outcomes(lastFeedback())).toMatchObject({
      prompt: 'undecided',
      title: 'undecided',
    });
  });

  it('carries ratings, with a reason only for a problem that was not useful', async () => {
    await reviewed(true);
    await store.dispatch(rateFinding('prompt', 'useful', 'wrong'));
    await store.dispatch(rateFinding('title', 'not_useful', 'not_relevant'));
    await store.dispatch(rateFinding('advice', 'not_useful'));
    await store.dispatch(sendFeedback());
    expect(lastFeedback().findings).toEqual([
      { id: 'prompt', outcome: 'undecided', rating: 'useful', reason: null },
      {
        id: 'title',
        outcome: 'undecided',
        rating: 'not_useful',
        reason: 'not_relevant',
      },
      {
        id: 'advice',
        outcome: 'undecided',
        rating: 'not_useful',
        reason: null,
      },
    ]);
    expect(
      getProtocolReviewFindings(store.getState()).map(
        ({ rating, ratingReason }) => [rating, ratingReason],
      ),
    ).toEqual([
      ['useful', null],
      ['not_useful', 'not_relevant'],
      ['not_useful', null],
    ]);

    // A rating taken back is sent as none.
    await store.dispatch(rateFinding('title', null));
    await store.dispatch(sendFeedback());
    expect(lastFeedback().findings[1]).toMatchObject({
      rating: null,
      reason: null,
    });
  });

  it('sends a comment as soon as it is made, trimmed and within the limit', async () => {
    await reviewed(true);
    const long = 'x'.repeat(REVIEW_LIMITS.maxFeedbackCommentLength + 50);
    expect(await store.dispatch(commentOnReview(`  ${long}  `))).toBe(true);
    await vi.waitFor(() => expect(server.feedback).toHaveLength(1));
    expect(lastFeedback().comment).toBe(
      'x'.repeat(REVIEW_LIMITS.maxFeedbackCommentLength),
    );
    expect(getProtocolReviewComment(store.getState())).toBe(
      lastFeedback().comment,
    );

    // Emptied, the comment sent before is taken back.
    await store.dispatch(commentOnReview('   '));
    await vi.waitFor(() => expect(server.feedback).toHaveLength(2));
    expect(lastFeedback().comment).toBeNull();
  });

  it('is sent as the review is dismissed, when some is still waiting', async () => {
    await reviewed(true);
    await store.dispatch(decideFinding('advice', 'dismissed'));
    expect(server.feedback).toEqual([]);
    expect(await store.dispatch(dismissReview())).toBe(true);
    await vi.waitFor(() => expect(server.feedback).toHaveLength(1));
    expect(outcomes(lastFeedback())).toMatchObject({ advice: 'dismissed' });
  });

  it('is sent again at the next change when the service did not take it', async () => {
    const id = await reviewed(true);
    server.state.feedbackAnswer = 'service_unavailable';
    await store.dispatch(decideFinding('advice', 'dismissed'));
    await store.dispatch(sendFeedback());
    expect(server.feedback).toHaveLength(1);
    expect((await readReviewRecord(id)).review?.feedbackSent).toBeUndefined();

    server.state.feedbackAnswer = 'sent';
    await store.dispatch(sendFeedback());
    expect(server.feedback).toHaveLength(2);
    expect(outcomes(lastFeedback())).toMatchObject({ advice: 'dismissed' });
    expect((await readReviewRecord(id)).review?.feedbackSent).toBeDefined();
  });

  it('stops being asked for once the service holds no copy of the review', async () => {
    const id = await reviewed(true);
    server.state.feedbackAnswer = 'unknown_review';
    await store.dispatch(decideFinding('advice', 'dismissed'));
    await store.dispatch(sendFeedback());
    // Just reviewed: the copy may not be readable yet, so nothing is concluded.
    expect(getIsProtocolReviewShared(store.getState())).toBe(true);

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
    await store.dispatch(sendFeedback());
    expect(server.feedback).toHaveLength(2);
    expect(getIsProtocolReviewShared(store.getState())).toBe(false);
    expect((await readReviewRecord(id)).review?.shared).toBe(false);

    await store.dispatch(decideFinding('title', 'dismissed'));
    await store.dispatch(sendFeedback());
    expect(server.feedback).toHaveLength(2);
  });
});
