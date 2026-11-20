// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { posthog } from '~/analytics';
import { setActiveProtocolId } from '~/ducks/modules/app';
import {
  cancelReview,
  checkFixAvailability,
  getProtocolReviewFindings,
  sendFeedback,
  setShareReviews,
  startReview,
} from '~/ducks/modules/protocolReview';
import {
  COMMENT,
  REVIEW_SURVEY_ID,
  surveyEvents,
} from '~/protocolReview/__tests__/surveyEvents';

import {
  makeStore,
  openProtocol,
  RESULT,
  renderToolbar,
  reviewButton,
  type TestStore,
} from './reviewTestHarness';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');
vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

// Nothing here may reach a network: the review, and the question of which
// providers have budget left. Feedback goes to the mocked PostHog.
const client = vi.hoisted(() => ({
  requestReview: vi.fn(),
  requestProviderStatus: vi.fn(),
}));
vi.mock('~/protocolReview/reviewClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/protocolReview/reviewClient')>()),
  requestReview: client.requestReview,
  requestProviderStatus: client.requestProviderStatus,
}));

/** Opens a protocol and completes a review of it, shared or not. */
const reviewed = async (store: TestStore, share: boolean) => {
  await openProtocol(store);
  await store.dispatch(setShareReviews(share));
  client.requestReview.mockResolvedValueOnce({
    kind: 'result',
    result: RESULT,
  });
  expect(await store.dispatch(startReview())).toMatchObject({
    status: 'completed',
  });
  await store.dispatch(checkFixAvailability());
};

const openPanel = async () => {
  await userEvent.click(reviewButton());
  return screen.findByRole('dialog', { name: 'Protocol review' });
};

/** Opens the problem titled `title` from the list. */
const openProblem = async (title: string) => {
  const panel = await openPanel();
  await userEvent.click(
    within(panel).getByRole('button', { name: new RegExp(title) }),
  );
  return within(await screen.findByRole('dialog', { name: title }));
};

const ratingOf = (store: TestStore, id: string) => {
  const finding = getProtocolReviewFindings(store.getState()).find(
    (candidate) => candidate.id === id,
  );
  return [finding?.rating, finding?.ratingReason];
};

/** The `survey sent` events carrying written feedback. */
const sentComments = () => surveyEvents(REVIEW_SURVEY_ID);

let store: TestStore;

beforeEach(() => {
  client.requestReview.mockReset();
  client.requestProviderStatus.mockReset().mockResolvedValue(null);
  vi.mocked(posthog.capture).mockClear();
  store = makeStore();
  localStorage.clear();
});

afterEach(() => {
  store.dispatch(cancelReview());
  store.dispatch(setActiveProtocolId(null));
});

describe('a review that was not shared', () => {
  it('asks for a rating and sends it without the review id', async () => {
    await reviewed(store, false);
    renderToolbar(store);
    const problem = await openProblem('The prompt is vague');
    const rating = problem.getByRole('group', {
      name: 'Was this useful?',
    });
    expect(rating).toBeVisible();
    await userEvent.click(
      within(rating).getByRole('button', { name: 'Useful' }),
    );
    await waitFor(() =>
      expect(ratingOf(store, 'prompt')).toEqual(['useful', null]),
    );
    await store.dispatch(sendFeedback());
    const [event, ...rest] = surveyEvents();
    expect(rest).toEqual([]);
    expect(event).toMatchObject({ finding_id: 'prompt', shared: false });
    expect(event).not.toHaveProperty('review_id');
  });

  it('still takes written feedback on the review', async () => {
    await reviewed(store, false);
    renderToolbar(store);
    const panel = within(await openPanel());
    await userEvent.click(
      panel.getByRole('button', { name: 'Leave feedback on this review' }),
    );
    await userEvent.type(
      await panel.findByRole('textbox', {
        name: 'Leave feedback on this review',
      }),
      'Too many suggestions.',
    );
    await userEvent.click(panel.getByRole('button', { name: 'Send feedback' }));
    await waitFor(() => expect(sentComments()).toHaveLength(1));
    expect(sentComments()[0]).toMatchObject({
      [COMMENT]: 'Too many suggestions.',
      shared: false,
    });
    expect(sentComments()[0]).not.toHaveProperty('review_id');
  });
});

