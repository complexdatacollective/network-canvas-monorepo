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
  pressNext,
  requestDialog,
  requestReviewFromButton,
  requestStep,
  RESULT,
  renderToolbar,
  reviewButton,
  type TestStore,
} from './reviewTestHarness';

/** A problem whose fix is made in the codebook's Person type. */
const PERSON_FINDING = makeFinding(
  'person',
  [op('set', '/codebook/node/person/name', 'Friend')],
  {
    codebookEntity: 'node',
    codebookTypeId: 'person',
    title: 'The person type is too broad',
  },
);

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');
vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

// Neither request may reach a network: the review, and the question of which
// providers have budget left that the panel asks when it opens. Unless a
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

/** What a button is called: its label when it has one, else its text. */
const nameOf = (button: HTMLElement) =>
  button.getAttribute('aria-label') ?? button.textContent;

/** Presses Review protocol, which must open the panel. */
const openPanel = async () => {
  await userEvent.click(reviewButton());
  return screen.findByRole('dialog', { name: 'Protocol review' });
};

/** The panel, once it shows the problem titled `title` in the list's place. */
const problemView = (title: string) =>
  screen.findByRole('dialog', { name: title });

/** Opens the problem titled `title` from the list of a panel already open. */
const openProblemFromListAlreadyOpen = async (title: string) => {
  const panel = await screen.findByRole('dialog', { name: 'Protocol review' });
  await userEvent.click(
    within(panel).getByRole('button', { name: new RegExp(title) }),
  );
  return problemView(title);
};

/** Opens the problem titled `title` from the panel's list. */
const openProblemFromList = async (title: string) => {
  const panel = await openPanel();
  await userEvent.click(
    within(panel).getByRole('button', { name: new RegExp(title) }),
  );
  return problemView(title);
};

/** A review that could not be completed, for a protocol with no review. */
const failedWith = async (
  code: Extract<ReviewOutcome, { kind: 'error' }>['code'],
  retryAt: string | null = null,
) => {
  await openProtocol(store);
  answerWith({ kind: 'error', code, retryAt });
  expect(await store.dispatch(startReview())).toMatchObject({
    status: 'failed',
  });
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
  it.each([
    ['has no study details yet', { experiments: { protocolReview: {} } }],
    ['already has study details', {}],
  ])(
    'opens the dialog that starts a review, not the panel, while a protocol that %s has no review',
    async (_case, overrides) => {
      await openProtocol(store, makeProtocol(overrides));
      renderToolbar(store);

      await userEvent.click(reviewButton());

      expect(await requestStep('Before you use this feature')).toBeVisible();
      expect(
        screen.queryByRole('dialog', { name: 'Protocol review' }),
      ).toBeNull();
      expect(client.requestReview).not.toHaveBeenCalled();
    },
  );

  it('says the reviewer is thinking, moves the bar as it thinks, then says it is writing', async () => {
    await openProtocol(store);
    renderToolbar(store);
    const answer = gatedOutcome();
    let report: (progress: {
      received: number;
      thinking: number;
    }) => void = () => undefined;
    client.requestReview.mockImplementationOnce(
      async ({
        onProgress,
      }: {
        onProgress: (progress: { received: number; thinking: number }) => void;
      }) => {
        report = onProgress;
        return answer.promise;
      },
    );

    const panel = await requestReviewFromButton();
    const status = await within(panel).findByText(
      'The reviewer is reading your protocol and thinking it through.',
    );
    expect(status).toHaveAttribute('role', 'status');
    const bar = within(panel).getByRole('progressbar', {
      name: 'Review progress',
    });
    const atStart = Number(bar.getAttribute('aria-valuenow'));

    act(() => report({ received: 0, thinking: 4000 }));
    await waitFor(() =>
      expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(
        atStart + 20,
      ),
    );
    expect(status).toHaveTextContent(
      'The reviewer is reading your protocol and thinking it through.',
    );

    act(() => report({ received: 200, thinking: 4000 }));
    await waitFor(() =>
      expect(status).toHaveTextContent(
        'The reviewer is writing up what it found.',
      ),
    );

    await act(async () => {
      answer.release({ kind: 'result', result: RESULT });
    });
  });

  it('shows a review’s progress, then the count of problems still to decide', async () => {
    await openProtocol(store);
    renderToolbar(store);
    const answer = gatedOutcome();
    client.requestReview.mockReturnValueOnce(answer.promise);

    const panel = await requestReviewFromButton();

    expect(
      await within(panel).findByRole('heading', {
        name: 'Reviewing 3 stages against your study details',
      }),
    ).toBeVisible();
    expect(
      within(panel).getByRole('progressbar', { name: 'Review progress' }),
    ).toBeVisible();
    expect(reviewButton()).toHaveAccessibleName('Reviewing…');
    // Who writes a review is chosen before it starts, in the dialog.
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
    expect(within(panel).queryByRole('listbox')).toBeNull();

    // Closed, the button carries the progress itself.
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
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

  it('cancels a review from the panel, keeping nothing, and offers to start again', async () => {
    await openProtocol(store);
    renderToolbar(store);
    client.requestReview.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<ReviewOutcome>((resolve) => {
          signal.addEventListener('abort', () => resolve({ kind: 'aborted' }));
        }),
    );
    const panel = await requestReviewFromButton();
    await userEvent.click(
      await within(panel).findByRole('button', { name: 'Cancel review' }),
    );

    await waitFor(() =>
      expect(getProtocolReviewRun(store.getState())).toEqual({
        status: 'idle',
      }),
    );
    expect(within(panel).getByText('Not reviewed yet')).toBeVisible();
    expect(store.getState().protocolReview.record?.review).toBeNull();

    // Start review, here, is the way back into the dialog.
    await userEvent.click(
      await within(panel).findByRole('button', { name: 'Start review' }),
    );
    expect(await requestStep('Before you use this feature')).toBeVisible();
    expect(client.requestReview).toHaveBeenCalledTimes(1);
  });
});

