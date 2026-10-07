import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import {
  dismissMissingTranslations,
  getDismissedMissingTranslations,
  setActiveProtocolId,
} from '~/ducks/modules/app';
import { type RootState, rootReducer } from '~/ducks/modules/root';

import LocalizationAlert from '../LocalizationAlert';

const PROTOCOL_ID = 'protocol-1';

// Each stage is missing its label and title in French, so n stages are
// 2n missing translations.
const stage = (id: string) => ({
  id,
  type: 'Information' as const,
  label: { en: `Label ${id}` },
  title: { en: `Title ${id}` },
  items: [],
});

const protocolWithStages = (count: number): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: Array.from({ length: count }, (_, index) => stage(`stage-${index}`)),
});

// Each stage is missing only its title in French, so n stages are n missing
// translations.
const protocolWithGaps = (count: number): CurrentProtocol => ({
  ...protocolWithStages(0),
  stages: Array.from({ length: count }, (_, index) => ({
    id: `stage-${index}`,
    type: 'Information' as const,
    label: { en: `Label ${index}`, fr: `Etiquette ${index}` },
    title: { en: `Title ${index}` },
    items: [],
  })),
});

const unidentifiedLanguageProtocol: CurrentProtocol = {
  ...protocolWithStages(1),
  localization: { defaultLocale: 'und', locales: ['und'] },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { und: 'Welcome' },
      title: { und: 'Hello' },
      items: [],
    },
  ],
};

const createStore = (app: RootState['app'] = {}) => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: { app },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocolId(PROTOCOL_ID));
  return store;
};

type TestStore = ReturnType<typeof createStore>;

const renderAlert = (store: TestStore) =>
  render(
    <Provider store={store}>
      <h1 {...routeFocusTargetProps}>Stages</h1>
      <LocalizationAlert />
    </Provider>,
  );

const MISSING_NOTE =
  'Some text isn’t translated into French yet. Participants see it in another language instead.';

const DISMISS_BUTTON = { name: 'Dismiss the note about missing translations' };

