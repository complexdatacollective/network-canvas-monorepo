import { configureStore } from '@reduxjs/toolkit';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import TranslationTable from '../TranslationTable';

// French is missing the welcome title, both welcome texts, the thanks title
// and the person type's label; Spanish is missing only the thanks title, which
// exists only in English.
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
      items: [],
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
  render(
    <Provider store={store}>
      <TranslationTable />
    </Provider>,
  );
  return { store, user: userEvent.setup() };
};

type Rendered = ReturnType<typeof renderTable>;

/** The plain-text cell of `row` under `stage`, in `language`'s column. */
const cell = (stage: string, row: string, language: string) =>
  screen.getByRole('textbox', {
    name: new RegExp(`^Stage ${stage} .*\\b${row} ${language}$`),
  });

// Each group's heading is a row header too, of its group of rows.
const rowHeaders = () =>
  screen
    .getAllByRole('rowheader')
    .filter((header) => header.getAttribute('scope') === 'row');

const stageTitle = (store: Rendered['store'], index: number) => {
  const stage = getProtocol(store.getState())?.stages[index];
  return stage && 'title' in stage ? stage.title : undefined;
};

describe('TranslationTable', () => {
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
      // Thanks: label, title.
      'Stage name',
      'Page content › Page heading',
      // The person type's label.
      'Node type label',
    ]);
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

  it('shows only the texts with missing translations when asked', async () => {
    const { user } = renderTable();

    expect(screen.getByText(/^Showing /)).toHaveTextContent(
      'Showing 6 of 6 texts',
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Only texts with missing translations',
      }),
    );

    // Both stage labels are translated into every language.
    expect(screen.getByText(/^Showing /)).toHaveTextContent(
      'Showing 4 of 6 texts',
    );
    expect(rowHeaders().map((header) => header.textContent)).toEqual([
      'Page content › Page heading',
      'Page content › Item 1 › Content',
      'Page content › Page heading',
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
      ).toHaveLength(1);
    }
  });
});
