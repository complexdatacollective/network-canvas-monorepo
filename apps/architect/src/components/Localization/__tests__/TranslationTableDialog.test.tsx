import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import LocalizationPage from '~/components/pages/LocalizationPage';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

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
      items: [
        { id: 'intro', type: 'text', content: { en: 'Read **this** first' } },
      ],
    },
  ],
};

const renderPage = (path = '/protocol/localization') => {
  window.history.replaceState(null, '', path);
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(bilingual)));
  render(
    <Provider store={store}>
      <LocalizationPage />
    </Provider>,
  );
  return { store, user: userEvent.setup() };
};

const address = () => window.location.pathname + window.location.search;

const findTable = () =>
  screen.findByRole('dialog', { name: 'Translation table' });

const expectClosed = () =>
  waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Translation table' }),
    ).not.toBeInTheDocument(),
  );

const frenchTitle = () =>
  screen.getByRole('textbox', {
    name: /^Stage 1 .*\bPage heading French$/,
  });

const stageTitle = (store: ReturnType<typeof renderPage>['store']) => {
  const stage = getProtocol(store.getState())?.stages[0];
  return stage && 'title' in stage ? stage.title : undefined;
};

describe('TranslationTableDialog', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('opens over the Languages page, and closing goes back to it and to the link that opened it', async () => {
    const { user } = renderPage();
    const link = screen.getByRole('link', { name: 'Open translation table' });
    const entries = window.history.length;

    await user.click(link);
    const dialog = await findTable();
    expect(address()).toBe('/protocol/localization?table=open');
    expect(window.history.length).toBe(entries + 1);
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    expect(within(dialog).getByRole('table')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: /full screen/i }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await expectClosed();
    await waitFor(() => expect(address()).toBe('/protocol/localization'));
    await waitFor(() => expect(link).toHaveFocus());
  });

  it('closes when the browser goes back', async () => {
    const { user } = renderPage();

    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    await findTable();

    window.history.back();
    await expectClosed();
    expect(address()).toBe('/protocol/localization');
  });

  it('opens from its address on the texts it names, and closes onto the page heading', async () => {
    const { user } = renderPage('/protocol/localization?table=open&missing=fr');
    const entries = window.history.length;

    const dialog = await findTable();
    expect(
      within(dialog).getByRole('combobox', { name: 'Texts to show' }),
    ).toHaveDisplayValue('Missing French');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await expectClosed();
    // There is no entry of the page's own to go back to, so the table's is
    // replaced.
    expect(address()).toBe('/protocol/localization');
    expect(window.history.length).toBe(entries);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'Languages' }),
      ).toHaveFocus(),
    );
  });

  it('keeps the way back to the page when the texts shown change', async () => {
    const { user } = renderPage();

    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    const dialog = await findTable();
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Texts to show' }),
      'Missing French',
    );
    expect(address()).toBe('/protocol/localization?table=open&missing=fr');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await expectClosed();
    await waitFor(() => expect(address()).toBe('/protocol/localization'));
  });

  it('undoes a change on Escape before closing on a second Escape', async () => {
    const { store, user } = renderPage('/protocol/localization?table=open');
    await findTable();

    await user.click(frenchTitle());
    await user.keyboard('Bonjour');
    await user.keyboard('{Escape}');
    expect(frenchTitle()).toHaveValue('');
    expect(
      screen.getByRole('dialog', { name: 'Translation table' }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await expectClosed();
    expect(stageTitle(store)).toEqual({ en: 'Hello' });
  });

  it('undoes a change to formatted text on Escape before closing', async () => {
    const { user } = renderPage('/protocol/localization?table=open');
    await findTable();

    await user.click(screen.getByRole('button', { name: /\bContent French$/ }));
    const editor = await screen.findByRole('textbox', {
      name: /\bContent French$/,
    });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.keyboard('Lisez');
    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('dialog', { name: 'Translation table' }),
    ).toBeInTheDocument();

    const fresh = await screen.findByRole('textbox', {
      name: /\bContent French$/,
    });
    await waitFor(() => expect(fresh).toHaveFocus());
    await user.keyboard('{Escape}');
    await expectClosed();
  });

  it('saves the cell being edited when the table is closed', async () => {
    const { store, user } = renderPage();

    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    const dialog = await findTable();
    await user.click(frenchTitle());
    await user.keyboard('Bonjour');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await expectClosed();
    expect(stageTitle(store)).toEqual({ en: 'Hello', fr: 'Bonjour' });
  });

  it('saves the cell being edited when the browser goes back', async () => {
    const { store, user } = renderPage();

    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    await findTable();
    await user.click(frenchTitle());
    await user.keyboard('Bonjour');

    window.history.back();
    await expectClosed();
    expect(stageTitle(store)).toEqual({ en: 'Hello', fr: 'Bonjour' });
  });
});
