import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import TranslationTable from '../TranslationTable';

// French is missing the welcome title and text, both thanks texts and the
// person type's label; Spanish is missing only the thanks texts, which exist
// only in English.
const trilingual: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr', 'es'] },
  assetManifest: {},
  codebook: {
    node: {
      person: {
        name: 'Person',
        label: { en: 'People', es: 'Personas' },
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue', es: 'Bienvenida' },
      title: { en: 'Hello', es: 'Hola' },
      items: [
        {
          id: 'intro',
          type: 'text',
          content: { en: 'Read **this** first', es: 'Lea esto primero' },
        },
      ],
    },
    {
      id: 'thanks',
      type: 'Information',
      label: { en: 'Thanks', fr: 'Merci', es: 'Gracias' },
      title: { en: 'Thank you' },
      items: [{ id: 'bye', type: 'text', content: { en: 'See you **soon**' } }],
    },
  ],
};

const renderTable = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(trilingual)));
  const { unmount } = render(
    <Provider store={store}>
      <TranslationTable />
    </Provider>,
  );
  return { store, unmount, user: userEvent.setup() };
};

type Rendered = ReturnType<typeof renderTable>;

const cellName = (stage: string, row: string, language: string) =>
  new RegExp(`^Stage ${stage} .*\\b${row} ${language}$`);

/** The plain-text cell of `row` under `stage`, in `language`'s column. */
const cell = (stage: string, row: string, language: string) =>
  screen.getByRole('textbox', { name: cellName(stage, row, language) });

/**
 * The formatted-text cell of the first item under `stage`, in `language`'s
 * column, as it is before it has focus.
 */
const formattedCell = (stage: string, language: string) =>
  screen.getByRole('button', { name: cellName(stage, 'Content', language) });

/** The same cell's editor, which focus opens in it. */
const formattedEditor = async (stage: string, language: string) => {
  const editor = await screen.findByRole('textbox', {
    name: cellName(stage, 'Content', language),
  });
  await waitFor(() => expect(editor).toHaveFocus());
  return editor;
};

const itemContent = (store: Rendered['store'], stageIndex: number): unknown => {
  const stage = getProtocol(store.getState())?.stages[stageIndex];
  return stage && 'items' in stage ? stage.items?.[0]?.content : undefined;
};

// Each group's heading is a row header too, of its group of rows.
const rowHeaders = () =>
  screen
    .getAllByRole('rowheader')
    .filter((header) => header.getAttribute('scope') === 'row');

const stageTitle = (store: Rendered['store'], index: number) => {
  const stage = getProtocol(store.getState())?.stages[index];
  return stage && 'title' in stage ? stage.title : undefined;
};

const shownCount = () => screen.getByText(/^Showing /);

const filterMenu = () =>
  screen.getByRole('combobox', { name: 'Texts to show' });

