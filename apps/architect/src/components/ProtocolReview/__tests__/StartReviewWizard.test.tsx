// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setProtocolLockState } from '~/ducks/modules/app';
import {
  cancelReview,
  chooseReviewProvider,
  getProtocolReviewRun,
  getShareReviewsChoice,
} from '~/ducks/modules/protocolReview';
import {
  makeProtocol,
  STUDY_CONTEXT,
} from '~/protocolReview/__tests__/fixtures';
import { getProtocolReviewStudyContext } from '~/selectors/protocol';

import {
  gatedOutcome,
  makeStore,
  openProtocol,
  openRequestDialogAt,
  pressNext,
  requestDialog,
  requestStep,
  renderToolbar,
  reviewButton,
  type TestStore,
} from './reviewTestHarness';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');
vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));

// Neither request may reach a network: the review, and the question of which
// providers have budget left that the last step asks when it opens. Unless a
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

const NO_DETAILS = makeProtocol({ experiments: { protocolReview: {} } });

const SHARE_LABEL =
  'Share the results of this review with the Network Canvas team';

const question = (number: number) =>
  requestDialog().getByRole('textbox', {
    name: `Research question ${number}`,
  });

const synopsis = () =>
  requestDialog().getByRole('textbox', { name: 'Study synopsis' });

const population = () =>
  requestDialog().getByRole('textbox', { name: 'Research population' });

const model = (name: RegExp) => requestDialog().getByRole('option', { name });

/** What the review service was last asked. */
const lastRequest = (): unknown => client.requestReview.mock.lastCall?.[0];

/** Fills the two required study steps and stops on the research questions. */
const fillToQuestions = async () => {
  await pressNext();
  await requestStep('Describe your study');
  await userEvent.type(synopsis(), 'An online survey.');
  await pressNext();
  await requestStep('Who takes part, and how?');
  await userEvent.type(population(), 'Carers of older adults');
  await userEvent.click(
    requestDialog().getByRole('option', { name: /Self-administered/ }),
  );
  await pressNext();
  await requestStep('What are your research questions?');
};

let store: TestStore;

beforeEach(() => {
  store = makeStore();
  localStorage.clear();
  client.requestReview.mockReset();
  client.requestReview.mockReturnValue(gatedOutcome().promise);
  client.requestProviderStatus.mockReset();
  client.requestProviderStatus.mockResolvedValue(null);
});

afterEach(() => {
  store.dispatch(cancelReview());
  vi.restoreAllMocks();
});

