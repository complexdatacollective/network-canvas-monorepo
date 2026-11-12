// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { timelineActions } from '~/ducks/middleware/timeline';
import {
  setProtocolTranslation,
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import {
  cancelReview,
  checkFixAvailability,
  chooseReviewProvider,
  decideFinding,
  getProtocolReviewFindings,
  getProtocolReviewRun,
  startReview,
} from '~/ducks/modules/protocolReview';
import {
  makeFinding,
  makeProtocol,
  op,
} from '~/protocolReview/__tests__/fixtures';
import type { ReviewOutcome } from '~/protocolReview/reviewClient';

import {
  gatedOutcome,
  makeStore,
  openProtocol,
  RESULT,
  renderToolbar,
  reviewButton,
  type TestStore,
} from './reviewTestHarness';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');
vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

// Neither request may reach a network: the review, and the question of which
// providers have budget left that the popover asks when it opens. Unless a
// test says otherwise, that question gets no answer.
const client = vi.hoisted(() => ({
  requestReview: vi.fn(),
  requestProviderStatus: vi.fn(),
}));
vi.mock('~/protocolReview/reviewClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/protocolReview/reviewClient')>()),
  requestReview: client.requestReview,
  requestProviderStatus: client.requestProviderStatus,
}));

const answerWith = (outcome: ReviewOutcome) =>
  client.requestReview.mockResolvedValueOnce(outcome);

const FUTURE = '2099-01-01T00:00:00.000Z';

/** Opens a protocol and completes a review of it with `RESULT`. */
const reviewed = async (store: TestStore, result = RESULT) => {
  await openProtocol(store);
  answerWith({ kind: 'result', result });
  expect(await store.dispatch(startReview())).toMatchObject({
    status: 'completed',
  });
  await store.dispatch(checkFixAvailability());
};

const findingOf = (store: TestStore, id: string) => {
  const finding = getProtocolReviewFindings(store.getState()).find(
    (candidate) => candidate.id === id,
  );
  if (!finding) throw new Error(`No finding ${id}`);
  return finding;
};

const promptText = (store: TestStore) => {
  const stage = store.getState().activeProtocol.present?.stages[1];
  return stage && 'prompts' in stage ? stage.prompts[0]?.text : undefined;
};

/** Rewrites text no finding is about, so the protocol differs from the one reviewed. */
const changeTheProtocol = (target: TestStore) =>
  target.dispatch(
    setProtocolTranslation({
      path: ['stages', 2, 'content'],
      locale: 'en',
      text: 'The very end.',
    }),
  );

const openPopover = async () => {
  await userEvent.click(reviewButton());
  return screen.findByRole('dialog', { name: 'Protocol review' });
};

/** The one-problem dialog, once it shows `title`. */
const problemDialog = async (title: string) => {
  const heading = await screen.findByRole('heading', { name: title });
  const dialog = heading.closest<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error('No dialog');
  return dialog;
};

/** Opens the problem titled `title` from the popover's list. */
const openProblemFromList = async (title: string) => {
  const popover = await openPopover();
  await userEvent.click(
    within(popover).getByRole('button', { name: new RegExp(title) }),
  );
  return problemDialog(title);
};

let store: TestStore;

beforeEach(() => {
  store = makeStore();
  localStorage.clear();
  client.requestReview.mockReset();
  client.requestReview.mockResolvedValue({
    kind: 'error',
    code: 'service_unavailable',
    retryAt: null,
  });
  client.requestProviderStatus.mockReset();
  client.requestProviderStatus.mockResolvedValue(null);
});

afterEach(() => {
  store.dispatch(cancelReview());
  vi.restoreAllMocks();
});