describe('rating a problem', () => {
  it('rates a problem with two toggle buttons, and asks why only when it was not useful', async () => {
    await reviewed(store, true);
    renderToolbar(store);
    const problem = await openProblem('The prompt is vague');
    const rating = within(
      problem.getByRole('group', {
        name: 'Was this useful?',
      }),
    );
    const useful = rating.getByRole('button', { name: 'Useful' });
    const notUseful = rating.getByRole('button', { name: 'Not useful' });
    expect(useful).toHaveAttribute('aria-pressed', 'false');
    expect(notUseful).toHaveAttribute('aria-pressed', 'false');
    expect(problem.queryByRole('radiogroup')).not.toBeInTheDocument();

    await userEvent.click(useful);
    await waitFor(() => expect(useful).toHaveAttribute('aria-pressed', 'true'));
    expect(ratingOf(store, 'prompt')).toEqual(['useful', null]);
    expect(problem.queryByRole('radiogroup')).not.toBeInTheDocument();

    await userEvent.click(notUseful);
    const reasons = within(
      await problem.findByRole('radiogroup', { name: 'Why not? (optional)' }),
    );
    expect(useful).toHaveAttribute('aria-pressed', 'false');
    expect(ratingOf(store, 'prompt')).toEqual(['not_useful', null]);
    expect(
      reasons.getAllByRole('radio').map((radio) => radio.textContent),
    ).toHaveLength(3);

    await userEvent.click(
      reasons.getByRole('radio', { name: 'It does not matter for my study' }),
    );
    await waitFor(() =>
      expect(ratingOf(store, 'prompt')).toEqual(['not_useful', 'not_relevant']),
    );

    // Pressed again, the rating is taken back, and its reason with it.
    await userEvent.click(notUseful);
    await waitFor(() =>
      expect(ratingOf(store, 'prompt')).toEqual([null, null]),
    );
    expect(problem.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});

describe('a review that was shared', () => {
  it('sends a comment on the review, which can then be changed', async () => {
    await reviewed(store, true);
    renderToolbar(store);
    const panel = within(await openPanel());
    const open = panel.getByRole('button', {
      name: 'Leave feedback on this review',
    });
    await userEvent.click(open);

    const box = await panel.findByRole('textbox', {
      name: 'Leave feedback on this review',
    });
    expect(box).toHaveFocus();
    expect(box).toHaveAccessibleDescription(/Leave out names/);
    const send = panel.getByRole('button', { name: 'Send feedback' });
    // Nothing typed, nothing to send.
    await userEvent.click(send);
    expect(sentComments()).toEqual([]);

    await userEvent.type(box, 'The second problem misread my skip logic.');
    await userEvent.click(send);
    await waitFor(() => expect(sentComments()).toHaveLength(1));
    expect(sentComments()[0]).toMatchObject({
      [COMMENT]: 'The second problem misread my skip logic.',
      review_id: RESULT.reviewId,
      shared: true,
    });

    const change = await panel.findByRole('button', {
      name: 'Change your feedback',
    });
    await waitFor(() => expect(change).toHaveFocus());
    await userEvent.click(change);
    expect(
      await panel.findByRole('textbox', {
        name: 'Leave feedback on this review',
      }),
    ).toHaveValue('The second problem misread my skip logic.');
    await userEvent.click(panel.getByRole('button', { name: 'Cancel' }));
    expect(panel.queryByRole('textbox')).not.toBeInTheDocument();
    expect(sentComments()).toHaveLength(1);
  });
});