describe('asking for a first review', () => {
  const openDialog = async () => {
    await openProtocol(store, NO_DETAILS);
    renderToolbar(store);
    await userEvent.click(reviewButton());
    await requestStep('Before you use this feature');
  };

  it('opens on what the feature does and sends, with sharing ticked', async () => {
    await openDialog();

    expect(
      requestDialog().getByText(
        'This experimental feature uses LLMs (also known as ‘AI’) to generate review feedback to help you improve your protocol. To use this feature, your protocol must be sent to one of the providers we support (Anthropic and OpenAI). Ensure that you are permitted to do this by your IRB or ethics review body.',
      ),
    ).toBeVisible();

    const table = requestDialog().getByRole('table', {
      name: 'What is sent for review, and what is never sent',
    });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['What is sent', 'What is never sent']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      [
        'Stage names, prompts, forms and skip logic',
        'Images, video, audio and other resources',
      ],
      [
        'The codebook: node types, edge types, attributes and their options',
        'API keys saved in your protocol',
      ],
      [
        'The study details you give in the next three steps',
        'Roster data files',
      ],
      ['', 'Interview data. Architect never holds any.'],
    ]);

    expect(
      requestDialog().getByRole('checkbox', { name: SHARE_LABEL }),
    ).toBeChecked();
    expect(
      requestDialog().getByText(
        'When this is checked, the Network Canvas team will retain a copy of your study details, the protocol, and the results of the review for 90 days. We will use this information only for the purposes of improving this feature.',
      ),
    ).toBeVisible();
  });

  it('keeps a step until its values are valid, and focuses the first problem', async () => {
    await openDialog();
    await pressNext();
    await requestStep('Describe your study');

    await pressNext();

    expect(
      await requestDialog().findByText('Describe your study.'),
    ).toBeVisible();
    expect(synopsis()).toHaveFocus();
    expect(
      requestDialog().getByRole('heading', { name: 'Describe your study' }),
    ).toBeVisible();

    await userEvent.type(synopsis(), 'An online survey.');
    await pressNext();
    await requestStep('Who takes part, and how?');
    await pressNext();
    expect(
      await requestDialog().findByText('Describe who will be interviewed.'),
    ).toBeVisible();
    expect(
      requestDialog().getByText('Choose how the interview is administered.'),
    ).toBeVisible();
    expect(population()).toHaveFocus();
  });

  it('starts a review with no research questions, sending none', async () => {
    await openDialog();
    await fillToQuestions();
    expect(question(1)).toHaveValue('');

    await pressNext();
    await requestStep('Choose a model');
    await pressNext('Start review');

    await waitFor(() =>
      expect(getProtocolReviewRun(store.getState()).status).toBe('running'),
    );
    const details = {
      synopsis: 'An online survey.',
      population: 'Carers of older adults',
      administration: 'self_administered',
      researchQuestions: [],
    };
    expect(getProtocolReviewStudyContext(store.getState())).toEqual(details);
    expect(lastRequest()).toMatchObject({
      request: { studyContext: details },
    });
  });

  it('takes as many research questions as the researcher writes, and leaves out an empty box', async () => {
    await openDialog();
    await fillToQuestions();
    for (let count = 2; count <= 8; count += 1) {
      await userEvent.click(
        requestDialog().getByRole('button', {
          name: 'Add a research question',
        }),
      );
      // A new question takes focus, ready to be written.
      expect(question(count)).toHaveFocus();
    }
    // The sixth box is left empty.
    for (const number of [1, 2, 3, 4, 5, 7, 8]) {
      await userEvent.type(question(number), `Question ${number}`);
    }
    await userEvent.click(
      requestDialog().getByRole('button', {
        name: 'Remove research question 3',
      }),
    );
    expect(question(3)).toHaveValue('Question 4');
    expect(question(3)).toHaveFocus();

    await pressNext();
    await requestStep('Choose a model');
    await pressNext('Start review');

    await waitFor(() =>
      expect(
        getProtocolReviewStudyContext(store.getState())?.researchQuestions,
      ).toEqual([1, 2, 4, 5, 7, 8].map((number) => `Question ${number}`)),
    );
  });

  it('writes nothing when cancelled, and returns to the button', async () => {
    await openDialog();
    const before = store.getState().activeProtocol.present;
    await pressNext();
    await requestStep('Describe your study');
    await userEvent.type(synopsis(), 'An online survey.');

    await userEvent.click(
      requestDialog().getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Describe your study' }),
      ).toBeNull(),
    );
    expect(store.getState().activeProtocol.present).toBe(before);
    expect(getProtocolReviewStudyContext(store.getState())).toBeUndefined();
    expect(getShareReviewsChoice(store.getState())).toBeNull();
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
    expect(client.requestReview).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: 'Protocol review' }),
    ).toBeNull();
  });

  it('on completion saves the details, the sharing choice and the model, starts the review and opens the panel', async () => {
    await openDialog();
    await fillToQuestions();
    await userEvent.type(question(1), 'Who helps whom?');
    await pressNext();
    await requestStep('Choose a model');
    await userEvent.click(model(/GPT-6\.1 Sol/));

    await pressNext('Start review');

    await waitFor(() =>
      expect(getProtocolReviewRun(store.getState()).status).toBe('running'),
    );
    const details = {
      synopsis: 'An online survey.',
      population: 'Carers of older adults',
      administration: 'self_administered',
      researchQuestions: ['Who helps whom?'],
    };
    expect(getProtocolReviewStudyContext(store.getState())).toEqual(details);
    expect(getShareReviewsChoice(store.getState())).toBe(true);
    expect(store.getState().protocolReview.provider).toBe('openai');
    expect(client.requestReview).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toMatchObject({
      request: { share: true, provider: 'openai', studyContext: details },
    });
    const panel = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    expect(
      within(panel).getByRole('heading', {
        name: 'Reviewing 3 stages against your study details',
      }),
    ).toBeVisible();
  });

  it('saves nothing while another tab holds the protocol, keeps what was entered, and starts once this tab owns it again', async () => {
    await openDialog();
    await fillToQuestions();
    await pressNext();
    await requestStep('Choose a model');
    const before = store.getState().activeProtocol.present;

    // Another tab takes the protocol while the dialog sits open.
    act(() => {
      store.dispatch(setProtocolLockState('open-elsewhere'));
    });
    await pressNext('Start review');

    expect(
      await requestDialog().findByText(
        'This protocol is open in another tab, which holds the saved copy. What you have entered here is kept. Close the other tab, then try again.',
      ),
    ).toBeVisible();
    expect(
      requestDialog().getByRole('heading', { name: 'Choose a model' }),
    ).toBeVisible();
    expect(store.getState().activeProtocol.present).toBe(before);
    expect(client.requestReview).not.toHaveBeenCalled();

    // The other tab closes, and this one owns the saved copy again.
    act(() => {
      store.dispatch(setProtocolLockState('owned'));
    });
    await waitFor(() =>
      expect(requestDialog().queryByText(/open in another tab/)).toBeNull(),
    );
    await pressNext('Start review');

    await waitFor(() =>
      expect(getProtocolReviewStudyContext(store.getState())).toEqual({
        synopsis: 'An online survey.',
        population: 'Carers of older adults',
        administration: 'self_administered',
        researchQuestions: [],
      }),
    );
    expect(client.requestReview).toHaveBeenCalledTimes(1);
  });
});