describe('where the button is offered', () => {
  it('is on the Stages screen while the experiment is on and the tab may edit', async () => {
    await openProtocol(store);
    renderToolbar(store);
    expect(reviewButton()).toHaveAccessibleName('Review protocol');
  });

  it('is not offered on other pages, in a read-only tab, or with the experiment off', async () => {
    await openProtocol(store);
    const { unmount } = renderToolbar(store, { path: '/protocol/codebook' });
    expect(
      screen.queryByRole('button', { name: /Review protocol/ }),
    ).toBeNull();
    unmount();

    renderToolbar(store, { mode: 'locked' }).unmount();
    expect(
      screen.queryByRole('button', { name: /Review protocol/ }),
    ).toBeNull();

    const { experiments: _off, ...withoutExperiment } = makeProtocol();
    await openProtocol(store, withoutExperiment);
    renderToolbar(store);
    expect(
      screen.queryByRole('button', { name: /Review protocol/ }),
    ).toBeNull();
  });
});

describe('the button', () => {
  it('opens the study details wizard, not the popover, when there are no study details', async () => {
    await openProtocol(
      store,
      makeProtocol({ experiments: { protocolReview: {} } }),
    );
    renderToolbar(store);

    await userEvent.click(reviewButton());

    expect(
      await screen.findByRole('heading', {
        name: 'What are your research questions?',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('dialog', { name: 'Protocol review' }),
    ).toBeNull();
  });

  it('shows a review’s progress, then the count of problems still to decide', async () => {
    await openProtocol(store);
    renderToolbar(store);
    const answer = gatedOutcome();
    client.requestReview.mockReturnValueOnce(answer.promise);

    const popover = await openPopover();
    expect(within(popover).getByText('Not reviewed yet')).toBeVisible();
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Start review' }),
    );

    expect(
      await within(popover).findByRole('heading', {
        name: 'Reviewing 3 stages against your study details',
      }),
    ).toBeVisible();
    expect(
      within(popover).getByRole('progressbar', { name: 'Review progress' }),
    ).toBeVisible();
    expect(reviewButton()).toHaveAccessibleName('Reviewing…');

    // Closed, the button carries the progress itself.
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Close' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Protocol review' }),
      ).toBeNull(),
    );
    const ring = within(reviewButton()).getByRole('progressbar', {
      name: 'Review progress',
    });
    expect(Number(ring.getAttribute('aria-valuenow'))).toBeGreaterThan(0);

    await act(async () => {
      answer.release({ kind: 'result', result: RESULT });
    });
    await waitFor(() =>
      expect(reviewButton()).toHaveAccessibleName(
        'Review protocol, 4 problems still to decide',
      ),
    );
    expect(
      screen.getByText('Protocol review finished. It found 4 problems.'),
    ).toBeInTheDocument();
  });

  it('says aloud that a review failed', async () => {
    await openProtocol(store);
    renderToolbar(store);
    answerWith({ kind: 'error', code: 'service_unavailable', retryAt: null });

    await act(async () => {
      await store.dispatch(startReview());
    });

    expect(
      screen.getByText(
        'Protocol review could not be completed. Open Review protocol to see why.',
      ),
    ).toBeInTheDocument();
  });

  it('cancels a review from the popover, keeping nothing', async () => {
    await openProtocol(store);
    renderToolbar(store);
    client.requestReview.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<ReviewOutcome>((resolve) => {
          signal.addEventListener('abort', () => resolve({ kind: 'aborted' }));
        }),
    );
    const popover = await openPopover();
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Start review' }),
    );
    await userEvent.click(
      await within(popover).findByRole('button', { name: 'Cancel review' }),
    );

    await waitFor(() =>
      expect(getProtocolReviewRun(store.getState())).toEqual({
        status: 'idle',
      }),
    );
    expect(
      await within(popover).findByRole('button', { name: 'Start review' }),
    ).toBeVisible();
    expect(store.getState().protocolReview.record?.review).toBeNull();
  });
});

