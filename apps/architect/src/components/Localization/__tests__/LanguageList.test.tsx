import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import LanguageList from '../LanguageList';

// French has the only copy of the welcome title, so it cannot be removed, and
// German is missing both texts.
const trilingual: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr', 'de'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
      title: { fr: 'Bonjour' },
      items: [],
    },
  ],
};

// Made before protocols declared their languages, so its text is marked as
// the unidentified language.
const migrated: CurrentProtocol = {
  ...trilingual,
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

const DEFAULT_REASON =
  'To remove the default language, make another language the default first.';
const STRANDED_REASON =
  '1 text exists only in French. Translate it into another language before removing French.';

const renderLanguageList = (protocol: CurrentProtocol = trilingual) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocol));
  render(
    <Provider store={store}>
      <LanguageList />
    </Provider>,
  );
  return { store };
};

const rowOf = (language: string) => {
  const row = screen
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(language, { exact: true }));
  if (!row) throw new Error(`No row for ${language}`);
  return row;
};

const actionsTrigger = (language: string) =>
  within(rowOf(language)).getByRole('button', {
    name: `Actions for ${language}`,
  });

const openActions = async (language: string) => {
  fireEvent.click(actionsTrigger(language));
  return screen.findByRole('menu', { name: `Actions for ${language}` });
};