describe('asking again, for a protocol that has study details', () => {
  it('shows the saved details on every step, and details left alone are not a change to the protocol', async () => {
    await openProtocol(store);
    renderToolbar(store);
    const before = store.getState().activeProtocol.present;

    await openRequestDialogAt('Describe your study');
    expect(synopsis()).toHaveValue(STUDY_CONTEXT.synopsis);
    await pressNext();
    await requestStep('Who takes part, and how?');
    expect(population()).toHaveValue(STUDY_CONTEXT.population);
    expect(
      requestDialog().getByRole('option', { name: /Face to face/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await pressNext();
    await requestStep('What are your research questions?');
    expect(question(1)).toHaveValue(STUDY_CONTEXT.researchQuestions[0]);
    await pressNext();
    await requestStep('Choose a model');
    await pressNext('Start review');

    await waitFor(() =>
      expect(getProtocolReviewRun(store.getState()).status).toBe('running'),
    );
    expect(store.getState().activeProtocol.present).toBe(before);
    expect(lastRequest()).toMatchObject({
      request: { studyContext: STUDY_CONTEXT },
    });
  });

  it('saves details the researcher changes on the way, and reviews with them', async () => {
    await openProtocol(store);
    renderToolbar(store);

    await openRequestDialogAt('Who takes part, and how?');
    await userEvent.clear(population());
    await userEvent.type(population(), 'Adults over 70');
    await pressNext();
    await requestStep('What are your research questions?');
    await userEvent.clear(question(1));
    await pressNext();
    await requestStep('Choose a model');
    await pressNext('Start review');

    const changed = {
      ...STUDY_CONTEXT,
      population: 'Adults over 70',
      researchQuestions: [],
    };
    await waitFor(() =>
      expect(getProtocolReviewStudyContext(store.getState())).toEqual(changed),
    );
    expect(lastRequest()).toMatchObject({ request: { studyContext: changed } });
  });

  it('remembers that sharing was unticked for this protocol, and shares nothing', async () => {
    await openProtocol(store);
    renderToolbar(store);
    await userEvent.click(reviewButton());
    await requestStep('Before you use this feature');
    const share = requestDialog().getByRole('checkbox', { name: SHARE_LABEL });
    expect(share).toBeChecked();
    await userEvent.click(share);
    for (const step of [
      'Describe your study',
      'Who takes part, and how?',
      'What are your research questions?',
      'Choose a model',
    ] as const) {
      await pressNext();
      await requestStep(step);
    }
    await pressNext('Start review');
    await waitFor(() =>
      expect(getProtocolReviewRun(store.getState()).status).toBe('running'),
    );
    expect(lastRequest()).toMatchObject({ request: { share: false } });
    expect(getShareReviewsChoice(store.getState())).toBe(false);

    // The review is cancelled, and asked for again.
    const panel = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Cancel review' }),
    );
    await userEvent.click(
      await within(panel).findByRole('button', { name: 'Start review' }),
    );
    await requestStep('Before you use this feature');
    expect(
      requestDialog().getByRole('checkbox', { name: SHARE_LABEL }),
    ).not.toBeChecked();
  });
});

describe('choosing the model', () => {
  it('offers the model chosen last time, Claude before any choice, and says how many reviews are left', async () => {
    await openProtocol(store);
    renderToolbar(store);

    await openRequestDialogAt('Choose a model');

    const models = requestDialog().getByRole('listbox', { name: 'Model' });
    expect(
      within(models)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Claude Opus 5.5Made by Anthropic',
      'GPT-6.1 SolMade by OpenAI',
    ]);
    expect(model(/Claude Opus 5\.5/)).toHaveAttribute('aria-selected', 'true');
    expect(model(/GPT-6\.1 Sol/)).toHaveAttribute('aria-selected', 'false');
    expect(
      requestDialog().getByText(/^\d+ of \d+ reviews left this hour$/),
    ).toBeVisible();
    // Asked when the button came on screen, and again by this step.
    await waitFor(() =>
      expect(client.requestProviderStatus).toHaveBeenCalledTimes(2),
    );

    await userEvent.click(model(/GPT-6\.1 Sol/));
    await pressNext('Start review');
    await waitFor(() =>
      expect(lastRequest()).toMatchObject({ request: { provider: 'openai' } }),
    );
    expect(localStorage.getItem('architect-v9-protocol-review-provider')).toBe(
      'openai',
    );

    // Asked for again, the dialog offers what was chosen.
    const panel = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Cancel review' }),
    );
    await userEvent.click(
      await within(panel).findByRole('button', { name: 'Start review' }),
    );
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
    expect(model(/GPT-6\.1 Sol/)).toHaveAttribute('aria-selected', 'true');
  });

  it('moves the choice off a model the service says has no budget, though its answer comes after the step opened', async () => {
    await openProtocol(store);
    store.dispatch(chooseReviewProvider('openai'));
    // The service is asked as soon as the button is on screen, and answers
    // only once the step is: until then nothing is known to be spent, and
    // the model chosen last time is shown.
    let answerStatus: (providers: unknown) => void = () => undefined;
    client.requestProviderStatus.mockReturnValue(
      new Promise((resolve) => {
        answerStatus = resolve;
      }),
    );
    renderToolbar(store);
    await waitFor(() =>
      expect(client.requestProviderStatus).toHaveBeenCalledTimes(1),
    );

    await openRequestDialogAt('Choose a model');
    expect(model(/GPT-6\.1 Sol/)).toHaveAttribute('aria-selected', 'true');

    await act(async () => {
      answerStatus([
        { provider: 'anthropic', available: true, reason: null, retryAt: null },
        {
          provider: 'openai',
          available: false,
          reason: 'monthly_limit',
          retryAt: '2099-01-15T12:00:00.000Z',
        },
      ]);
    });

    await waitFor(() => expect(model(/GPT-6\.1 Sol/)).toBeDisabled());
    expect(model(/GPT-6\.1 Sol/)).toHaveTextContent(
      /The budget for OpenAI has been spent\. It starts again Jan 15, 2099 at /,
    );
    expect(model(/Claude Opus 5\.5/)).toHaveAttribute('aria-selected', 'true');
    expect(model(/GPT-6\.1 Sol/)).toHaveAttribute('aria-selected', 'false');
    // One model is spent, not the service: a review can start.
    expect(requestDialog().queryByRole('alert')).toBeNull();

    await pressNext('Start review');
    await waitFor(() =>
      expect(lastRequest()).toMatchObject({
        request: { provider: 'anthropic' },
      }),
    );
  });

  it('cannot start, and says why, once the service says every budget is spent', async () => {
    await openProtocol(store);
    renderToolbar(store);
    await openRequestDialogAt('What are your research questions?');
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
    await pressNext();
    await requestStep('Choose a model');

    expect(
      await requestDialog().findByText(
        /Every provider’s budget has been spent, so a review cannot start for now\. What you have entered here is kept\./,
      ),
    ).toBeVisible();
    expect(model(/Claude Opus 5\.5/)).toBeDisabled();
    expect(model(/GPT-6\.1 Sol/)).toBeDisabled();
    const start = requestDialog().getByRole('button', {
      name: 'Start review',
    });
    expect(start).toBeDisabled();
    await userEvent.click(start);
    expect(client.requestReview).not.toHaveBeenCalled();
  });

  it('cannot start while offline, and does not ask the service', async () => {
    await openProtocol(store);
    renderToolbar(store);
    await openRequestDialogAt('What are your research questions?');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await pressNext();
    await requestStep('Choose a model');

    expect(
      requestDialog().getByText(
        'You’re offline. Protocol review needs an internet connection; you can start the review when you are back online.',
      ),
    ).toBeVisible();
    expect(
      requestDialog().getByRole('button', { name: 'Start review' }),
    ).toBeDisabled();
    // Asked once, when the button came on screen and there was a connection.
    expect(client.requestProviderStatus).toHaveBeenCalledTimes(1);
  });
});