describe('LocalizationAlert', () => {
  it('names the languages that have gaps, alphabetically, as a calm note', () => {
    const store = createStore();
    store.dispatch(
      setActiveProtocol({
        ...protocolWithStages(0),
        localization: {
          defaultLocale: 'en',
          locales: ['en', 'fr', 'de', 'bo'],
        },
        stages: [
          {
            id: 'welcome',
            type: 'Information',
            label: { en: 'Welcome', fr: 'Bienvenue', de: 'Willkommen' },
            title: { en: 'Hello', de: 'Hallo' },
            items: [],
          },
        ],
      }),
    );
    renderAlert(store);

    expect(
      screen.getByText('Not everything is translated yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Some text isn’t translated into French and Tibetan yet. Participants see it in another language instead.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /Information: Not everything is translated yet/,
    );
    expect(
      screen.getByRole('link', { name: 'Go to Languages' }),
    ).toBeInTheDocument();
  });

  it('dismisses the missing-translations warning and remembers it', async () => {
    const store = createStore();
    store.dispatch(setActiveProtocol(protocolWithStages(2)));
    const user = userEvent.setup();
    const { unmount } = renderAlert(store);

    expect(screen.getByText(MISSING_NOTE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', DISMISS_BUTTON));

    expect(screen.queryByText(MISSING_NOTE)).not.toBeInTheDocument();
    expect(getDismissedMissingTranslations(store.getState(), PROTOCOL_ID)).toBe(
      4,
    );

    // A reload restores the remembered `app` slice into a fresh store.
    unmount();
    const reloaded = createStore(structuredClone(store.getState().app));
    reloaded.dispatch(setActiveProtocol(protocolWithStages(2)));
    renderAlert(reloaded);

    expect(screen.queryByText(MISSING_NOTE)).not.toBeInTheDocument();
  });

  it('keeps focus on the page heading rather than a removed button', async () => {
    const store = createStore();
    store.dispatch(setActiveProtocol(protocolWithStages(1)));
    const user = userEvent.setup();
    renderAlert(store);

    await user.click(screen.getByRole('button', DISMISS_BUTTON));

    expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
  });

  it('stays hidden while the missing count is the same or lower', () => {
    const store = createStore();
    store.dispatch(dismissMissingTranslations(PROTOCOL_ID, 4));

    store.dispatch(setActiveProtocol(protocolWithStages(2)));
    const { unmount } = renderAlert(store);
    expect(screen.queryByText(MISSING_NOTE)).not.toBeInTheDocument();
    unmount();

    store.dispatch(setActiveProtocol(protocolWithStages(1)));
    renderAlert(store);
    expect(screen.queryByText(MISSING_NOTE)).not.toBeInTheDocument();
  });

  it('returns when more translations are missing than when it was dismissed', () => {
    const store = createStore();
    store.dispatch(dismissMissingTranslations(PROTOCOL_ID, 2));
    store.dispatch(setActiveProtocol(protocolWithStages(1)));
    renderAlert(store);
    expect(screen.queryByText(MISSING_NOTE)).not.toBeInTheDocument();

    act(() => {
      store.dispatch(setActiveProtocol(protocolWithStages(2)));
    });

    expect(screen.getByText(MISSING_NOTE)).toBeInTheDocument();
    expect(screen.getByRole('button', DISMISS_BUTTON)).toBeInTheDocument();
  });

  it('remembers the dismissal separately for each protocol', () => {
    const store = createStore();
    store.dispatch(dismissMissingTranslations('another-protocol', 10));
    store.dispatch(setActiveProtocol(protocolWithStages(1)));
    renderAlert(store);

    expect(screen.getByText(MISSING_NOTE)).toBeInTheDocument();
  });

  it('gives the unidentified-language notice no dismiss control', () => {
    const store = createStore();
    store.dispatch(setActiveProtocol(unidentifiedLanguageProtocol));
    renderAlert(store);

    expect(
      screen.getByText('Identify the language of your protocol'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', DISMISS_BUTTON),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /dismiss/i }),
    ).not.toBeInTheDocument();
  });

  it('still shows the unidentified-language notice after a dismissal', () => {
    const store = createStore();
    store.dispatch(dismissMissingTranslations(PROTOCOL_ID, 10));
    store.dispatch(setActiveProtocol(unidentifiedLanguageProtocol));
    renderAlert(store);

    expect(
      screen.getByText('Identify the language of your protocol'),
    ).toBeInTheDocument();
  });

  describe('when fewer translations are missing than when it was dismissed', () => {
    it('brings the warning back for gaps that appear after a partial fix', async () => {
      const store = createStore();
      store.dispatch(setActiveProtocol(protocolWithGaps(5)));
      const user = userEvent.setup();
      renderAlert(store);
      await user.click(screen.getByRole('button', DISMISS_BUTTON));
      expect(
        getDismissedMissingTranslations(store.getState(), PROTOCOL_ID),
      ).toBe(5);

      act(() => {
        store.dispatch(setActiveProtocol(protocolWithGaps(1)));
      });
      expect(
        getDismissedMissingTranslations(store.getState(), PROTOCOL_ID),
      ).toBe(1);
      expect(screen.queryByText(MISSING_NOTE)).not.toBeInTheDocument();

      act(() => {
        store.dispatch(setActiveProtocol(protocolWithGaps(2)));
      });
      expect(screen.getByText(MISSING_NOTE)).toBeInTheDocument();
    });

    it('lowers the stored count to zero while the alert renders nothing', () => {
      const store = createStore();
      store.dispatch(dismissMissingTranslations(PROTOCOL_ID, 3));
      store.dispatch(setActiveProtocol(protocolWithGaps(0)));
      renderAlert(store);
      expect(
        getDismissedMissingTranslations(store.getState(), PROTOCOL_ID),
      ).toBe(0);

      act(() => {
        store.dispatch(setActiveProtocol(protocolWithGaps(1)));
      });
      expect(screen.getByText(MISSING_NOTE)).toBeInTheDocument();
    });

    it('leaves the stored count alone when the count is equal or higher', () => {
      const store = createStore();
      store.dispatch(dismissMissingTranslations(PROTOCOL_ID, 2));
      store.dispatch(setActiveProtocol(protocolWithGaps(2)));
      renderAlert(store);
      expect(
        getDismissedMissingTranslations(store.getState(), PROTOCOL_ID),
      ).toBe(2);

      act(() => {
        store.dispatch(setActiveProtocol(protocolWithGaps(4)));
      });
      expect(
        getDismissedMissingTranslations(store.getState(), PROTOCOL_ID),
      ).toBe(2);
    });

    it('writes nothing when no dismissal is stored', () => {
      const store = createStore();
      store.dispatch(setActiveProtocol(protocolWithGaps(0)));
      renderAlert(store);

      expect(
        getDismissedMissingTranslations(store.getState(), PROTOCOL_ID),
      ).toBeNull();
    });

    it('keeps the stored count until a protocol has loaded', () => {
      const store = createStore();
      store.dispatch(dismissMissingTranslations(PROTOCOL_ID, 3));
      renderAlert(store);

      expect(
        getDismissedMissingTranslations(store.getState(), PROTOCOL_ID),
      ).toBe(3);
    });
  });
});