describe('the results', () => {
  it('lists every problem, most serious first, with its severity and place written out', async () => {
    await reviewed(store);
    renderToolbar(store);

    const panel = await openPanel();
    expect(
      within(panel).getByText(
        'The results of your review are shown below in order of importance.',
      ),
    ).toBeVisible();
    const list = within(panel).getByRole('list', { name: 'Problems found' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('button')?.textContent)).toEqual(
      [
        'The prompt is vagueSerious · Stage 2 · Names',
        'The welcome title is unclearWorth fixing · Stage 1 · Welcome',
        'The person type is misusedWorth fixing · Codebook · Person',
        'Nothing answers the research questionSuggestion · Whole protocol',
      ],
    );
  });

  it('has two buttons under the list, and nothing about when, by whom or reviewing again', async () => {
    await reviewed(store);
    renderToolbar(store);

    const panel = await openPanel();
    const list = within(panel).getByRole('list', { name: 'Problems found' });
    const outsideTheList = within(panel)
      .getAllByRole('button')
      .filter((button) => !list.contains(button))
      .map(nameOf);
    expect(outsideTheList).toEqual([
      'Close',
      'Dismiss review',
      'Go through 4 problems',
    ]);
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
    expect(within(panel).queryByText(/^Reviewed /)).toBeNull();
    expect(within(panel).queryByText(/^Written by/)).toBeNull();
    expect(within(panel).queryByText(/reviews left this hour/)).toBeNull();
    expect(
      within(panel).queryByText('Nothing has changed since this review.'),
    ).toBeNull();
  });

  it('Dismiss review removes the review and closes the panel, and the button then opens the dialog', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('prompt', 'fix'));
    renderToolbar(store);
    const fixedProtocol = store.getState().activeProtocol.present;
    const share = store.getState().protocolReview.record?.shareReviews;

    const panel = await openPanel();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Dismiss review' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Protocol review' }),
      ).toBeNull(),
    );
    expect(store.getState().protocolReview.record).toMatchObject({
      review: null,
      shareReviews: share,
    });
    // What a fix changed is the protocol's now.
    expect(store.getState().activeProtocol.present).toBe(fixedProtocol);
    expect(reviewButton()).toHaveAccessibleName('Review protocol');
    expect(screen.getByText('Review dismissed.')).toBeInTheDocument();

    await userEvent.click(reviewButton());
    expect(await requestStep('Before you use this feature')).toBeVisible();
  });

  it('keeps the review, and says why, when Dismiss review is pressed in a tab that does not hold the protocol', async () => {
    await reviewed(store);
    renderToolbar(store);
    const panel = await openPanel();
    const reviewId = store.getState().protocolReview.record?.review?.reviewId;

    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Dismiss review' }),
    );

    expect(
      await within(panel).findByText(
        'The review could not be dismissed, because this protocol is open for editing in another tab. Dismiss it in that tab.',
      ),
    ).toBeVisible();
    expect(store.getState().protocolReview.record?.review?.reviewId).toBe(
      reviewId,
    );
    expect(
      within(panel).getByRole('list', { name: 'Problems found' }),
    ).toBeVisible();
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

    const panel = await openPanel();
    const row = within(panel).getByText('Fixed for you').closest('li');
    if (!row) throw new Error('No row');
    await userEvent.click(within(row).getByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(findingOf(store, 'prompt').status).toBe('undecided'),
    );
    expect(promptText(store)).toEqual({ en: 'Name people', fr: 'Nommez' });
    expect(within(panel).queryByText('Fixed for you')).toBeNull();
    expect(
      screen.getByText('Fix undone: The prompt is vague'),
    ).toBeInTheDocument();
  });

  it('links a problem the researcher took on to its stage, and restores a dismissed one', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('prompt', 'mine'));
    await store.dispatch(decideFinding('advice', 'dismissed'));
    renderToolbar(store);

    const panel = await openPanel();
    const list = within(panel).getByRole('list', { name: 'Problems found' });
    expect(within(list).getByText('For you to fix')).toBeVisible();
    const dismissedRow = within(list).getByText('Dismissed').closest('li');
    if (!dismissedRow) throw new Error('No row');
    await userEvent.click(
      within(dismissedRow).getByRole('button', { name: 'Undo dismiss' }),
    );
    await waitFor(() =>
      expect(findingOf(store, 'advice').status).toBe('undecided'),
    );

    await userEvent.click(
      within(panel).getByRole('link', { name: 'Open stage 2' }),
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

  it('says plainly when a review found nothing, and leaves only Dismiss review', async () => {
    await reviewed(store, { ...RESULT, findings: [] });
    renderToolbar(store);
    expect(reviewButton()).toHaveAccessibleName('Review protocol');

    const panel = await openPanel();
    expect(
      within(panel).getByText('The review found no problems.'),
    ).toBeVisible();
    expect(
      within(panel).queryByText(/shown below in order of importance/),
    ).toBeNull();
    expect(within(panel).getAllByRole('button').map(nameOf)).toEqual([
      'Close',
      'Dismiss review',
    ]);
  });

  it('stays usable offline: the list is there, with no notice about a review that cannot start', async () => {
    await reviewed(store);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderToolbar(store);

    const panel = await openPanel();
    expect(
      within(panel).getByRole('list', { name: 'Problems found' }),
    ).toBeVisible();
    expect(within(panel).queryByText('You’re offline')).toBeNull();
    expect(
      within(panel).getByRole('button', { name: 'Go through 4 problems' }),
    ).toBeEnabled();
  });
});

