import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import TranslationTablePage from '../TranslationTablePage';

const bilingual: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
      title: { en: 'Hello' },
      items: [],
    },
  ],
};

const renderPage = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(bilingual)));
  const view = render(
    <Provider store={store}>
      <TranslationTablePage />
    </Provider>,
  );
  return { ...view, user: userEvent.setup() };
};

// jsdom has no Fullscreen API, so each test gives the document one whose
// element it controls, as a browser would change it.
let fullscreenElement: Element | null = null;
const requestFullscreen = vi.fn(() => Promise.resolve());
const exitFullscreen = vi.fn(() => Promise.resolve());

const stubFullscreen = (enabled: boolean) => {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    get: () => enabled,
  });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exitFullscreen,
  });
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  });
};

const changeFullscreen = (element: Element | null) =>
  act(() => {
    fullscreenElement = element;
    document.dispatchEvent(new Event('fullscreenchange'));
  });

describe('<TranslationTablePage />', () => {
  beforeEach(() => {
    fullscreenElement = null;
    requestFullscreen.mockClear();
    exitFullscreen.mockClear();
  });

  afterEach(() => {
    for (const property of [
      'fullscreenEnabled',
      'fullscreenElement',
      'exitFullscreen',
    ]) {
      Reflect.deleteProperty(document, property);
    }
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  });

  it('heads the table with its title, the way back and the history controls', () => {
    stubFullscreen(true);
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Translation table' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Return to Languages' }),
    ).toHaveAttribute('href', '/protocol/localization');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('offers no full screen where the browser cannot fill one', () => {
    stubFullscreen(false);
    renderPage();

    expect(
      screen.queryByRole('button', { name: 'Full screen' }),
    ).not.toBeInTheDocument();
  });

  it('fills the screen with the whole document, and leaves it again', async () => {
    stubFullscreen(true);
    const { user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(requestFullscreen.mock.contexts[0]).toBe(document.documentElement);

    changeFullscreen(document.documentElement);
    await user.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(exitFullscreen).toHaveBeenCalledOnce();

    changeFullscreen(null);
    expect(
      screen.getByRole('button', { name: 'Full screen' }),
    ).toBeInTheDocument();
  });

  it('follows full screen ended by the browser, as by Escape', () => {
    stubFullscreen(true);
    renderPage();

    changeFullscreen(document.documentElement);
    expect(
      screen.getByRole('button', { name: 'Exit full screen' }),
    ).toBeInTheDocument();

    changeFullscreen(null);
    expect(
      screen.getByRole('button', { name: 'Full screen' }),
    ).toBeInTheDocument();
    expect(exitFullscreen).not.toHaveBeenCalled();
  });

  it('leaves full screen when the page is left', () => {
    stubFullscreen(true);
    const { unmount } = renderPage();

    changeFullscreen(document.documentElement);
    unmount();

    expect(exitFullscreen).toHaveBeenCalledOnce();
  });
});
