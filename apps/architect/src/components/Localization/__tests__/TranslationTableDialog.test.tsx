import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { hasDirtyNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
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
      <DialogProvider>
        <LocalizationPage />
      </DialogProvider>
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

const tableButton = (name: string) =>
  within(screen.getByRole('dialog', { name: 'Translation table' })).getByRole(
    'button',
    { name },
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

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
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
      within(dialog).getByRole('combobox', { name: 'Translations to show' }),
    ).toHaveDisplayValue('Missing French');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
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
      within(dialog).getByRole('combobox', { name: 'Translations to show' }),
      'Missing French',
    );
    expect(address()).toBe('/protocol/localization?table=open&missing=fr');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await expectClosed();
    await waitFor(() => expect(address()).toBe('/protocol/localization'));
  });

  it('is not closed by Escape, which only undoes a change', async () => {
    const { user } = renderPage('/protocol/localization?table=open');
    await findTable();

    await user.click(frenchTitle());
    await user.keyboard('Bonjour');
    await user.keyboard('{Escape}');
    expect(frenchTitle()).toHaveValue('');

    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('dialog', { name: 'Translation table' }),
    ).toBeInTheDocument();
    expect(address()).toBe('/protocol/localization?table=open');
  });

  it('saves every change and closes on Save', async () => {
    const { store, user } = renderPage();

    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    await findTable();
    await user.click(frenchTitle());
    await user.keyboard('Bonjour');
    await user.click(tableButton('Save'));

    await expectClosed();
    expect(stageTitle(store)).toEqual({ en: 'Hello', fr: 'Bonjour' });
    await waitFor(() => expect(address()).toBe('/protocol/localization'));
  });

  it('asks before Cancel throws changes away', async () => {
    const { store, user } = renderPage();
    const { openDialog } = globalThis.__architectDialogMocks;

    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    await findTable();

    // Nothing to lose: Cancel closes without asking.
    await user.click(tableButton('Cancel'));
    await expectClosed();
    expect(openDialog).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    await findTable();
    await user.click(frenchTitle());
    await user.keyboard('Bonjour');

    // Kept: the table stays open with the change in it.
    openDialog.mockResolvedValueOnce(false);
    await user.click(tableButton('Cancel'));
    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(frenchTitle()).toHaveValue('Bonjour');

    // Thrown away: the table closes, and the protocol is as it was. It closes
    // by going back, and what guards Back finds nothing left to ask about.
    openDialog.mockResolvedValueOnce(true);
    const asked: boolean[] = [];
    const ask = () => asked.push(hasDirtyNestedDraft());
    window.addEventListener('popstate', ask);
    try {
      await user.click(tableButton('Cancel'));
      await expectClosed();
    } finally {
      window.removeEventListener('popstate', ask);
    }
    expect(asked).toEqual([false]);
    expect(openDialog).toHaveBeenCalledTimes(2);
    expect(stageTitle(store)).toEqual({ en: 'Hello' });

    // Opened again, the table shows what the protocol holds, not the text
    // that was thrown away.
    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    await findTable();
    expect(frenchTitle()).toHaveValue('');
  });

  it('tells Back and a refresh that it holds changes until they are saved', async () => {
    const { user } = renderPage();

    await user.click(
      screen.getByRole('link', { name: 'Open translation table' }),
    );
    await findTable();
    expect(hasDirtyNestedDraft()).toBe(false);

    await user.click(frenchTitle());
    await user.keyboard('Bonjour');
    expect(hasDirtyNestedDraft()).toBe(true);

    // Save closes by going back, and what guards Back asks, as that happens,
    // whether anything would be lost.
    const asked: boolean[] = [];
    const ask = () => asked.push(hasDirtyNestedDraft());
    window.addEventListener('popstate', ask);
    try {
      await user.click(tableButton('Save'));
      await expectClosed();
    } finally {
      window.removeEventListener('popstate', ask);
    }
    expect(asked).toEqual([false]);
    expect(hasDirtyNestedDraft()).toBe(false);
  });
});
