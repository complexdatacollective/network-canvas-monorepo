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

const DEFAULT_REASON =
  'To remove the default language, make another language the default first.';
const STRANDED_REASON =
  '1 string has a translation only in French. Translate it into another language before removing French.';

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

// The explanation of which translation participants see is a list too, so a
// language's row is told apart by its delete button.
const languageRows = () =>
  screen
    .getAllByRole('listitem')
    .filter(
      (item) =>
        within(item).queryByRole('button', { name: /^Remove / }) !== null,
    );

const rowOf = (language: string) => {
  const row = languageRows().find((item) =>
    within(item).queryByText(language, { exact: true }),
  );
  if (!row) throw new Error(`No row for ${language}`);
  return row;
};

const removeButton = (language: string) =>
  within(rowOf(language)).getByRole('button', {
    name: `Remove ${language}`,
  });

describe('LanguageList', () => {
  it('lists languages alphabetically by name, whatever order the protocol declares them in', () => {
    renderLanguageList({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['es', 'de', 'fr', 'en'] },
    });

    const rows = languageRows();
    expect(
      ['English', 'French', 'German', 'Spanish'].map((language) =>
        rows.indexOf(rowOf(language)),
      ),
    ).toEqual([0, 1, 2, 3]);
  });

  it('offers no way to reorder languages', () => {
    renderLanguageList();

    expect(rowOf('English').parentElement?.tagName).toBe('UL');
    expect(
      screen.queryByRole('button', { name: /reorder/i }),
    ).not.toBeInTheDocument();
  });

  it('gives each language three controls, which edit its translations, change it and remove it, and are named for it', () => {
    renderLanguageList();

    expect(
      within(rowOf('German'))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Edit German translations',
      'Change German to a different language',
      'Remove German',
    ]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the translation table on a language from its row’s edit button', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/protocol/localization');
    renderLanguageList();

    await user.click(
      within(rowOf('German')).getByRole('button', {
        name: 'Edit German translations',
      }),
    );

    expect(window.location.pathname).toBe('/protocol/localization');
    expect(window.location.search).toBe('?table=open&language=de');
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

  it('keeps the default language’s delete button unavailable, and says why', async () => {
    const user = userEvent.setup();
    renderLanguageList();

    const remove = removeButton('English');
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription(DEFAULT_REASON);

    await user.hover(remove);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      DEFAULT_REASON,
    );

    await user.click(remove);
    expect(globalThis.__architectDialogMocks.confirm).not.toHaveBeenCalled();
  });

  it('says why a language holding the only copy of a text cannot be removed', () => {
    renderLanguageList();

    const remove = removeButton('French');
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAccessibleDescription(STRANDED_REASON);
  });

  it('keeps an unavailable delete button in the tab order, and shows why on focus', async () => {
    const user = userEvent.setup();
    renderLanguageList();

    const remove = removeButton('English');
    remove.focus();
    expect(remove).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      DEFAULT_REASON,
    );

    await user.keyboard('{Enter}');
    expect(globalThis.__architectDialogMocks.confirm).not.toHaveBeenCalled();
  });

  it('removes a language that can be removed, then returns focus to Add languages', async () => {
    const { store } = renderLanguageList();
    const { confirm } = globalThis.__architectDialogMocks;

    const remove = removeButton('German');
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
      'Participants see this language wherever there is no translation in a language they use.',
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

  it('records the text of a language as another language from that language’s row', async () => {
    const { store } = renderLanguageList();
    const { openDialog } = globalThis.__architectDialogMocks;
    openDialog.mockResolvedValueOnce({ languages: ['es'] });

    fireEvent.click(
      within(rowOf('German')).getByRole('button', {
        name: 'Change German to a different language',
      }),
    );

    await vi.waitFor(() => expect(openDialog).toHaveBeenCalledOnce());
    expect(openDialog.mock.lastCall?.[0]).toMatchObject({
      title: 'Change German to a different language',
      submitLabel: 'Change language',
    });
    await vi.waitFor(() =>
      expect(getProtocol(store.getState())?.localization).toEqual({
        defaultLocale: 'en',
        locales: ['en', 'fr', 'es'],
      }),
    );
    expect(getProtocol(store.getState())?.stages[0]?.label).toEqual({
      en: 'Welcome',
      fr: 'Bienvenue',
    });
    expect(rowOf('Spanish')).toBeInTheDocument();
  });

  it('moves the translations and the default with the language changed', async () => {
    const { store } = renderLanguageList();
    globalThis.__architectDialogMocks.openDialog.mockResolvedValueOnce({
      languages: ['es'],
    });

    fireEvent.click(
      within(rowOf('English')).getByRole('button', {
        name: 'Change English to a different language',
      }),
    );

    await vi.waitFor(() =>
      expect(getProtocol(store.getState())?.localization).toEqual({
        defaultLocale: 'es',
        locales: ['es', 'fr', 'de'],
      }),
    );
    expect(getProtocol(store.getState())?.stages[0]?.label).toEqual({
      es: 'Welcome',
      fr: 'Bienvenue',
    });
  });

  it('offers only languages the protocol does not have yet', async () => {
    renderLanguageList();
    const { openDialog } = globalThis.__architectDialogMocks;
    openDialog.mockResolvedValueOnce(undefined);

    fireEvent.click(
      within(rowOf('German')).getByRole('button', {
        name: 'Change German to a different language',
      }),
    );

    await vi.waitFor(() => expect(openDialog).toHaveBeenCalledOnce());
    const { children } = openDialog.mock.lastCall?.[0] ?? {};
    const { choices, unavailable } = (
      children as {
        props: { choices: { locale: string }[]; unavailable: string[] };
      }
    ).props;
    const offered = choices.map(({ locale }) => locale);
    expect(offered.length).toBeGreaterThan(0);
    for (const declared of ['en', 'fr', 'de']) {
      expect(offered).not.toContain(declared);
    }
    expect(offered).not.toContain('und');
    // A typed code is held to the same languages.
    expect(unavailable).toEqual(['en', 'fr', 'de']);
  });

  it('explains which translation participants see under the heading', () => {
    renderLanguageList();

    const section = screen.getByRole('region', { name: 'Protocol languages' });
    expect(section).toHaveAccessibleDescription(
      expect.stringMatching(
        /^Participants can take the interview in any of these languages\. Where something is not translated, they see the first of the following languages that has a translation:/,
      ),
    );
    expect(
      screen.queryByRole('button', { name: /^Which translation/ }),
    ).not.toBeInTheDocument();

    const steps = within(section)
      .getAllByRole('list')
      .find((list) => list.tagName === 'OL');
    if (!steps) throw new Error('No numbered list of languages');
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((step) => step.textContent),
    ).toEqual([
      'Their own language: the one they chose, or the one their browser or device is set to.',
      'A closely related language, such as Brazilian Portuguese for a participant using European Portuguese.',
      'Another language their browser or device lists.',
      'The protocol’s default language.',
      'Any other language that has a translation.',
    ]);
    expect(
      within(section).getByRole('link', { name: 'Translating your protocol' }),
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
      screen.getByRole('region', { name: 'Protocol languages' }),
    ).toHaveAccessibleDescription(
      'Participants take the interview in this language. Add more languages to let them choose one.',
    );
    expect(
      screen.queryByRole('link', { name: 'Translating your protocol' }),
    ).not.toBeInTheDocument();
  });

  // The table is where the protocol's own words for the interface, such as
  // its error message, are edited, so one language is enough to need it.
  it('offers the translation table with one language, and a choice of default only once there are two', () => {
    renderLanguageList({
      ...trilingual,
      localization: { defaultLocale: 'en', locales: ['en'] },
      stages: [],
    });

    expect(
      screen.getByRole('link', { name: 'Open translation table' }),
    ).toHaveAttribute('href', '/protocol/localization?table=open');
    expect(
      screen.queryByRole('combobox', { name: 'Default language' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add languages' }),
    ).toBeInTheDocument();
  });

  // Swahili is a language Network Canvas has no built-in wording in.
  describe('the fallback language', () => {
    const swahili: CurrentProtocol = {
      ...trilingual,
      localization: { defaultLocale: 'sw', locales: ['sw'] },
      stages: [],
    };
    const fallbackSelect = () =>
      screen.queryByRole('combobox', { name: /^Fallback language/ });
    const REQUIRED =
      'Choose a fallback language. The protocol can’t be downloaded until you do.';

    it('is not asked for while the default language is one Network Canvas has wording in', () => {
      renderLanguageList();

      expect(fallbackSelect()).not.toBeInTheDocument();
    });

    it('is asked for in a protocol whose only language Network Canvas has no wording in, with nothing chosen', () => {
      renderLanguageList(swahili);

      const select = fallbackSelect();
      expect(select).toBeRequired();
      expect(select).toHaveValue('');
      expect(select).toHaveAccessibleDescription(
        expect.stringContaining(
          'Network Canvas has no built-in wording in Swahili.',
        ),
      );
      expect(screen.getByText(REQUIRED)).toBeInTheDocument();
    });

    it('offers every language Network Canvas has wording in, by name, whether or not the protocol declares it', () => {
      renderLanguageList(swahili);

      const select = fallbackSelect();
      if (!select) throw new Error('No fallback language list');
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        'Choose a language…',
        'Arabic',
        'Brazilian Portuguese',
        'Dutch',
        'English',
        'French',
        'German',
        'Italian',
        'Simplified Chinese',
        'Spanish',
        'Traditional Chinese',
      ]);
    });

    it('is recorded in the protocol when chosen, and can then only be changed', async () => {
      const user = userEvent.setup();
      const { store } = renderLanguageList(swahili);

      const select = fallbackSelect();
      if (!select) throw new Error('No fallback language list');
      await user.selectOptions(select, 'Spanish');

      expect(getProtocol(store.getState())?.localization).toEqual({
        defaultLocale: 'sw',
        locales: ['sw'],
        fallbackLocale: 'es',
      });
      expect(fallbackSelect()).toHaveValue('es');
      expect(screen.queryByText(REQUIRED)).not.toBeInTheDocument();
      expect(
        within(select).queryByRole('option', { name: 'Choose a language…' }),
      ).not.toBeInTheDocument();
    });

    it('appears when such a language becomes the default, and goes with its choice when one Network Canvas has wording in does', async () => {
      const user = userEvent.setup();
      const { store } = renderLanguageList({
        ...trilingual,
        localization: { defaultLocale: 'en', locales: ['en', 'fr', 'sw'] },
      });
      const defaultSelect = screen.getByRole('combobox', {
        name: 'Default language',
      });

      await user.selectOptions(defaultSelect, 'Swahili');
      const select = fallbackSelect();
      if (!select) throw new Error('No fallback language list');
      expect(select).toHaveValue('');
      await user.selectOptions(select, 'French');
      expect(getProtocol(store.getState())?.localization.fallbackLocale).toBe(
        'fr',
      );

      await user.selectOptions(defaultSelect, 'English');
      expect(fallbackSelect()).not.toBeInTheDocument();
      expect(getProtocol(store.getState())?.localization).toEqual({
        defaultLocale: 'en',
        locales: ['en', 'fr', 'sw'],
      });
    });
  });
});