describe('the results', () => {
  it('lists every problem, most serious first, with its severity and place written out', async () => {
    await reviewed(store);
    // Changed since the review, so a new one may start and the caption
    // gives the hourly allowance rather than a reason.
    changeTheProtocol(store);
    renderToolbar(store);

    const popover = await openPopover();
    expect(
      within(popover).getByText(
        /^Reviewed today at .* · 4 problems, 4 still to decide$/,
      ),
    ).toBeVisible();
    const list = within(popover).getByRole('list', { name: 'Problems found' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('button')?.textContent)).toEqual(
      [
        'The prompt is vagueSerious · Stage 2 · Names',
        'The welcome title is unclearWorth fixing · Stage 1 · Welcome',
        'The person type is misusedWorth fixing · Codebook · Person',
        'Nothing answers the research questionSuggestion · Whole protocol',
      ],
    );
    expect(
      within(popover).getByRole('button', { name: 'Go through 4 problems' }),
    ).toBeVisible();
    expect(
      within(popover).getByText('4 of 5 reviews left this hour'),
    ).toBeVisible();
    expect(
      within(popover).getByRole('button', { name: 'Edit study details' }),
    ).toBeVisible();
  });

  it('refuses Review again with its reason while nothing has changed', async () => {
    await reviewed(store);
    renderToolbar(store);
    const popover = await openPopover();

    const again = within(popover).getByRole('button', { name: 'Review again' });
    expect(again).toHaveAttribute('aria-disabled', 'true');
    expect(again).toHaveAccessibleDescription(
      'Nothing has changed since this review.',
    );
    client.requestReview.mockClear();
    await userEvent.click(again);
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
  });

  it('offers Undo on a fix made for the researcher, which takes it back out', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('prompt', 'fix'));
    await store.dispatch(checkFixAvailability());
    renderToolbar(store);
    expect(promptText(store)).toEqual({
      en: 'Name everyone you know',
      fr: 'Nommez',
    });

    const popover = await openPopover();
    const row = within(popover).getByText('Fixed for you').closest('li');
    if (!row) throw new Error('No row');
    await userEvent.click(within(row).getByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(findingOf(store, 'prompt').status).toBe('undecided'),
    );
    expect(promptText(store)).toEqual({ en: 'Name people', fr: 'Nommez' });
    expect(within(popover).queryByText('Fixed for you')).toBeNull();
    expect(
      screen.getByText('Fix undone: The prompt is vague'),
    ).toBeInTheDocument();
  });

  it('links a problem the researcher took on to its stage, and restores a dismissed one', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('prompt', 'mine'));
    await store.dispatch(decideFinding('advice', 'dismissed'));
    renderToolbar(store);

    const popover = await openPopover();
    expect(within(popover).getByText('For you to fix')).toBeVisible();
    const dismissedRow = within(popover).getByText('Dismissed').closest('li');
    if (!dismissedRow) throw new Error('No row');
    await userEvent.click(
      within(dismissedRow).getByRole('button', { name: 'Restore' }),
    );
    await waitFor(() =>
      expect(findingOf(store, 'advice').status).toBe('undecided'),
    );

    await userEvent.click(
      within(popover).getByRole('link', { name: 'Open stage 2' }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/protocol/stage/names',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Protocol review' }),
      ).toBeNull(),
    );
  });

  it('says plainly when a review found nothing', async () => {
    await reviewed(store, { ...RESULT, findings: [] });
    renderToolbar(store);
    expect(reviewButton()).toHaveAccessibleName('Review protocol');

    const popover = await openPopover();
    expect(
      within(popover).getByText('The review found no problems.'),
    ).toBeVisible();
    expect(
      within(popover).queryByRole('button', { name: /Go through/ }),
    ).toBeNull();
    expect(
      within(popover).getByRole('button', { name: 'Review again' }),
    ).toBeVisible();
  });
});

