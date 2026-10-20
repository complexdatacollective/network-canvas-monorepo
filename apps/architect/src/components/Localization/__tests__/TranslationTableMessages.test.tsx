import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
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
      <FormStoreProvider>
        <TranslationTable onSaved={vi.fn()} onCancel={vi.fn()} />
      </FormStoreProvider>
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

const save = (user: ReturnType<typeof renderTable>['user']) =>
  user.click(screen.getByRole('button', { name: 'Save' }));

const VERSIONS_BLANK =
  'Write every version of this text, or leave them all empty.';

/** Leaves the cell for the stage name's English cell. */
const leaveCell = async (
  user: ReturnType<typeof renderTable>['user'],
  language: string,
) => {
  await user.click(
    screen.getByRole('textbox', { name: /Stage name English$/ }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: cellName(language) })).toBe(
      null,
    ),
  );
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
      /Your brothers and sisters.*Brothers and sisters of Name/,
    );
    // The placeholder is drawn as the pill the editor draws, not as text in
    // brackets.
    const pill = messageCell('English')
      .closest('td')
      ?.querySelector('[data-token="name"]');
    expect(pill).toHaveTextContent('Name');
    expect(messageCell('English').closest('td')).not.toHaveTextContent(
      '[Name]',
    );
    expect(screen.queryByRole('textbox', { name: cellName('English') })).toBe(
      null,
    );
  });

  it('is edited a version at a time, and saved as one text when the table is saved', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('French'));
    const [aboutYou, aboutSomeoneElse] = await versions('French');
    expect(aboutYou).toHaveAccessibleName(/About the participant/);
    await user.type(aboutYou!, 'Vos frères et sœurs');
    await user.type(aboutSomeoneElse!, 'Frères et sœurs de ');
    // The English names the person in the version about someone else, so
    // that version's toolbar says the name is still needed.
    await user.click(
      screen.getByRole('button', {
        name: 'Insert “Name” (required in this text)',
      }),
    );
    await leaveCell(user, 'French');
    expect(listItem(store)).toEqual({ en: SIBLINGS });
    expect(messageCell('French')).toHaveAccessibleDescription(
      /Vos frères et sœurs.*Frères et sœurs de Name/,
    );

    await save(user);
    expect(listItem(store)).toEqual({
      en: SIBLINGS,
      fr: '{isYou, select, true {Vos frères et sœurs} other {Frères et sœurs de {name}}}',
    });
  });

  it('changes nothing when the cell is opened and left', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    await versions('English');
    await leaveCell(user, 'English');
    await save(user);

    expect(getProtocol(store.getState())).toBe(before);
  });

  it('moves to the next row on Enter', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('English'));
    const [aboutYou] = await versions('English');
    await user.type(aboutYou!, ' (all)');
    await user.keyboard('{Enter}');

    // The interview's own words follow every text a stage holds.
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', {
          name: /Interview navigation › Exit button English$/,
        }),
      ).toHaveFocus(),
    );
    await save(user);
    expect(listItem(store)).toEqual({
      en: '{isYou, select, true {Your brothers and sisters (all)} other {Brothers and sisters of {name}}}',
    });
  });

  it('puts back the saved versions on Escape', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    const [aboutYou] = await versions('English');
    await user.type(aboutYou!, 'All ');
    await user.keyboard('{Escape}');

    const [restored] = await versions('English');
    expect(restored).toHaveTextContent(/^Your brothers and sisters$/);
    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
  });

  it('says why some versions written and others empty cannot be saved, and refuses to save them', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    const [aboutYou] = await versions('English');
    await user.click(aboutYou!);
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await leaveCell(user, 'English');

    expect(await screen.findByText(VERSIONS_BLANK)).toBeInTheDocument();
    expect(messageCell('English')).toHaveAttribute('aria-invalid', 'true');
    expect(messageCell('English')).toHaveAccessibleDescription(
      new RegExp(`${VERSIONS_BLANK}$`),
    );

    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
    // Save takes the researcher back into the versions to finish them.
    await versions('English');
  });

  it('says which placeholder a version leaves out, and refuses to save it', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('French'));
    const [aboutYou, aboutSomeoneElse] = await versions('French');
    await user.type(aboutYou!, 'Vos frères et sœurs');
    await user.type(aboutSomeoneElse!, 'Ses frères et sœurs');
    await leaveCell(user, 'French');

    const missing = 'Include “Name” in this version: About someone else.';
    expect(await screen.findByText(missing)).toBeInTheDocument();
    expect(messageCell('French')).toHaveAttribute('aria-invalid', 'true');

    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
  });

  it('says why the only translation cannot be cleared, and refuses to save it', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    for (const version of await versions('English')) {
      await user.click(version);
      await user.keyboard('{Control>}a{/Control}{Backspace}');
    }
    await leaveCell(user, 'English');
    expect(
      await screen.findByText(
        'This is the only translation, and it is in English. Add a translation in another language before clearing it.',
      ),
    ).toBeInTheDocument();

    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
  });
});
