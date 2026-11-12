// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setProtocolTranslation } from '~/ducks/modules/activeProtocol';
import {
  cancelReview,
  getProtocolReviewRun,
  getShareProtocolReviews,
  startReview,
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

const NO_DETAILS = makeProtocol({ experiments: { protocolReview: {} } });

const stepHeading = (name: string) => screen.findByRole('heading', { name });

const wizard = () => {
  const dialog = screen
    .getByRole('heading', { level: 2, name: /\?|Describe|Before/ })
    .closest<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error('No wizard');
  return within(dialog);
};

const next = async (name = 'Continue') =>
  userEvent.click(wizard().getByRole('button', { name }));

const question = (number: number) =>
  wizard().getByRole('textbox', { name: `Research question ${number}` });

let store: TestStore;

beforeEach(() => {
  store = makeStore();
  localStorage.clear();
  client.requestReview.mockReset();
  client.requestProviderStatus.mockReset();
  client.requestProviderStatus.mockResolvedValue(null);
});

afterEach(() => {
  store.dispatch(cancelReview());
  vi.restoreAllMocks();
});

describe('study details wizard, first use', () => {
  const openWizard = async () => {
    await openProtocol(store, NO_DETAILS);
    renderToolbar(store);
    await userEvent.click(reviewButton());
    await stepHeading('What are your research questions?');
  };

  it('keeps a step until its values are valid, and focuses the first problem', async () => {
    await openWizard();

    await next();

    expect(
      await wizard().findByText(
        'Write a research question here, or remove this one.',
      ),
    ).toBeVisible();
    expect(question(1)).toHaveFocus();
    expect(
      wizard().getByRole('heading', {
        name: 'What are your research questions?',
      }),
    ).toBeVisible();

    fireEvent.change(question(1), { target: { value: 'a'.repeat(351) } });
    await next();
    expect(
      await wizard().findByText('Enter at most 350 characters.'),
    ).toBeVisible();
    expect(
      wizard().getByRole('heading', {
        name: 'What are your research questions?',
      }),
    ).toBeVisible();

    fireEvent.change(question(1), { target: { value: 'a'.repeat(350) } });
    await next();
    await stepHeading('Who takes part, and how?');
    await next();
    expect(
      await wizard().findByText('Describe who will be interviewed.'),
    ).toBeVisible();
    expect(
      wizard().getByText('Choose how the interview is administered.'),
    ).toBeVisible();
    expect(
      wizard().getByRole('textbox', { name: 'Research population' }),
    ).toHaveFocus();
  });

  it('takes as many research questions as the researcher writes', async () => {
    await openWizard();
    for (let count = 2; count <= 8; count += 1) {
      await userEvent.click(
        wizard().getByRole('button', { name: 'Add a research question' }),
      );
      // A new question takes focus, ready to be written.
      expect(question(count)).toHaveFocus();
    }
    for (let number = 1; number <= 8; number += 1) {
      await userEvent.type(question(number), `Question ${number}`);
    }
    await userEvent.click(
      wizard().getByRole('button', { name: 'Remove research question 3' }),
    );
    expect(question(3)).toHaveValue('Question 4');
    expect(question(3)).toHaveFocus();

    await next();
    await stepHeading('Who takes part, and how?');
    await userEvent.type(
      wizard().getByRole('textbox', { name: 'Research population' }),
      'Students',
    );
    await userEvent.click(
      wizard().getByRole('option', { name: /Face to face/ }),
    );
    await next();
    await stepHeading('Describe the study');
    await next();
    await stepHeading('Before your protocol is sent');
    client.requestReview.mockReturnValueOnce(gatedOutcome().promise);
    await next('Start review');

    await waitFor(() =>
      expect(getProtocolReviewStudyContext(store.getState())).toEqual({
        researchQuestions: [1, 2, 4, 5, 6, 7, 8].map(
          (number) => `Question ${number}`,
        ),
        population: 'Students',
        administration: 'face_to_face',
      }),
    );
  });

  it('writes nothing when cancelled', async () => {
    await openWizard();
    const before = store.getState().activeProtocol.present;
    await userEvent.type(question(1), 'Who helps whom?');
    await next();
    await stepHeading('Who takes part, and how?');

    await userEvent.click(wizard().getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Who takes part, and how?' }),
      ).toBeNull(),
    );
    expect(store.getState().activeProtocol.present).toBe(before);
    expect(getProtocolReviewStudyContext(store.getState())).toBeUndefined();
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
  });

  it('on completion saves the details and the sharing choice, starts a review and opens the popover', async () => {
    await openWizard();
    await userEvent.type(question(1), 'Who helps whom?');
    await next();
    await stepHeading('Who takes part, and how?');
    await userEvent.type(
      wizard().getByRole('textbox', { name: 'Research population' }),
      'Carers of older adults',
    );
    await userEvent.click(
      wizard().getByRole('option', { name: /Self-administered/ }),
    );
    await next();
    await stepHeading('Describe the study');
    await userEvent.type(
      wizard().getByRole('textbox', { name: 'Study synopsis (optional)' }),
      'An online survey.',
    );
    await next();
    await stepHeading('Before your protocol is sent');
    expect(
      wizard().getByText(
        /We keep them for 90 days and use them only to improve this feature/,
      ),
    ).toBeVisible();
    const share = wizard().getByRole('checkbox', {
      name: 'Share my reviews with the Network Canvas team',
    });
    expect(share).not.toBeChecked();
    await userEvent.click(share);
    client.requestReview.mockReturnValueOnce(gatedOutcome().promise);

    await next('Start review');

    await waitFor(() =>
      expect(getProtocolReviewRun(store.getState()).status).toBe('running'),
    );
    expect(getProtocolReviewStudyContext(store.getState())).toEqual({
      researchQuestions: ['Who helps whom?'],
      population: 'Carers of older adults',
      administration: 'self_administered',
      synopsis: 'An online survey.',
    });
    expect(getShareProtocolReviews(store.getState())).toBe(true);
    const popover = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    expect(
      within(popover).getByRole('heading', {
        name: 'Reviewing 3 stages against your study details',
      }),
    ).toBeVisible();
  });
});

