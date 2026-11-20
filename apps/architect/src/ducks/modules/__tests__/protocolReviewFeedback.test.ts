// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Finding,
  REVIEW_PATH,
  type ReviewResult,
} from '@codaco/protocol-review-worker/contract';
import { posthog } from '~/analytics';
import { timelineActions } from '~/ducks/middleware/timeline';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId } from '~/ducks/modules/app';
import {
  cancelReview,
  checkFixAvailability,
  commentOnReview,
  decideFinding,
  dismissReview,
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
import { FEEDBACK_COMMENT_MAX_LENGTH } from '~/protocolReview/reviewFeedback';
import { keepProtocolReviewOnActiveProtocol } from '~/protocolReview/reviewListener';
import { readReviewRecord } from '~/protocolReview/reviewStore';

vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

const PROBLEM_SURVEY_ID = '01a1f560-e7a6-0000-197a-8a38fee548d1';
const REVIEW_SURVEY_ID = '01a1f560-e8cb-0000-f278-9ef6ad9f3bb7';
const RATING = '$survey_response_666eab72-38ca-41d0-96f1-e8a5160624c7';
const REASON = '$survey_response_14e70b7d-7f2f-42b0-a4da-d51a2617fca6';
const COMMENT = '$survey_response_d1404b0d-14be-4a2f-befe-577bd0afedee';

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

/** The review service: answers every review with `RESULT`. */
const fetchImpl = vi.fn<typeof fetch>(async (input) => {
  const { pathname } = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (pathname !== REVIEW_PATH) throw new Error(`Unexpected ${pathname}`);
  return new Response(
    `data: ${JSON.stringify({ type: 'result', result: RESULT })}\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
});

type SurveyEvent = Record<string, unknown>;

/** Every `survey sent` event captured for `surveyId`, in order. */
const surveyEvents = (surveyId: string): SurveyEvent[] =>
  vi
    .mocked(posthog.capture)
    .mock.calls.filter(
      ([event, properties]) =>
        event === 'survey sent' && properties?.$survey_id === surveyId,
    )
    .map(([, properties]) => properties ?? {});

const problemEvents = () => surveyEvents(PROBLEM_SURVEY_ID);
const commentEvents = () => surveyEvents(REVIEW_SURVEY_ID);

/** The last event sent about each problem, by finding id. */
const latestByFinding = () =>
  Object.fromEntries(
    problemEvents().map((event) => [String(event.finding_id), event]),
  );

const outcomes = () =>
  Object.fromEntries(
    Object.entries(latestByFinding()).map(([id, event]) => [id, event.outcome]),
  );

let protocolCounter = 0;
let store: Store;

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
  vi.mocked(posthog.capture).mockClear();
  return id;
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchImpl);
  store = makeStore();
  localStorage.clear();
});

afterEach(() => {
  store.dispatch(cancelReview());
  // Closing the protocol drops any feedback still waiting to be sent.
  store.dispatch(setActiveProtocolId(null));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('feedback on a review that was not shared', () => {
  it('sends a rated problem without the review id, and nothing for one only decided', async () => {
    await reviewed(false);
    expect(
      (
        await readReviewRecord(
          store.getState().protocolReview.record?.protocolId ?? '',
        )
      ).review?.shared,
    ).toBe(false);

    await store.dispatch(decideFinding('title', 'fix'));
    await store.dispatch(decideFinding('advice', 'dismissed'));
    await store.dispatch(sendFeedback());
    expect(problemEvents()).toEqual([]);

    expect(
      await store.dispatch(rateFinding('title', 'not_useful', 'wrong')),
    ).toEqual({ ok: true });
    await store.dispatch(sendFeedback());
    expect(problemEvents()).toEqual([
      {
        $survey_id: PROBLEM_SURVEY_ID,
        $survey_submission_id: `${RESULT.reviewId}:title`,
        $survey_completed: true,
        [RATING]: 'Not useful',
        [REASON]: 'It is wrong about my protocol',
        finding_id: 'title',
        shared: false,
        outcome: 'fixed',
        severity: 'suggestion',
        category: 'burden',
        provider: 'anthropic',
      },
    ]);

    // A rated problem's outcome is sent again when it changes, and a rating
    // taken back leaves the response incomplete.
    await store.dispatch(undoFix('title'));
    await store.dispatch(sendFeedback());
    expect(latestByFinding().title).toMatchObject({ outcome: 'undecided' });
    await store.dispatch(rateFinding('title', null));
    await store.dispatch(sendFeedback());
    expect(problemEvents()).toHaveLength(3);
    expect(latestByFinding().title).toMatchObject({ $survey_completed: false });
    expect(latestByFinding().title).not.toHaveProperty(RATING);

    await store.dispatch(dismissReview());
    expect(problemEvents()).toHaveLength(3);
    expect(commentEvents()).toEqual([]);
  });

  it('sends written feedback, without the review id', async () => {
    await reviewed(false);
    expect(await store.dispatch(commentOnReview('Too many suggestions.'))).toBe(
      true,
    );
    expect(commentEvents()).toEqual([
      {
        $survey_id: REVIEW_SURVEY_ID,
        $survey_submission_id: RESULT.reviewId,
        $survey_completed: true,
        [COMMENT]: 'Too many suggestions.',
        shared: false,
        provider: 'anthropic',
      },
    ]);
    expect(problemEvents()).toEqual([]);
  });
});

describe('feedback on a shared review', () => {
  it('sends nothing while nothing has been done with the review', async () => {
    await reviewed(true);
    await store.dispatch(sendFeedback());
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('says what was done with each problem, and again only for a problem that changes', async () => {
    const id = await reviewed(true);
    await store.dispatch(decideFinding('title', 'fix'));
    await store.dispatch(decideFinding('advice', 'dismissed'));
    await store.dispatch(sendFeedback());

    expect(problemEvents()).toEqual([
      {
        $survey_id: PROBLEM_SURVEY_ID,
        $survey_submission_id: `${RESULT.reviewId}:title`,
        $survey_completed: false,
        review_id: RESULT.reviewId,
        finding_id: 'title',
        shared: true,
        outcome: 'fixed',
        severity: 'suggestion',
        category: 'burden',
        provider: 'anthropic',
      },
      expect.objectContaining({
        $survey_submission_id: `${RESULT.reviewId}:advice`,
        outcome: 'dismissed',
      }),
    ]);
    // What was sent is remembered beside the review.
    expect((await readReviewRecord(id)).review?.feedbackSent).toEqual({
      findings: {
        prompt: { outcome: 'undecided', rating: null, reason: null },
        title: { outcome: 'fixed', rating: null, reason: null },
        advice: { outcome: 'dismissed', rating: null, reason: null },
      },
      comment: '',
    });

    await store.dispatch(sendFeedback());
    expect(problemEvents()).toHaveLength(2);

    await store.dispatch(decideFinding('advice', 'undecided'));
    await store.dispatch(decideFinding('prompt', 'mine'));
    await store.dispatch(sendFeedback());
    expect(problemEvents()).toHaveLength(4);
    expect(outcomes()).toEqual({
      prompt: 'mine',
      title: 'fixed',
      advice: 'undecided',
    });
  });

  it('goes by itself a little after the last choice', async () => {
    await reviewed(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await store.dispatch(decideFinding('title', 'fix'));
    await vi.advanceTimersByTimeAsync(2000);
    await store.dispatch(decideFinding('advice', 'dismissed'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(problemEvents()).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(problemEvents()).toHaveLength(2));
    expect(outcomes()).toEqual({ title: 'fixed', advice: 'dismissed' });
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
    expect(outcomes()).toEqual({ prompt: 'fixed', title: 'fixed_edited' });
  });

  it('follows a fix that is undone, from the review or the toolbar', async () => {
    await reviewed(true);
    await store.dispatch(decideFinding('title', 'fix'));
    await store.dispatch(decideFinding('prompt', 'fix'));
    await store.dispatch(sendFeedback());
    expect(outcomes()).toEqual({ prompt: 'fixed', title: 'fixed' });

    expect(await store.dispatch(undoFix('prompt'))).toEqual({ ok: true });
    await store.dispatch(sendFeedback());
    expect(outcomes()).toEqual({ prompt: 'undecided', title: 'fixed' });

    // The app's own Undo takes the fix to the prompt back in (its undo was
    // the last change), then a second takes it out again with the title's.
    store.dispatch(timelineActions.undo());
    store.dispatch(timelineActions.undo());
    store.dispatch(timelineActions.undo());
    await store.dispatch(sendFeedback());
    expect(outcomes()).toEqual({ prompt: 'undecided', title: 'undecided' });
  });

  it('answers the survey with the rating, and a reason only for a problem that was not useful', async () => {
    await reviewed(true);
    await store.dispatch(rateFinding('prompt', 'useful', 'wrong'));
    await store.dispatch(rateFinding('title', 'not_useful', 'not_relevant'));
    await store.dispatch(rateFinding('advice', 'not_useful'));
    await store.dispatch(sendFeedback());

    const latest = latestByFinding();
    expect(latest.prompt).toMatchObject({
      $survey_completed: true,
      [RATING]: 'Useful',
    });
    expect(latest.prompt).not.toHaveProperty(REASON);
    expect(latest.title).toMatchObject({
      $survey_completed: true,
      [RATING]: 'Not useful',
      [REASON]: 'It does not matter for my study',
    });
    expect(latest.advice).toMatchObject({ [RATING]: 'Not useful' });
    expect(latest.advice).not.toHaveProperty(REASON);
    expect(
      getProtocolReviewFindings(store.getState()).map(
        ({ rating, ratingReason }) => [rating, ratingReason],
      ),
    ).toEqual([
      ['useful', null],
      ['not_useful', 'not_relevant'],
      ['not_useful', null],
    ]);

    // A rating taken back leaves the response incomplete and unanswered.
    await store.dispatch(rateFinding('title', null));
    await store.dispatch(sendFeedback());
    expect(problemEvents()).toHaveLength(4);
    expect(latestByFinding().title).toMatchObject({ $survey_completed: false });
    expect(latestByFinding().title).not.toHaveProperty(RATING);
  });

  it('sends written feedback as soon as it is made, trimmed and within the limit', async () => {
    await reviewed(true);
    const long = 'x'.repeat(FEEDBACK_COMMENT_MAX_LENGTH + 50);
    expect(await store.dispatch(commentOnReview(`  ${long}  `))).toBe(true);
    expect(commentEvents()).toEqual([
      {
        $survey_id: REVIEW_SURVEY_ID,
        $survey_submission_id: RESULT.reviewId,
        $survey_completed: true,
        [COMMENT]: 'x'.repeat(FEEDBACK_COMMENT_MAX_LENGTH),
        review_id: RESULT.reviewId,
        shared: true,
        provider: 'anthropic',
      },
    ]);
    expect(getProtocolReviewComment(store.getState())).toBe(
      'x'.repeat(FEEDBACK_COMMENT_MAX_LENGTH),
    );

    // Emptied, the comment sent before is taken back.
    await store.dispatch(commentOnReview('   '));
    expect(commentEvents()).toHaveLength(2);
    expect(commentEvents()[1]).toMatchObject({ $survey_completed: false });
    expect(commentEvents()[1]).not.toHaveProperty(COMMENT);
  });

  it('is sent as the review is dismissed, when some is still waiting', async () => {
    await reviewed(true);
    await store.dispatch(decideFinding('advice', 'dismissed'));
    expect(problemEvents()).toEqual([]);
    expect(await store.dispatch(dismissReview())).toBe(true);
    expect(outcomes()).toEqual({ advice: 'dismissed' });
  });
});