describe('notices', () => {
  /** A finished review, then a change, so a new review may start. */
  const reviewedThenChanged = async () => {
    await reviewed(store);
    store.dispatch(
      setProtocolTranslation({
        path: ['stages', 0, 'title'],
        locale: 'en',
        text: 'Hello again',
      }),
    );
  };

  it('says the researcher is offline, keeps the results usable, and holds new reviews', async () => {
    await reviewedThenChanged();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderToolbar(store);

    const popover = await openPopover();
    expect(within(popover).getByText('You’re offline')).toBeVisible();
    expect(
      within(popover).getByText(
        'Protocol review needs an internet connection. Your last review is still here, and you can keep working through it.',
      ),
    ).toBeVisible();
    expect(
      within(popover).getByRole('button', { name: 'Review again' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(within(popover).getByText('Offline')).toBeVisible();
    expect(
      within(popover).getByRole('list', { name: 'Problems found' }),
    ).toBeVisible();
  });

  it('explains the hourly limit and when it lifts', async () => {
    await reviewedThenChanged();
    answerWith({ kind: 'error', code: 'hourly_limit', retryAt: FUTURE });
    await store.dispatch(startReview());
    renderToolbar(store);

    const popover = await openPopover();
    expect(
      within(popover).getByText('You have used your 5 reviews for this hour'),
    ).toBeVisible();
    expect(
      within(popover).getByText(
        /^You can review again (?!at ).+ at \d.+\. The limit keeps this free service available to everyone\.$/,
      ),
    ).toBeVisible();
    expect(
      within(popover).getByRole('button', { name: 'Review again' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(popover).getByText(/^Next review (?!at ).+ at \d/),
    ).toBeVisible();
    expect(within(popover).getByText(/^Last reviewed /)).toBeVisible();
  });

  const anthropicOption = (popover: HTMLElement) =>
    within(popover).getByRole('radio', { name: 'Anthropic Claude Opus 5.5' });
  const openaiOption = (popover: HTMLElement) =>
    within(popover).getByRole('radio', { name: 'OpenAI GPT-6.1 Sol' });

  it.each([
    ['daily_limit', FUTURE],
    ['daily_limit', null],
    ['monthly_limit', FUTURE],
    ['monthly_limit', null],
  ] as const)(
    'says whose budget is spent (%s, retry at %s), greys that provider out, and reviews with the other',
    async (code, retryAt) => {
      await reviewedThenChanged();
      answerWith({ kind: 'error', code, retryAt });
      await store.dispatch(startReview());
      renderToolbar(store);

      const popover = await openPopover();
      expect(
        within(popover).getByText('The budget for Anthropic has been spent'),
      ).toBeVisible();
      expect(
        within(popover).getByText(
          'This is a free experimental service with a fixed budget for each provider, shared by everyone who uses it. You can choose another provider for this review. Nothing in your protocol was changed.',
        ),
      ).toBeVisible();

      const reason =
        retryAt === null
          ? /^The budget for Anthropic has been spent\.$/
          : /^The budget for Anthropic has been spent\. It starts again (?!at ).+ at \d.+\.$/;
      expect(anthropicOption(popover)).toBeDisabled();
      expect(anthropicOption(popover)).toHaveAccessibleDescription(reason);
      // In sight too, and not read twice.
      const shown = within(popover)
        .getAllByText(reason)
        .filter((element) => !element.classList.contains('sr-only'));
      expect(shown).toHaveLength(1);
      expect(shown[0]).toBeVisible();
      expect(shown[0]).toHaveAttribute('aria-hidden', 'true');

      expect(openaiOption(popover)).toBeEnabled();
      expect(openaiOption(popover)).toBeChecked();
      expect(openaiOption(popover)).toHaveAccessibleDescription('');

      const again = within(popover).getByRole('button', {
        name: 'Review again',
      });
      expect(again).not.toHaveAttribute('aria-disabled', 'true');
      client.requestReview.mockClear();
      answerWith({
        kind: 'result',
        result: { ...RESULT, reviewId: 'a3f0c4d2-1b5e-4c7a-9d8f-2e6b1a0c9d8e' },
      });
      await userEvent.click(again);
      await waitFor(() =>
        expect(
          within(popover).getByText('Written by GPT-6.1 Sol (OpenAI)'),
        ).toBeVisible(),
      );
      expect(client.requestReview).toHaveBeenCalledTimes(1);
      expect(client.requestReview.mock.calls[0]?.[0]).toMatchObject({
        request: { provider: 'openai' },
      });
      expect(
        within(popover).queryByText('The budget for Anthropic has been spent'),
      ).toBeNull();
    },
  );

  it('holds every review while each provider’s budget is spent, and says when the first starts again', async () => {
    await reviewedThenChanged();
    client.requestProviderStatus.mockResolvedValue([
      {
        provider: 'anthropic',
        available: false,
        reason: 'monthly_limit',
        retryAt: '2099-02-15T12:00:00.000Z',
      },
      {
        provider: 'openai',
        available: false,
        reason: 'daily_limit',
        retryAt: '2099-01-15T12:00:00.000Z',
      },
    ]);
    renderToolbar(store);

    const popover = await openPopover();
    expect(
      await within(popover).findByText('Protocol review has reached its limit'),
    ).toBeVisible();
    expect(
      within(popover).getByText(
        'This is a free experimental service with a fixed budget for each provider, shared by everyone who uses it. Every provider’s budget has been spent.',
      ),
    ).toBeVisible();
    // Nothing failed, so there is nothing to dismiss.
    expect(
      within(popover).queryByRole('button', { name: 'Dismiss' }),
    ).toBeNull();
    expect(anthropicOption(popover)).toBeDisabled();
    expect(openaiOption(popover)).toBeDisabled();
    expect(anthropicOption(popover)).toHaveAccessibleDescription(
      /^The budget for Anthropic has been spent\. It starts again Feb 15, 2099 at /,
    );
    expect(openaiOption(popover)).toHaveAccessibleDescription(
      /^The budget for OpenAI has been spent\. It starts again Jan 15, 2099 at /,
    );

    const again = within(popover).getByRole('button', { name: 'Review again' });
    expect(again).toHaveAttribute('aria-disabled', 'true');
    // The first provider to start again is when a review can.
    expect(again).toHaveAccessibleDescription(
      /^Available again Jan 15, 2099 at \d/,
    );
    client.requestReview.mockClear();
    await userEvent.click(again);
    expect(client.requestReview).not.toHaveBeenCalled();
  });

  it('says every budget is spent when the last provider with any refuses a review', async () => {
    await reviewedThenChanged();
    client.requestProviderStatus.mockResolvedValue([
      { provider: 'anthropic', available: true, reason: null, retryAt: null },
      {
        provider: 'openai',
        available: false,
        reason: 'daily_limit',
        retryAt: FUTURE,
      },
    ]);
    answerWith({ kind: 'error', code: 'daily_limit', retryAt: FUTURE });
    await store.dispatch(startReview());
    renderToolbar(store);

    const popover = await openPopover();
    expect(
      await within(popover).findByText('Protocol review has reached its limit'),
    ).toBeVisible();
    expect(
      within(popover).queryByText('The budget for Anthropic has been spent'),
    ).toBeNull();
    expect(
      within(popover).getByRole('button', { name: 'Review again' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it.each([
    'service_unavailable',
    'forbidden_origin',
    'invalid_request',
  ] as const)(
    'says the service is unavailable (%s), and offers Try again',
    async (code) => {
      await reviewedThenChanged();
      answerWith({ kind: 'error', code, retryAt: null });
      await store.dispatch(startReview());
      renderToolbar(store);

      const popover = await openPopover();
      expect(
        within(popover).getByText('Protocol review is not available right now'),
      ).toBeVisible();
      expect(
        within(popover).getByText(
          /this attempt did not count towards your limit/,
        ),
      ).toBeVisible();

      answerWith({
        kind: 'result',
        result: { ...RESULT, reviewId: 'a3f0c4d2-1b5e-4c7a-9d8f-2e6b1a0c9d8e' },
      });
      await userEvent.click(
        within(popover).getByRole('button', { name: 'Try again' }),
      );
      await waitFor(() =>
        expect(
          within(popover).queryByText(
            'Protocol review is not available right now',
          ),
        ).toBeNull(),
      );
      expect(store.getState().protocolReview.record?.review?.reviewId).toBe(
        'a3f0c4d2-1b5e-4c7a-9d8f-2e6b1a0c9d8e',
      );
    },
  );

  it('says a protocol is too large, until the notice is dismissed', async () => {
    await reviewedThenChanged();
    answerWith({ kind: 'error', code: 'too_large', retryAt: null });
    await store.dispatch(startReview());
    renderToolbar(store);

    const popover = await openPopover();
    expect(
      within(popover).getByText('This protocol is too large to review'),
    ).toBeVisible();
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Dismiss' }),
    );
    expect(
      within(popover).queryByText('This protocol is too large to review'),
    ).toBeNull();
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
  });
});

describe('one problem at a time', () => {
  it('Fix for me changes the protocol and moves on; the app’s Undo returns the problem', async () => {
    await reviewed(store);
    renderToolbar(store);
    const popover = await openPopover();
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Go through 4 problems' }),
    );

    const dialog = await problemDialog('The prompt is vague');
    expect(within(dialog).getByText('Problem 1 of 4')).toBeVisible();
    expect(within(dialog).getByText('Name people')).toBeVisible();
    expect(within(dialog).getByText('Name everyone you know')).toBeVisible();
    expect(
      within(dialog).getByText(
        'This protocol also has this text in French. Fix for me does not change that version, so check it after the fix.',
      ),
    ).toBeVisible();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    );

    await problemDialog('The welcome title is unclear');
    expect(promptText(store)).toEqual({
      en: 'Name everyone you know',
      fr: 'Nommez',
    });
    expect(findingOf(store, 'prompt').status).toBe('fixed');
    expect(
      screen.getByText('Fixed for you: The prompt is vague'),
    ).toBeInTheDocument();

    act(() => {
      store.dispatch(timelineActions.undo());
    });
    expect(promptText(store)).toEqual({ en: 'Name people', fr: 'Nommez' });
    expect(findingOf(store, 'prompt').status).toBe('undecided');
  });

  it('I will fix this and Dismiss update the list, and the summary counts every choice', async () => {
    await reviewed(store);
    renderToolbar(store);
    const popover = await openPopover();
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Go through 4 problems' }),
    );

    let dialog = await problemDialog('The prompt is vague');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    );
    dialog = await problemDialog('The welcome title is unclear');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'I will fix this' }),
    );
    dialog = await problemDialog('The person type is misused');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Dismiss' }),
    );
    dialog = await problemDialog('Nothing answers the research question');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'I will fix this' }),
    );

    dialog = await problemDialog('You have been through every problem');
    const counts = within(dialog).getAllByRole('listitem').slice(0, 3);
    expect(counts.map((item) => item.textContent)).toEqual([
      '1 fixed for you',
      '2 for you to fix',
      '1 dismissed',
    ]);
    expect(
      within(dialog).getByRole('link', { name: 'Open stage 1' }),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        'The fix made for you can be undone from the Review protocol button.',
      ),
    ).toBeVisible();

    expect(findingOf(store, 'title').status).toBe('mine');
    expect(findingOf(store, 'broken').status).toBe('dismissed');
    expect(findingOf(store, 'advice').status).toBe('mine');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    const list = within(await openPopover()).getByRole('list', {
      name: 'Problems found',
    });
    expect(within(list).getAllByText('For you to fix')).toHaveLength(2);
    expect(within(list).getByText('Dismissed')).toBeVisible();
    expect(within(list).getByText('Fixed for you')).toBeVisible();
  });

  it('a fix that cannot be made offers I will fix this instead', async () => {
    await reviewed(store);
    renderToolbar(store);

    const dialog = await openProblemFromList('The person type is misused');
    expect(
      within(dialog).getByText(
        'This fix cannot be made for you. Make the change yourself, using the description below.',
      ),
    ).toBeVisible();
    const fix = within(dialog).getByRole('button', { name: 'Fix for me' });
    expect(fix).toHaveAttribute('aria-disabled', 'true');
    const before = store.getState().activeProtocol.present;
    await userEvent.click(fix);
    expect(store.getState().activeProtocol.present).toBe(before);
    expect(findingOf(store, 'broken').status).toBe('undecided');
  });

  it('a fix whose target changed after the review is withdrawn, with I will fix this offered', async () => {
    await reviewed(store);
    store.dispatch(
      setProtocolTranslation({
        path: ['stages', 1, 'prompts', 0, 'text'],
        locale: 'en',
        text: 'My own words',
      }),
    );
    renderToolbar(store);

    const dialog = await openProblemFromList('The prompt is vague');
    expect(
      within(dialog).getByText(
        'This fix can no longer be made for you, because that part of the protocol changed after the review. Make the change yourself, or review again to get a new fix.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(dialog).getByRole('button', { name: 'I will fix this' }),
    ).not.toHaveAttribute('aria-disabled');
  });

  it('stays on the problem and says why when the protocol is being edited in another tab', async () => {
    await reviewed(store);
    renderToolbar(store);
    const dialog = await openProblemFromList('The prompt is vague');

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    );

    expect(
      await within(dialog).findByText(
        'This protocol is open for editing in another tab, so it cannot be changed here. Make the change in that tab.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('heading', { name: 'The prompt is vague' }),
    ).toBeVisible();
    expect(promptText(store)).toEqual({ en: 'Name people', fr: 'Nommez' });
  });

  it('opens a decided problem in its current state, with what can still be done', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('title', 'dismissed'));
    renderToolbar(store);

    const dialog = await openProblemFromList('The welcome title is unclear');
    expect(
      within(dialog).getByText('You dismissed this problem.'),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: 'Dismiss' }),
    ).toBeNull();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Restore' }),
    );

    await waitFor(() =>
      expect(findingOf(store, 'title').status).toBe('undecided'),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Dismiss' }),
    ).toBeVisible();
  });

  it('checks a problem restored after a reload, though nothing checked it while dismissed', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('title', 'dismissed'));
    const id = store.getState().app.activeProtocolId;
    const protocol = store.getState().activeProtocol.present;
    if (typeof id !== 'string' || !protocol) throw new Error('setup');

    // A reload: a new store reads the saved review, with nothing checked.
    const reloaded = makeStore();
    reloaded.dispatch(setProtocolLockState('owned'));
    reloaded.dispatch(setActiveProtocolId(id));
    reloaded.dispatch(setActiveProtocol(protocol));
    await waitFor(() =>
      expect(reloaded.getState().protocolReview.record?.protocolId).toBe(id),
    );
    renderToolbar(reloaded);

    const dialog = await openProblemFromList('The welcome title is unclear');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Restore' }),
    );
    await waitFor(() =>
      expect(findingOf(reloaded, 'title').availability).toBe('available'),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    ).toBeEnabled();
  });

  it('previews a fix that replaces a whole localized text, translation by translation', async () => {
    await reviewed(store, {
      ...RESULT,
      findings: [
        makeFinding(
          'whole',
          [
            op('set', '/stages/names/prompts/p1/text', {
              en: 'Name everyone you know',
            }),
          ],
          { stageId: 'names', title: 'The prompt is vague' },
        ),
        makeFinding(
          'both',
          [
            op('set', '/stages/welcome/title', {
              en: 'Welcome to our study',
              fr: 'Bienvenue dans notre étude',
            }),
          ],
          { stageId: 'welcome', title: 'The welcome title is unclear' },
        ),
      ],
    });
    renderToolbar(store);

    let dialog = await openProblemFromList('The prompt is vague');
    expect(within(dialog).getByText('Name people')).toBeVisible();
    expect(within(dialog).getByText('Name everyone you know')).toBeVisible();
    expect(
      within(dialog).getByText(
        'This protocol also has this text in French. Fix for me does not change that version, so check it after the fix.',
      ),
    ).toBeVisible();
    await userEvent.keyboard('{Escape}');

    dialog = await openProblemFromList('The welcome title is unclear');
    expect(within(dialog).getByText('Hello')).toBeVisible();
    expect(within(dialog).getByText('Welcome to our study')).toBeVisible();
    expect(within(dialog).getByText('Bonjour')).toBeVisible();
    expect(
      within(dialog).getByText('Bienvenue dans notre étude'),
    ).toBeVisible();
    expect(within(dialog).getByText('English')).toBeVisible();
    expect(within(dialog).getByText('French')).toBeVisible();
  });
});