describe('study details wizard, editing', () => {
  it('is prefilled from the saved details, and Save changes them without starting a review', async () => {
    await openProtocol(store);
    client.requestReview.mockResolvedValueOnce({
      kind: 'result',
      result: RESULT,
    });
    await store.dispatch(startReview());
    const reviewId = store.getState().protocolReview.record?.review?.reviewId;
    // Changed since, so Save could not be mistaken for the review being
    // refused as unchanged.
    store.dispatch(
      setProtocolTranslation({
        path: ['stages', 2, 'content'],
        locale: 'en',
        text: 'The very end.',
      }),
    );
    renderToolbar(store);

    await userEvent.click(reviewButton());
    const popover = await screen.findByRole('dialog', {
      name: 'Protocol review',
    });
    await userEvent.click(
      within(popover).getByRole('button', { name: 'Edit study details' }),
    );

    await stepHeading('What are your research questions?');
    expect(question(1)).toHaveValue(STUDY_CONTEXT.researchQuestions[0]);
    await next();
    await stepHeading('Who takes part, and how?');
    const population = wizard().getByRole('textbox', {
      name: 'Research population',
    });
    expect(population).toHaveValue(STUDY_CONTEXT.population);
    expect(
      wizard().getByRole('option', { name: /Face to face/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await userEvent.clear(population);
    await userEvent.type(population, 'Adults over 70');
    await next();
    await stepHeading('Describe the study');
    await next();
    await stepHeading('Before your protocol is sent');
    expect(wizard().queryByRole('button', { name: 'Start review' })).toBeNull();

    await next('Save');

    await waitFor(() =>
      expect(getProtocolReviewStudyContext(store.getState())).toEqual({
        ...STUDY_CONTEXT,
        population: 'Adults over 70',
      }),
    );
    expect(getProtocolReviewRun(store.getState())).toEqual({ status: 'idle' });
    expect(store.getState().protocolReview.record?.review?.reviewId).toBe(
      reviewId,
    );
    expect(
      await screen.findByRole('dialog', { name: 'Protocol review' }),
    ).toBeVisible();
  });
});
