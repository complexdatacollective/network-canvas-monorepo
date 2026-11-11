import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import {
  enableProtocolReview,
  setActiveProtocol,
  setProtocolReviewStudyContext,
} from '~/ducks/modules/activeProtocol';
import { setProtocolLockState } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';
import {
  getIsProtocolReviewEnabled,
  getProtocolReviewStudyContext,
} from '~/selectors/protocol';
import { documentationLinks } from '~/utils/documentationLinks';

import ExperimentsPage from '../ExperimentsPage';

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [],
};

const makeStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocol));
  store.dispatch(setProtocolLockState('owned'));
  return store;
};

const renderPage = (store = makeStore()) => {
  render(
    <Provider store={store}>
      <ArchitectI18nProvider>
        <ExperimentsPage />
      </ArchitectI18nProvider>
    </Provider>,
  );
  return store;
};

const reviewSwitch = () =>
  screen.getByRole('switch', { name: 'Automated Protocol Review' });

const { openDialog } = globalThis.__architectDialogMocks;

describe('<ExperimentsPage />', () => {
  beforeEach(() => {
    openDialog.mockResolvedValue(true);
  });

  it('explains the page and links to the forum and the schema documentation', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Experimental features' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'community forum' }),
    ).toHaveAttribute('href', documentationLinks.communityForum);
    expect(
      screen.getByRole('link', { name: 'protocol schema versioning' }),
    ).toHaveAttribute('href', documentationLinks.protocolSchema);
    expect(
      screen.getByText(
        'There are no other experimental features at the moment.',
      ),
    ).toBeVisible();
  });

  it('puts the version notice in an information alert', () => {
    renderPage();

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(
      'is not subject to protocol schema versioning',
    );
  });

  it('shows the switch off for a protocol that has not turned the review on', () => {
    renderPage();

    expect(reviewSwitch()).not.toBeChecked();
  });

  it('turns the review on without asking', async () => {
    const store = renderPage();

    await userEvent.click(reviewSwitch());

    expect(getIsProtocolReviewEnabled(store.getState())).toBe(true);
    expect(reviewSwitch()).toBeChecked();
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('turns the review off without asking when no study details are saved', async () => {
    const store = makeStore();
    store.dispatch(enableProtocolReview());
    renderPage(store);
    expect(reviewSwitch()).toBeChecked();

    await userEvent.click(reviewSwitch());

    expect(openDialog).not.toHaveBeenCalled();
    expect(getIsProtocolReviewEnabled(store.getState())).toBe(false);
  });

  describe('with study details saved', () => {
    const studyContext = {
      researchQuestions: ['How do students find support?'],
      population: 'First-year students',
      administration: 'face_to_face' as const,
    };

    const storeWithDetails = () => {
      const store = makeStore();
      store.dispatch(enableProtocolReview());
      store.dispatch(setProtocolReviewStudyContext(studyContext));
      return store;
    };

    it('asks first, saying the details will be removed, and removes them when confirmed', async () => {
      const store = storeWithDetails();
      renderPage(store);

      await userEvent.click(reviewSwitch());

      expect(openDialog).toHaveBeenCalledTimes(1);
      const request = openDialog.mock.calls[0]?.[0];
      render(<>{request.description}</>, {
        wrapper: ({ children }) => (
          <ArchitectI18nProvider>{children}</ArchitectI18nProvider>
        ),
      });
      expect(
        screen.getByText(/study details saved in this protocol/),
      ).toBeVisible();
      await waitFor(() =>
        expect(getIsProtocolReviewEnabled(store.getState())).toBe(false),
      );
      expect(getProtocolReviewStudyContext(store.getState())).toBeUndefined();
    });

    it('also asks when the saved details are unfinished', async () => {
      const store = makeStore();
      store.dispatch(
        setActiveProtocol({
          ...protocol,
          experiments: {
            protocolReview: { studyContext: { population: 'Adults' } },
          },
        }),
      );
      renderPage(store);

      await userEvent.click(reviewSwitch());

      expect(openDialog).toHaveBeenCalledTimes(1);
    });

    it('changes nothing when the researcher cancels', async () => {
      openDialog.mockResolvedValue(false);
      const store = storeWithDetails();
      renderPage(store);

      await userEvent.click(reviewSwitch());

      expect(openDialog).toHaveBeenCalledTimes(1);
      expect(getIsProtocolReviewEnabled(store.getState())).toBe(true);
      expect(getProtocolReviewStudyContext(store.getState())).toEqual(
        studyContext,
      );
    });
  });

  it('turns off without asking when the stored content holds no study details', async () => {
    const store = makeStore();
    store.dispatch(
      setActiveProtocol({
        ...protocol,
        experiments: { protocolReview: { studyContext: { questions: 'x' } } },
      }),
    );
    renderPage(store);

    await userEvent.click(reviewSwitch());

    expect(openDialog).not.toHaveBeenCalled();
    expect(getIsProtocolReviewEnabled(store.getState())).toBe(false);
  });

  it('disables the switch while the protocol is read only', async () => {
    const store = makeStore();
    store.dispatch(setProtocolLockState('open-elsewhere'));
    renderPage(store);

    expect(reviewSwitch()).toBeDisabled();
    await userEvent.click(reviewSwitch());
    expect(getIsProtocolReviewEnabled(store.getState())).toBe(false);
  });
});
