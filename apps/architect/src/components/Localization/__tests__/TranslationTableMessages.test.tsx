import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getProtocol } from '~/selectors/protocol';

import TranslationTable from '../TranslationTable';

const SIBLINGS =
  '{isYou, select, true {Your brothers and sisters} other {Brothers and sisters of {name}}}';

const protocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [
    {
      id: 'family',
      type: 'FamilyPedigree',
      label: { en: 'Family', fr: 'Famille' },
      completeness: {
        itemText: { siblings: { listItem: { en: SIBLINGS } } },
      },
    },
  ],
} as unknown as CurrentProtocol;

const renderTable = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(protocol)));
  render(
    <Provider store={store}>
      <TranslationTable />
    </Provider>,
  );
  return { store, user: userEvent.setup() };
};

const listItem = (store: ReturnType<typeof renderTable>['store']): unknown => {
  const stage = getProtocol(store.getState())?.stages[0];
  return stage && 'completeness' in stage
    ? stage.completeness?.itemText?.siblings?.listItem
    : undefined;
};

const cellName = (language: string) =>
  new RegExp(`Brothers and sisters ${language}$`);

/** The cell of the list item, in `language`'s column, before it has focus. */
const messageCell = (language: string) =>
  screen.getByRole('button', { name: cellName(language) });

/** The versions focus opens in that cell, once the first has focus. */
const versions = async (language: string) => {
  const group = await screen.findByRole('group', { name: cellName(language) });
  const textboxes = within(group).getAllByRole('textbox');
  await waitFor(() => expect(textboxes[0]).toHaveFocus());
  return textboxes;
};

describe('TranslationTable: texts with versions', () => {
  it('shows each version, with its placeholders, until the cell has focus', () => {
    renderTable();

    expect(messageCell('English')).toHaveAccessibleDescription(
      /Your brothers and sisters.*Brothers and sisters of \[Name\]/,
    );
    expect(screen.queryByRole('textbox', { name: cellName('English') })).toBe(
      null,
    );
  });

  it('is edited a version at a time, and saved as one text when the cell is left', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('French'));
    const [aboutYou, aboutSomeoneElse] = await versions('French');
    expect(aboutYou).toHaveAccessibleName(/About the participant/);
    await user.type(aboutYou!, 'Vos frères et sœurs');
    await user.type(aboutSomeoneElse!, 'Frères et sœurs');
    expect(listItem(store)).toEqual({ en: SIBLINGS });

    await user.click(
      screen.getByRole('textbox', { name: /Stage name English$/ }),
    );
    await waitFor(() =>
      expect(listItem(store)).toEqual({
        en: SIBLINGS,
        fr: '{isYou, select, true {Vos frères et sœurs} other {Frères et sœurs}}',
      }),
    );
    expect(screen.queryByRole('group', { name: cellName('French') })).toBe(
      null,
    );
  });

  it('changes nothing when the cell is opened and left', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    await versions('English');
    await user.click(
      screen.getByRole('textbox', { name: /Stage name English$/ }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: cellName('English') })).toBe(
        null,
      ),
    );
    expect(getProtocol(store.getState())).toBe(before);
  });

  it('saves on Enter, keeping the cell open when it is the last row', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('English'));
    const [aboutYou] = await versions('English');
    await user.type(aboutYou!, ' (all)');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(listItem(store)).toEqual({
        en: '{isYou, select, true {Your brothers and sisters (all)} other {Brothers and sisters of {name}}}',
      }),
    );
    expect(
      screen.getByRole('group', { name: cellName('English') }),
    ).toBeVisible();
  });

  it('puts back the saved versions on Escape', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('English'));
    const [aboutYou] = await versions('English');
    await user.type(aboutYou!, 'All ');
    await user.keyboard('{Escape}');

    const [restored] = await versions('English');
    expect(restored).toHaveTextContent(/^Your brothers and sisters$/);
    await user.click(
      screen.getByRole('textbox', { name: /Stage name English$/ }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: cellName('English') })).toBe(
        null,
      ),
    );
    expect(listItem(store)).toEqual({ en: SIBLINGS });
  });

  it('refuses to clear the only translation, and keeps it', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('English'));
    for (const version of await versions('English')) {
      await user.click(version);
      await user.keyboard('{Control>}a{/Control}{Backspace}');
    }
    expect(
      await screen.findByText(
        'This text exists only in English. Translate it into another language before clearing it.',
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('textbox', { name: /Stage name English$/ }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: cellName('English') })).toBe(
        null,
      ),
    );
    expect(listItem(store)).toEqual({ en: SIBLINGS });
  });
});