describe('LanguageList', () => {
  it('lists languages alphabetically by name, whatever order the protocol declares them in', () => {
    renderLanguageList({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['es', 'de', 'fr', 'en'] },
    });

    const rows = screen.getAllByRole('listitem');
    expect(
      ['English', 'French', 'German', 'Spanish'].map((language) =>
        rows.indexOf(rowOf(language)),
      ),
    ).toEqual([0, 1, 2, 3]);
  });

  it('offers no way to reorder languages', () => {
    renderLanguageList();

    expect(screen.getByRole('list').tagName).toBe('UL');
    expect(
      screen.queryByRole('button', { name: /reorder/i }),
    ).not.toBeInTheDocument();
  });

  it('names the language in every control of its row', () => {
    renderLanguageList();

    const german = within(rowOf('German'));
    expect(
      german.getByRole('button', { name: 'Actions for German' }),
    ).toBeVisible();
    expect(
      german.queryByRole('button', { name: /^(Remove|Make default)$/ }),
    ).not.toBeInTheDocument();
  });

  it('marks a language that is missing translations, without linking anywhere', () => {
    renderLanguageList();

    const german = within(rowOf('German'));
    expect(german.getByText('Missing translations')).toBeVisible();
    expect(german.queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(rowOf('French')).queryByText('Missing translations'),
    ).not.toBeInTheDocument();
  });

  it('opens the translation table from beside Add languages', () => {
    renderLanguageList();

    expect(
      screen.getByRole('link', { name: 'Open translation table' }),
    ).toHaveAttribute('href', '/protocol/localization?table=open');
    expect(
      screen.getByRole('button', { name: 'Add languages' }),
    ).toBeInTheDocument();
  });

  it('keeps the default language’s Remove in its menu, unavailable, and says why', async () => {
    renderLanguageList();

    const menu = await openActions('English');
    expect(
      within(menu).queryByRole('menuitem', { name: 'Make default' }),
    ).not.toBeInTheDocument();

    const remove = within(menu).getByRole('menuitem', { name: 'Remove' });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription(DEFAULT_REASON);
    expect(remove).toHaveTextContent(DEFAULT_REASON);

    fireEvent.click(remove);
    expect(globalThis.__architectDialogMocks.confirm).not.toHaveBeenCalled();
  });

  it('says why a language holding the only copy of a text cannot be removed', async () => {
    renderLanguageList();

    const menu = await openActions('French');
    const remove = within(menu).getByRole('menuitem', { name: 'Remove' });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription(STRANDED_REASON);
    expect(remove).toHaveTextContent(STRANDED_REASON);
  });

  it('reaches an unavailable Remove with the arrow keys and closes on Escape', async () => {
    const user = userEvent.setup();
    renderLanguageList();

    const trigger = actionsTrigger('English');
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', {
      name: 'Actions for English',
    });
    const remove = within(menu).getByRole('menuitem', { name: 'Remove' });

    await user.keyboard('{ArrowDown}');
    expect(remove).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(globalThis.__architectDialogMocks.confirm).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('menu', { name: 'Actions for English' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('removes a language that can be removed, then returns focus to Add languages', async () => {
    const { store } = renderLanguageList();
    const { confirm } = globalThis.__architectDialogMocks;

    const menu = await openActions('German');
    const remove = within(menu).getByRole('menuitem', { name: 'Remove' });
    expect(remove).not.toHaveAttribute('aria-disabled');
    expect(remove).not.toHaveAccessibleDescription();
    fireEvent.click(remove);

    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(confirm.mock.lastCall?.[0]).toMatchObject({
      title: 'Remove German?',
      intent: 'destructive',
    });
    expect(getProtocol(store.getState())?.localization.locales).toEqual([
      'en',
      'fr',
    ]);

    const { finalFocus } = confirm.mock.lastCall?.[0] ?? {};
    if (typeof finalFocus !== 'function') throw new Error('No finalFocus');
    expect(finalFocus()).toBe(
      screen.getByRole('button', { name: 'Add languages' }),
    );
  });

  it('chooses the default language from a list above the languages, in alphabetical order', async () => {
    const user = userEvent.setup();
    const { store } = renderLanguageList({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['fr', 'de', 'en'] },
    });

    const select = screen.getByRole('combobox', { name: 'Default language' });
    expect(select).toHaveAccessibleDescription(
      'Participants see a text in this language when it has no translation in a language they use.',
    );
    expect(select).toHaveDisplayValue('English');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['English', 'French', 'German']);

    await user.selectOptions(select, 'German');

    expect(getProtocol(store.getState())?.localization.defaultLocale).toBe(
      'de',
    );
    expect(within(rowOf('German')).getByText('Default')).toBeVisible();
    expect(
      within(rowOf('English')).queryByText('Default'),
    ).not.toBeInTheDocument();
  });

  it('offers no way to rename a language', async () => {
    renderLanguageList();

    const menu = await openActions('German');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Remove']);
  });

  it('identifies the language of unidentified text from its notice', async () => {
    const { store } = renderLanguageList(migrated);
    const { openDialog } = globalThis.__architectDialogMocks;
    openDialog.mockResolvedValueOnce({ language: 'en' });

    fireEvent.click(screen.getByRole('button', { name: 'Identify language' }));

    await vi.waitFor(() => expect(openDialog).toHaveBeenCalledOnce());
    expect(openDialog.mock.lastCall?.[0]).toMatchObject({
      title: 'Identify the language of your text',
      submitLabel: 'Identify language',
    });
    await vi.waitFor(() =>
      expect(getProtocol(store.getState())?.localization).toEqual({
        defaultLocale: 'en',
        locales: ['en'],
      }),
    );
    expect(getProtocol(store.getState())?.stages[0]?.label).toEqual({
      en: 'Welcome',
    });
    expect(
      screen.queryByRole('button', { name: 'Identify language' }),
    ).not.toBeInTheDocument();
  });

  it('explains which translation participants see, in a closed disclosure', () => {
    renderLanguageList();

    const toggle = screen.getByRole('button', {
      name: 'Which translation participants see',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const panel = screen.getByRole('region', {
      name: 'Which translation participants see',
    });
    const steps = within(panel).getByRole('list');
    expect(steps.tagName).toBe('OL');
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((step) => step.textContent),
    ).toEqual([
      'Their own language: the one they chose, or the one their browser or device is set to.',
      'A closely related language, such as Brazilian Portuguese for a participant using European Portuguese.',
      'Another language their browser or device lists.',
      'The protocol’s default language.',
      'Any other language that has the text.',
    ]);
    expect(
      within(panel).getByRole('link', { name: 'Translating your protocol' }),
    ).toHaveAttribute(
      'href',
      expect.stringMatching(
        /\/design-protocols\/translating-your-protocol\/#the-default-language-and-which-translation-participants-see$/,
      ),
    );
  });

  it('leaves the explanation out while the protocol has one language', () => {
    renderLanguageList({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['en'] },
      stages: [],
    });

    expect(
      screen.queryByRole('button', {
        name: 'Which translation participants see',
      }),
    ).not.toBeInTheDocument();
  });

  it('offers the translation table and a choice of default only once there are two languages', () => {
    renderLanguageList({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['en'] },
      stages: [],
    });

    expect(
      screen.queryByRole('link', { name: 'Open translation table' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Default language' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add languages' }),
    ).toBeInTheDocument();
  });
});