describe('notices, while there is no review', () => {
  const startButton = (panel: HTMLElement) =>
    within(panel).getByRole('button', { name: 'Start review' });

  it('says the researcher is offline, in the panel, and holds the dialog back', async () => {
    await openProtocol(store);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderToolbar(store);

    const panel = await openPanel();
    expect(within(panel).getByText('You’re offline')).toBeVisible();
    expect(
      within(panel).getByText(
        'Protocol review needs an internet connection. You can review this protocol when you are back online.',
      ),
    ).toBeVisible();
    expect(startButton(panel)).toHaveAttribute('aria-disabled', 'true');
    expect(startButton(panel)).toHaveAccessibleDescription('Offline');
    // Nothing is asked of the service without a connection.
    expect(client.requestProviderStatus).not.toHaveBeenCalled();
    await userEvent.click(startButton(panel));
    expect(screen.queryByTestId('wizard-next')).toBeNull();
  });

  it('explains the hourly limit and when it lifts', async () => {
    await failedWith('hourly_limit', FUTURE);
    renderToolbar(store);

    const panel = await openPanel();
    expect(
      within(panel).getByText('You have used your 5 reviews for this hour'),
    ).toBeVisible();
    expect(
      within(panel).getByText(
        /^You can review again (?!at ).+ at \d.+\. The limit keeps this free service available to everyone\.$/,
      ),
    ).toBeVisible();
    expect(startButton(panel)).toHaveAttribute('aria-disabled', 'true');
    expect(startButton(panel)).toHaveAccessibleDescription(
      /^Next review (?!at ).+ at \d/,
    );
    await userEvent.click(startButton(panel));
    expect(screen.queryByTestId('wizard-next')).toBeNull();
  });

  it.each([
    ['daily_limit', FUTURE],
    ['daily_limit', null],
    ['monthly_limit', FUTURE],
    ['monthly_limit', null],
  ] as const)(
    'says whose budget is spent (%s, retry at %s), and the dialog offers only the other model',
    async (code, retryAt) => {
      await failedWith(code, retryAt);
      renderToolbar(store);

      const panel = await openPanel();
      expect(
        within(panel).getByText('The budget for Anthropic has been spent'),
      ).toBeVisible();
      expect(
        within(panel).getByText(
          'This is a free experimental service with a fixed budget for each provider, shared by everyone who uses it. Start the review again to choose another model. Nothing in your protocol was changed.',
        ),
      ).toBeVisible();
      expect(startButton(panel)).not.toHaveAttribute('aria-disabled');

      await userEvent.click(startButton(panel));
      for (const step of [
        'Before you use this feature',
        'Describe your study',
        'Who takes part, and how?',
        'What are your research questions?',
      ] as const) {
        await requestStep(step);
        await pressNext();
      }
      await requestStep('Choose a model');
      const claude = requestDialog().getByRole('option', {
        name: /Claude Opus 5\.5/,
      });
      const gpt = requestDialog().getByRole('option', { name: /GPT-6\.1 Sol/ });
      expect(claude).toBeDisabled();
      expect(claude).toHaveTextContent(
        retryAt === null
          ? /The budget for Anthropic has been spent\.$/
          : /The budget for Anthropic has been spent\. It starts again (?!at ).+ at \d.+\.$/,
      );
      expect(gpt).toBeEnabled();
      expect(gpt).toHaveAttribute('aria-selected', 'true');

      client.requestReview.mockClear();
      answerWith({
        kind: 'result',
        result: { ...RESULT, reviewId: 'a3f0c4d2-1b5e-4c7a-9d8f-2e6b1a0c9d8e' },
      });
      await pressNext('Start review');
      await waitFor(() =>
        expect(store.getState().protocolReview.record?.review).toMatchObject({
          reviewId: 'a3f0c4d2-1b5e-4c7a-9d8f-2e6b1a0c9d8e',
          provider: 'openai',
        }),
      );
      expect(client.requestReview).toHaveBeenCalledTimes(1);
      expect(client.requestReview.mock.calls[0]?.[0]).toMatchObject({
        request: { provider: 'openai' },
      });
      const results = await screen.findByRole('dialog', {
        name: 'Protocol review',
      });
      expect(
        within(results).queryByText('The budget for Anthropic has been spent'),
      ).toBeNull();
    },
  );

  it('holds every review while each provider’s budget is spent, and says when the first starts again', async () => {
    await openProtocol(store);
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
    // The service is asked as soon as the button is on screen, so by the
    // time it is pressed the answer is known and the dialog is not opened
    // for nothing.
    await waitFor(() =>
      expect(Object.keys(store.getState().protocolReview.spent)).toHaveLength(
        2,
      ),
    );

    const panel = await openPanel();
    expect(
      await within(panel).findByText('Protocol review has reached its limit'),
    ).toBeVisible();
    expect(
      within(panel).getByText(
        'This is a free experimental service with a fixed budget for each provider, shared by everyone who uses it. Every provider’s budget has been spent.',
      ),
    ).toBeVisible();
    // Nothing failed, so there is nothing to dismiss.
    expect(within(panel).queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(startButton(panel)).toHaveAttribute('aria-disabled', 'true');
    // The first provider to start again is when a review can.
    expect(startButton(panel)).toHaveAccessibleDescription(
      /^Available again Jan 15, 2099 at \d/,
    );
    await userEvent.click(startButton(panel));
    expect(screen.queryByTestId('wizard-next')).toBeNull();
    expect(client.requestReview).not.toHaveBeenCalled();
  });

  it('says every budget is spent when the last provider with any refuses a review', async () => {
    client.requestProviderStatus.mockResolvedValue([
      { provider: 'anthropic', available: true, reason: null, retryAt: null },
      {
        provider: 'openai',
        available: false,
        reason: 'daily_limit',
        retryAt: FUTURE,
      },
    ]);
    await failedWith('daily_limit', FUTURE);
    renderToolbar(store);

    const panel = await openPanel();
    expect(
      await within(panel).findByText('Protocol review has reached its limit'),
    ).toBeVisible();
    expect(
      within(panel).queryByText('The budget for Anthropic has been spent'),
    ).toBeNull();
    expect(startButton(panel)).toHaveAttribute('aria-disabled', 'true');
  });

  it.each([
    'service_unavailable',
    'forbidden_origin',
    'invalid_request',
  ] as const)(
    'says the service is unavailable (%s), and Try again sends the same review without the dialog',
    async (code) => {
      await failedWith(code);
      renderToolbar(store);

      const panel = await openPanel();
      expect(
        within(panel).getByText('Protocol review is not available right now'),
      ).toBeVisible();
      expect(
        within(panel).getByText(
          /this attempt did not count towards your limit/,
        ),
      ).toBeVisible();
      expect(
        within(panel).queryByRole('button', { name: 'Start review' }),
      ).toBeNull();

      answerWith({
        kind: 'result',
        result: { ...RESULT, reviewId: 'a3f0c4d2-1b5e-4c7a-9d8f-2e6b1a0c9d8e' },
      });
      await userEvent.click(
        within(panel).getByRole('button', { name: 'Try again' }),
      );
      await waitFor(() =>
        expect(store.getState().protocolReview.record?.review?.reviewId).toBe(
          'a3f0c4d2-1b5e-4c7a-9d8f-2e6b1a0c9d8e',
        ),
      );
      expect(screen.queryByTestId('wizard-next')).toBeNull();
      expect(
        within(panel).queryByText('Protocol review is not available right now'),
      ).toBeNull();
      expect(
        await within(panel).findByRole('list', { name: 'Problems found' }),
      ).toBeVisible();
    },
  );

  it('says a protocol is too large, until the notice is dismissed', async () => {
    await failedWith('too_large');
    renderToolbar(store);

    const panel = await openPanel();
    expect(
      within(panel).getByText('This protocol is too large to review'),
    ).toBeVisible();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Dismiss' }),
    );
    expect(
      within(panel).queryByText('This protocol is too large to review'),
    ).toBeNull();
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
  });
});

