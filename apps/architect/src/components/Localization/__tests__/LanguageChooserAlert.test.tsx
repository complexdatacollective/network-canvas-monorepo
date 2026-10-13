import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import {
  dismissLanguageChooserNote,
  getLanguageChooserNoteDismissed,
  setActiveProtocolId,
} from '~/ducks/modules/app';
import { type RootState, rootReducer } from '~/ducks/modules/root';

import LanguageChooserAlert from '../LanguageChooserAlert';

const PROTOCOL_ID = 'protocol-1';

const information = {
  id: 'welcome',
  type: 'Information' as const,
  label: { en: 'Welcome', fr: 'Bienvenue' },
  title: { en: 'Hello', fr: 'Bonjour' },
  items: [],
};

const chooser = {
  id: 'language',
  type: 'LanguageChooser' as const,
  label: { en: 'Language', fr: 'Langue' },
};

const protocol = (
  locales: string[],
  stages: CurrentProtocol['stages'] = [information],
): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages,
});

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
      <LanguageChooserAlert />
    </Provider>,
  );

const TITLE = 'Participants can’t choose a language';
const DISMISS_BUTTON = {
  name: 'Dismiss the note that participants can’t choose a language',
};

describe('LanguageChooserAlert', () => {
  it('explains that browser detection picks the language when there is no chooser', () => {
    const store = createStore();
    store.dispatch(setActiveProtocol(protocol(['en', 'fr'])));
    renderAlert(store);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(
        /opens in the language that best matches the participant’s browser settings/,
      ),
    ).toBeInTheDocument();
  });

  it('says nothing for a protocol with one language', () => {
    const store = createStore();
    store.dispatch(setActiveProtocol(protocol(['en'])));
    renderAlert(store);

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('goes away once a Language Chooser stage is added', () => {
    const store = createStore();
    store.dispatch(setActiveProtocol(protocol(['en', 'fr'])));
    renderAlert(store);
    expect(screen.getByText(TITLE)).toBeInTheDocument();

    act(() => {
      store.dispatch(
        setActiveProtocol(protocol(['en', 'fr'], [chooser, information])),
      );
    });

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('dismisses the note, hands focus to the heading, and remembers it', async () => {
    const store = createStore();
    store.dispatch(setActiveProtocol(protocol(['en', 'fr'])));
    const user = userEvent.setup();
    const { unmount } = renderAlert(store);

    await user.click(screen.getByRole('button', DISMISS_BUTTON));

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stages' })).toHaveFocus();
    expect(getLanguageChooserNoteDismissed(store.getState(), PROTOCOL_ID)).toBe(
      true,
    );

    // A reload restores the remembered `app` slice into a fresh store.
    unmount();
    const reloaded = createStore(structuredClone(store.getState().app));
    reloaded.dispatch(setActiveProtocol(protocol(['en', 'fr'])));
    renderAlert(reloaded);

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('remembers the dismissal separately for each protocol', () => {
    const store = createStore();
    store.dispatch(dismissLanguageChooserNote('another-protocol'));
    store.dispatch(setActiveProtocol(protocol(['en', 'fr'])));
    renderAlert(store);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it('shows the note when the remembered dismissals are malformed', () => {
    const store = createStore({ dismissedLanguageChooserNotes: 'garbage' });
    store.dispatch(setActiveProtocol(protocol(['en', 'fr'])));
    renderAlert(store);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });
});