describe('the provider', () => {
  const provider = (popover: HTMLElement) =>
    within(popover).getByRole('radiogroup', {
      name: 'Provider for the next review',
    });
  const anthropic = (popover: HTMLElement) =>
    within(provider(popover)).getByRole('radio', {
      name: 'Anthropic Claude Opus 5.5',
    });
  const openai = (popover: HTMLElement) =>
    within(provider(popover)).getByRole('radio', {
      name: 'OpenAI GPT-6.1 Sol',
    });

  it('is Anthropic until the researcher chooses, and the choice is who writes the next review', async () => {
    await openProtocol(store);
    renderToolbar(store);
    const popover = await openPopover();

    expect(anthropic(popover)).toBeChecked();
    expect(openai(popover)).not.toBeChecked();
    expect(within(popover).queryByText(/^Written by/)).toBeNull();

    await userEvent.click(openai(popover));
    expect(openai(popover)).toBeChecked();
    expect(localStorage.getItem('architect-v9-protocol-review-provider')).toBe(
      'openai',
    );

    answerWith({ kind: 'result', result: RESULT });
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Start review' }),
    );
    expect(
      await within(popover).findByText('Written by GPT-6.1 Sol (OpenAI)'),
    ).toBeVisible();
    expect(client.requestReview.mock.calls[0]?.[0]).toMatchObject({
      request: { provider: 'openai' },
    });
  });

  it('says who wrote the review shown, and lets the other provider review the same protocol', async () => {
    await reviewed(store);
    renderToolbar(store);
    const popover = await openPopover();

    expect(
      within(popover).getByText('Written by Claude Opus 5.5 (Anthropic)'),
    ).toBeVisible();
    const again = within(popover).getByRole('button', { name: 'Review again' });
    expect(again).toHaveAccessibleDescription(
      'Nothing has changed since this review.',
    );

    await userEvent.click(openai(popover));
    expect(again).not.toHaveAttribute('aria-disabled', 'true');
    expect(again).toHaveAccessibleDescription('');
    await userEvent.click(anthropic(popover));
    expect(again).toHaveAttribute('aria-disabled', 'true');
  });

  it('asks the service who has budget each time the popover opens, and greys out who has none', async () => {
    await openProtocol(store);
    store.dispatch(chooseReviewProvider('openai'));
    client.requestProviderStatus.mockResolvedValue([
      { provider: 'anthropic', available: true, reason: null, retryAt: null },
      {
        provider: 'openai',
        available: false,
        reason: 'monthly_limit',
        retryAt: '2099-01-15T12:00:00.000Z',
      },
    ]);
    renderToolbar(store);
    expect(client.requestProviderStatus).not.toHaveBeenCalled();

    const popover = await openPopover();
    await waitFor(() => expect(openai(popover)).toBeDisabled());
    expect(client.requestProviderStatus).toHaveBeenCalledTimes(1);
    expect(openai(popover)).toHaveAccessibleDescription(
      /^The budget for OpenAI has been spent\. It starts again Jan 15, 2099 at /,
    );
    // The review goes to the provider that can write it; the choice stands.
    expect(anthropic(popover)).toBeChecked();
    expect(anthropic(popover)).toBeEnabled();
    expect(store.getState().protocolReview.provider).toBe('openai');
    // One provider is spent, not the service: no notice, and a review can start.
    expect(within(popover).queryByRole('alert')).toBeNull();
    expect(
      within(popover).queryByText('Protocol review has reached its limit'),
    ).toBeNull();

    answerWith({ kind: 'result', result: RESULT });
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Start review' }),
    );
    expect(
      await within(popover).findByText(
        'Written by Claude Opus 5.5 (Anthropic)',
      ),
    ).toBeVisible();

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Protocol review' }),
      ).toBeNull(),
    );
    await openPopover();
    await waitFor(() =>
      expect(client.requestProviderStatus).toHaveBeenCalledTimes(2),
    );
  });

  it('does not ask the service while offline, and cannot be changed while a review runs', async () => {
    await openProtocol(store);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderToolbar(store);
    let popover = await openPopover();
    expect(client.requestProviderStatus).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Protocol review' }),
      ).toBeNull(),
    );

    online.mockReturnValue(true);
    const gate = gatedOutcome();
    client.requestReview.mockReturnValueOnce(gate.promise);
    void store.dispatch(startReview());
    popover = await openPopover();
    await waitFor(() => expect(anthropic(popover)).toBeDisabled());
    expect(anthropic(popover)).toBeChecked();
    expect(openai(popover)).toBeDisabled();
    await act(async () => {
      gate.release({ kind: 'result', result: RESULT });
      await gate.promise;
    });
    await waitFor(() => expect(openai(popover)).toBeEnabled());
  });
});