describe('one problem at a time, in the panel', () => {
  it('Fix for me changes the protocol and stays on the problem to say so; the app’s Undo returns it', async () => {
    await reviewed(store);
    renderToolbar(store);
    const panel = await openPanel();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Go through 4 problems' }),
    );

    const dialog = await problemView('The prompt is vague');
    // The panel itself now shows the problem: nothing opened over it.
    expect(dialog).toBe(panel);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      within(dialog).getByRole('heading', { name: 'The prompt is vague' }),
    ).toHaveFocus();
    expect(within(dialog).getByText('Problem 1 of 4')).toBeVisible();
    expect(
      within(dialog).queryByText(/Fix for me changes your protocol now/),
    ).toBeNull();
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

    expect(
      await within(dialog).findByText(
        /This was fixed for you\. Undo takes the change back out of your protocol\./,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('heading', { name: 'The prompt is vague' }),
    ).toHaveFocus();
    expect(
      within(dialog).getAllByRole('link', { name: /Open stage/ }).length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByRole('button', { name: 'Undo' })).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Next problem' }),
    );

    const second = await problemView('The welcome title is unclear');
    expect(
      within(second).getByRole('heading', {
        name: 'The welcome title is unclear',
      }),
    ).toHaveFocus();
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

  it('offers no link to a stage the fix removed, only to the Stages screen', async () => {
    const remove = makeFinding('remove', [op('remove', '/stages/welcome')], {
      stageId: 'welcome',
      title: 'The welcome stage repeats the consent form',
    });
    await reviewed(store, { ...RESULT, findings: [remove] });
    renderToolbar(store);
    const dialog = await openProblemFromList(
      'The welcome stage repeats the consent form',
    );
    expect(
      within(dialog).getAllByRole('link', { name: /stage/i }).length,
    ).toBeGreaterThan(0);

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    );

    expect(
      await within(dialog).findByText(/This was fixed for you\./),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('link', { name: /^Stage 1|^Open stage 1/ }),
    ).toBeNull();
    expect(
      within(dialog).getByRole('link', { name: 'Open stages' }),
    ).toHaveAttribute('href', '/protocol');
  });

  it('makes the fix with the text the researcher changed it to', async () => {
    const scrollTo = vi
      .spyOn(HTMLElement.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    await reviewed(store);
    renderToolbar(store);
    const dialog = await openProblemFromList('The prompt is vague');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    const field = within(dialog).getByRole('textbox', {
      name: 'Prompt collection › Prompt 1 › Prompt text After the fix',
    });
    expect(field).toHaveTextContent('Name everyone you know');
    await userEvent.clear(field);
    await userEvent.type(field, 'Name the people you see most');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    );

    await waitFor(() =>
      expect(promptText(store)).toEqual({
        en: 'Name the people you see most',
        fr: 'Nommez',
      }),
    );
    expect(findingOf(store, 'prompt').status).toBe('fixed');
    // Back at the top, where the notice says it was fixed and offers Undo.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('puts the suggestion back when asked, and makes the fix as suggested', async () => {
    await reviewed(store);
    renderToolbar(store);
    const dialog = await openProblemFromList('The prompt is vague');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    await userEvent.type(
      within(dialog).getByRole('textbox', {
        name: 'Prompt collection › Prompt 1 › Prompt text After the fix',
      }),
      ' today',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Use suggestion' }),
    );
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    );

    await waitFor(() =>
      expect(promptText(store)).toEqual({
        en: 'Name everyone you know',
        fr: 'Nommez',
      }),
    );
  });

  it('returns to the list after the last decision, with every choice shown there', async () => {
    await reviewed(store);
    renderToolbar(store);
    const panel = await openPanel();
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Go through 4 problems' }),
    );

    let dialog = await problemView('The prompt is vague');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    );
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Next problem' }),
    );
    dialog = await problemView('The welcome title is unclear');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Dismiss' }),
    );
    dialog = await problemView('The person type is misused');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Dismiss' }),
    );
    // About the whole protocol, so there is nowhere to take the researcher:
    // the review moves on, here back to the list.
    dialog = await problemView('Nothing answers the research question');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix it myself' }),
    );

    const results = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    expect(results).toBe(panel);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/protocol$/);
    expect(findingOf(store, 'title').status).toBe('dismissed');
    expect(findingOf(store, 'broken').status).toBe('dismissed');
    expect(findingOf(store, 'advice').status).toBe('mine');
    const list = within(results).getByRole('list', { name: 'Problems found' });
    expect(within(list).getAllByText('For you to fix')).toHaveLength(1);
    expect(within(list).getAllByText('Dismissed')).toHaveLength(2);
    expect(within(list).getByText('Fixed for you')).toBeVisible();
    expect(
      screen.getByText(
        'You have been through every problem. Back at the list of problems.',
      ),
    ).toBeInTheDocument();
    // Nothing is left to go through, and nothing sums the review up.
    expect(
      within(results).queryByRole('button', { name: /Go through/ }),
    ).toBeNull();
    expect(
      within(results).getByRole('button', { name: 'Dismiss review' }),
    ).toBeVisible();
    expect(
      screen.queryByText('You have been through every problem'),
    ).toBeNull();
  });

  it('Back returns the panel to the list, on the row of the problem that was open', async () => {
    await reviewed(store);
    renderToolbar(store);
    const dialog = await openProblemFromList('The welcome title is unclear');
    expect(within(dialog).getByText('Problem 2 of 4')).toBeVisible();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));

    const results = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    expect(
      within(results).getByRole('button', {
        name: /The welcome title is unclear/,
      }),
    ).toHaveFocus();
    expect(findingOf(store, 'title').status).toBe('undecided');
    expect(
      within(results).getByRole('button', { name: 'Go through 4 problems' }),
    ).toBeVisible();
  });

  it('offers Next problem on a fixed problem only while another is still to decide', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('prompt', 'fix'));
    await store.dispatch(checkFixAvailability());
    renderToolbar(store);

    let dialog = await openProblemFromList('The prompt is vague');
    expect(within(dialog).getByRole('button', { name: 'Undo' })).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Next problem' }),
    );
    dialog = await problemView('The welcome title is unclear');

    await act(async () => {
      for (const id of ['title', 'broken', 'advice']) {
        await store.dispatch(decideFinding(id, 'dismissed'));
      }
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    dialog = await openProblemFromListAlreadyOpen('The prompt is vague');
    expect(within(dialog).getByRole('button', { name: 'Undo' })).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: 'Next problem' }),
    ).toBeNull();
  });

  it('Fix it myself goes to the stage, where the review opens on what is left to fix there', async () => {
    await reviewed(store);
    const home = renderToolbar(store);
    const dialog = await openProblemFromList('The welcome title is unclear');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Fix it myself' }),
    );
    expect(findingOf(store, 'title').status).toBe('mine');
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/protocol/stage/welcome',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Protocol review' }),
      ).toBeNull(),
    );
    home.unmount();

    renderToolbar(store, { path: '/protocol/stage/welcome' });
    await userEvent.click(reviewButton());
    const panel = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    expect(
      within(panel).getByRole('button', { name: 'For you to fix here' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const list = within(panel).getByRole('list', { name: 'Problems found' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(
      within(list).getByRole('button', {
        name: /The welcome title is unclear/,
      }),
    ).toBeVisible();

    await userEvent.click(
      within(panel).getByRole('button', { name: 'All problems' }),
    );
    expect(
      within(
        within(panel).getByRole('list', { name: 'Problems found' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(4);
  });

  it('opens on every problem from a stage with nothing left to fix there', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('title', 'mine'));
    renderToolbar(store, { path: '/protocol/stage/names' });
    await userEvent.click(reviewButton());
    const panel = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    expect(
      within(panel).getByRole('button', { name: 'All problems' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(
      within(panel).getByRole('button', { name: 'For you to fix here' }),
    );
    expect(
      within(panel).getByText('Nothing here is waiting for you to fix.'),
    ).toBeVisible();
  });

  it('offers the review outside the Stages screen only once there is one', async () => {
    await openProtocol(store);
    renderToolbar(store, { path: '/protocol/stage/welcome' });
    expect(
      screen.queryByRole('button', { name: /Review protocol/ }),
    ).toBeNull();
  });

  it('opens on the codebook’s problems from the Codebook page', async () => {
    await reviewed(store, {
      ...RESULT,
      findings: [...RESULT.findings, PERSON_FINDING],
    });
    await store.dispatch(decideFinding('person', 'mine'));
    await store.dispatch(decideFinding('title', 'mine'));
    renderToolbar(store, { path: '/protocol/codebook' });
    await userEvent.click(reviewButton());
    const panel = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    const list = within(panel).getByRole('list', { name: 'Problems found' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(
      within(list).getByRole('button', {
        name: /The person type is too broad/,
      }),
    ).toBeVisible();
  });

  it('marks a problem Done from the review, and takes it back with Not done yet', async () => {
    await reviewed(store);
    await store.dispatch(decideFinding('title', 'mine'));
    renderToolbar(store);

    let dialog = await openProblemFromList('The welcome title is unclear');
    expect(
      within(dialog).getByText(/You chose to fix this yourself\./),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('link', { name: 'Open stage 1' }),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(findingOf(store, 'title').status).toBe('done');

    dialog = await problemView('The person type is misused');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    const results = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    expect(within(results).getByText('Fixed by you')).toBeVisible();

    dialog = await openProblemFromListAlreadyOpen(
      'The welcome title is unclear',
    );
    expect(within(dialog).getByText(/You fixed this yourself\./)).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: 'Fix for me' }),
    ).toBeNull();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Not done yet' }),
    );
    expect(findingOf(store, 'title').status).toBe('mine');
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeVisible();
  });

  it('a fix that cannot be made offers Fix it myself instead', async () => {
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

  it('a fix whose target changed after the review is withdrawn, with Fix it myself offered', async () => {
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
        'This fix can no longer be made for you, because that part of the protocol changed after the review. Make the change yourself, using the description below.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Fix for me' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(dialog).getByRole('button', { name: 'Fix it myself' }),
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
      within(dialog).getByRole('button', { name: 'Undo dismiss' }),
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
      within(dialog).getByRole('button', { name: 'Undo dismiss' }),
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
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));

    dialog = await openProblemFromListAlreadyOpen(
      'The welcome title is unclear',
    );
    expect(within(dialog).getByText('Hello')).toBeVisible();
    expect(within(dialog).getByText('Welcome to our study')).toBeVisible();
    expect(within(dialog).getByText('Bonjour')).toBeVisible();
    expect(
      within(dialog).getByText('Bienvenue dans notre étude'),
    ).toBeVisible();
    expect(
      within(dialog).getByText('Page content › Page heading · English'),
    ).toBeVisible();
    expect(
      within(dialog).getByText('Page content › Page heading · French'),
    ).toBeVisible();
  });
});