describe('TranslationTable', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('lists a row per text under its stage, and a column per language in alphabetical order', () => {
    renderTable();

    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual([
      'Text',
      expect.stringMatching(/^EnglishDefault/),
      expect.stringMatching(/^French/),
      expect.stringMatching(/^Spanish/),
    ]);

    expect(rowHeaders().map((header) => header.textContent)).toEqual([
      // Welcome: label, title, the text item's content.
      'Stage name',
      'Page content › Page heading',
      'Page content › Item 1 › Content',
      // Thanks: label, title, the text item's content.
      'Stage name',
      'Page content › Page heading',
      'Page content › Item 1 › Content',
      // The person type's label.
      'Node type label',
      // The words the interview itself shows, which Network Canvas supplies
      // in all three languages.
      'Throughout the interview › Exit button',
      'Throughout the interview › Exit explanation',
      'Throughout the interview › Screen error message',
      'Throughout the interview › Missing item message',
      'Throughout the interview › Back button',
      'Throughout the interview › Continue button',
      'Throughout the interview › Cancel button',
      'Throughout the interview › Done button',
      'Throughout the interview › Delete button',
      'Throughout the interview › General error message',
    ]);
    expect(
      screen.getByRole('rowheader', { name: 'Interview text' }),
    ).toBeInTheDocument();
    // Each group is headed by its stage's name or its type's name, linking to
    // where it is edited.
    expect(
      screen.getByRole('rowheader', {
        name: 'Stage 1 · Welcome · Information',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Person' })).toHaveAttribute(
      'href',
      expect.stringContaining('codebook'),
    );

    // An empty cell shows what participants see instead.
    const frenchTitle = cell('1', 'Page heading', 'French');
    expect(frenchTitle).toHaveValue('');
    expect(frenchTitle).toHaveAccessibleDescription(
      'Hello Not translated yet. Participants see the English text, unless their browser also lists a language that has it.',
    );
    expect(
      screen.getByText(/^\* Unless the participant’s browser/),
    ).toBeInTheDocument();
  });

  it('saves a translation when its cell loses focus', async () => {
    const { store, user } = renderTable();

    await user.type(cell('1', 'Page heading', 'French'), 'Bonjour');
    expect(stageTitle(store, 0)).toEqual({ en: 'Hello', es: 'Hola' });

    await user.tab();
    expect(stageTitle(store, 0)).toEqual({
      en: 'Hello',
      es: 'Hola',
      fr: 'Bonjour',
    });
  });

  it('saves a translation still being typed when the table is taken away', async () => {
    const { store, unmount, user } = renderTable();

    await user.click(cell('1', 'Page heading', 'French'));
    await user.keyboard('Bonjour');
    unmount();

    expect(stageTitle(store, 0)).toEqual({
      en: 'Hello',
      es: 'Hola',
      fr: 'Bonjour',
    });
  });

  it('puts back the saved translation on Escape', async () => {
    const { store, user } = renderTable();

    const spanish = cell('1', 'Page heading', 'Spanish');
    await user.type(spanish, ' amigos');
    await user.keyboard('{Escape}');
    expect(spanish).toHaveValue('Hola');

    await user.tab();
    expect(stageTitle(store, 0)).toEqual({ en: 'Hello', es: 'Hola' });
  });

  it('removes a translation that is cleared, rather than storing it empty', async () => {
    const { store, user } = renderTable();

    await user.clear(cell('1', 'Page heading', 'Spanish'));
    await user.tab();

    expect(stageTitle(store, 0)).toEqual({ en: 'Hello' });
  });

  it('refuses to clear the only translation a text has, and says why', async () => {
    const { store, user } = renderTable();

    const english = cell('2', 'Page heading', 'English');
    await user.clear(english);
    expect(
      screen.getByText(
        'This text exists only in English. Translate it into another language before clearing it.',
      ),
    ).toBeInTheDocument();

    await user.tab();
    expect(stageTitle(store, 1)).toEqual({ en: 'Thank you' });
    expect(english).toHaveValue('Thank you');
  });

  it('finds texts by a translation shown, or by the stage or type they belong to', async () => {
    const { user } = renderTable();
    const search = screen.getByRole('searchbox', {
      name: 'Search texts and translations',
    });

    await user.type(search, 'hola');
    expect(shownCount()).toHaveTextContent('Showing 1 of 17 texts');
    expect(rowHeaders().map((header) => header.textContent)).toEqual([
      'Page content › Page heading',
    ]);

    await user.clear(search);
    await user.type(search, 'thanks');
    expect(shownCount()).toHaveTextContent('Showing 3 of 17 texts');

    await user.clear(search);
    await user.type(search, 'nothing like this');
    expect(screen.getByText('No texts match your search.')).toBeInTheDocument();
  });

  it('shows only the texts missing a translation into any language shown', async () => {
    const { user } = renderTable();

    expect(filterMenu()).toHaveDisplayValue('All texts');
    expect(shownCount()).toHaveTextContent('Showing 17 of 17 texts');
    await user.selectOptions(filterMenu(), 'Missing in any shown language');

    // Both stage labels are translated into every language.
    expect(shownCount()).toHaveTextContent('Showing 5 of 17 texts');
    expect(rowHeaders().map((header) => header.textContent)).toEqual([
      'Page content › Page heading',
      'Page content › Item 1 › Content',
      'Page content › Page heading',
      'Page content › Item 1 › Content',
      'Node type label',
    ]);
    const thanks = screen
      .getByRole('link', { name: 'Thanks' })
      .closest('tbody');
    expect(thanks).not.toBeNull();
    if (thanks) {
      expect(
        within(thanks)
          .getAllByRole('rowheader')
          .filter((header) => header.getAttribute('scope') === 'row'),
      ).toHaveLength(2);
    }
    // Kept in the address, which a link to the table can carry.
    expect(window.location.search).toBe('?missing=any');

    await user.selectOptions(filterMenu(), 'All texts');
    expect(shownCount()).toHaveTextContent('Showing 17 of 17 texts');
    expect(window.location.search).toBe('');
  });

  it('shows only the texts missing a translation into one language', async () => {
    const { user } = renderTable();

    await user.selectOptions(filterMenu(), 'Missing Spanish');

    expect(shownCount()).toHaveTextContent('Showing 2 of 17 texts');
    expect(screen.getByRole('link', { name: 'Thanks' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Welcome' }),
    ).not.toBeInTheDocument();
    expect(window.location.search).toBe('?missing=es');

    await user.selectOptions(filterMenu(), 'Missing English');
    expect(
      screen.getByText('Every text is translated into English.'),
    ).toBeInTheDocument();
  });

  it('opens on the texts a link asks for', () => {
    window.history.replaceState(
      null,
      '',
      '/protocol/localization?table=open&missing=es',
    );
    renderTable();

    expect(filterMenu()).toHaveDisplayValue('Missing Spanish');
    expect(shownCount()).toHaveTextContent('Showing 2 of 17 texts');
  });

  it('opens on every text when a link asks for a language the protocol does not have', () => {
    window.history.replaceState(
      null,
      '',
      '/protocol/localization?table=open&missing=de',
    );
    renderTable();

    expect(filterMenu()).toHaveDisplayValue('All texts');
    expect(shownCount()).toHaveTextContent('Showing 17 of 17 texts');
  });

  it('shows the column of the language whose gaps it lists', async () => {
    const { user } = renderTable();
    const languageNames = () =>
      screen
        .getAllByRole('columnheader')
        .slice(1)
        .map((header) => header.textContent);

    await user.click(screen.getByRole('button', { name: /^Languages/ }));
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Spanish' }),
    );
    await user.keyboard('{Escape}');
    expect(languageNames()).toEqual([
      expect.stringMatching(/^English/),
      expect.stringMatching(/^French/),
    ]);

    await user.selectOptions(filterMenu(), 'Missing Spanish');
    expect(languageNames()).toEqual([
      expect.stringMatching(/^English/),
      expect.stringMatching(/^French/),
      expect.stringMatching(/^Spanish/),
    ]);

    // Hiding it again lists the gaps in the languages still shown.
    await user.click(screen.getByRole('button', { name: /^Languages/ }));
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Spanish' }),
    );
    expect(filterMenu()).toHaveDisplayValue('Missing in any shown language');
  });

  describe('formatted text', () => {
    it('shows the text as participants see it until the cell has focus', () => {
      renderTable();

      const spanish = formattedCell('1', 'Spanish');
      expect(spanish).toHaveAccessibleDescription('Lea esto primero');
      const english = formattedCell('1', 'English').closest('td');
      expect(english?.querySelector('strong')).toHaveTextContent('this');
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });

    it('is edited in its cell, with its toolbar, and saved when the cell is left', async () => {
      const { store, user } = renderTable();

      await user.click(formattedCell('1', 'French'));
      const editor = await formattedEditor('1', 'French');
      const cellElement = editor.closest('td');
      expect(cellElement).toHaveAttribute('lang', 'fr');
      expect(
        cellElement && within(cellElement).getByRole('toolbar'),
      ).toBeInTheDocument();

      await user.type(editor, 'Lisez');
      expect(itemContent(store, 0)).toEqual({
        en: 'Read **this** first',
        es: 'Lea esto primero',
      });

      await user.click(cell('1', 'Page heading', 'Spanish'));
      await waitFor(() =>
        expect(itemContent(store, 0)).toEqual({
          en: 'Read **this** first',
          es: 'Lea esto primero',
          fr: 'Lisez',
        }),
      );
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
      expect(formattedCell('1', 'French')).toHaveAccessibleDescription('Lisez');
    });

    it('puts back the saved text on Escape and keeps focus in the cell', async () => {
      const { store, user } = renderTable();

      await user.click(formattedCell('1', 'Spanish'));
      const editor = await formattedEditor('1', 'Spanish');
      await user.type(editor, ' ahora');
      await user.keyboard('{Escape}');

      const restored = await formattedEditor('1', 'Spanish');
      expect(restored).toHaveTextContent(/^Lea esto primero$/);

      await user.click(cell('1', 'Page heading', 'Spanish'));
      await waitFor(() =>
        expect(screen.queryByRole('toolbar')).not.toBeInTheDocument(),
      );
      expect(itemContent(store, 0)).toEqual({
        en: 'Read **this** first',
        es: 'Lea esto primero',
      });
    });

    it('saves and moves to the next row on Ctrl+Enter', async () => {
      const { store, user } = renderTable();

      await user.click(formattedCell('1', 'French'));
      const editor = await formattedEditor('1', 'French');
      await user.type(editor, 'Lisez');
      await user.keyboard('{Control>}{Enter}{/Control}');

      // The next row is the next stage's name.
      expect(cell('2', 'Stage name', 'French')).toHaveFocus();
      await waitFor(() =>
        expect(itemContent(store, 0)).toEqual({
          en: 'Read **this** first',
          es: 'Lea esto primero',
          fr: 'Lisez',
        }),
      );
    });

    it('leaves by Tab through its toolbar to the next cell', async () => {
      const { store, user } = renderTable();

      await user.click(formattedCell('1', 'French'));
      const editor = await formattedEditor('1', 'French');
      await user.type(editor, 'Lisez');
      await user.tab();
      expect(editor.closest('td')).toContainElement(
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      );
      await user.tab();

      // The next cell is formatted text too, so focus opens its editor.
      await formattedEditor('1', 'Spanish');
      await waitFor(() =>
        expect(itemContent(store, 0)).toEqual({
          en: 'Read **this** first',
          es: 'Lea esto primero',
          fr: 'Lisez',
        }),
      );
    });

    it('refuses to clear the only translation, and keeps it', async () => {
      const { store, user } = renderTable();

      await user.click(formattedCell('2', 'English'));
      const editor = await formattedEditor('2', 'English');
      await user.clear(editor);
      expect(
        await screen.findByText(
          'This text exists only in English. Translate it into another language before clearing it.',
        ),
      ).toBeInTheDocument();

      await user.click(cell('2', 'Page heading', 'English'));
      await waitFor(() =>
        expect(screen.queryByRole('toolbar')).not.toBeInTheDocument(),
      );
      expect(itemContent(store, 1)).toEqual({ en: 'See you **soon**' });
      expect(formattedCell('2', 'English')).toHaveAccessibleDescription(
        'See you soon',
      );
    });
  });
});
