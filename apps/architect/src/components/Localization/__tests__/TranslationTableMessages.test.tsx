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

const VERSIONS_BLANK = 'Write something in every version of this text.';

/** Leaves the cell for the stage name's English cell. */
const leaveCell = async (
  user: ReturnType<typeof renderTable>['user'],
  language: string,
) => {
  await user.click(
    screen.getByRole('textbox', { name: /Stage name English$/ }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: cellName(language) })).toBe(
      null,
    ),
  );
};

const cellName = (language: string) =>
  new RegExp(`Brothers and sisters ${language}$`);

/** The cell of the list item, in `language`'s column, before it has focus. */
const messageCell = (language: string) =>
  screen.getByRole('button', { name: cellName(language) });

/** The text focus opens in that cell, once it has focus. */
const editedText = async (language: string) => {
  const text = await screen.findByRole('textbox', { name: cellName(language) });
  await waitFor(() => expect(text).toHaveFocus());
  return text;
};

/** Opens the folded versions in `text` and returns their lines. */
const openVersions = async (
  user: ReturnType<typeof renderTable>['user'],
  text: HTMLElement,
) => {
  await user.click(
    within(text).getByRole('button', { name: 'Participant or someone else' }),
  );
  return {
    aboutYou: await screen.findByRole('textbox', {
      name: 'About the participant',
    }),
    aboutSomeoneElse: screen.getByRole('textbox', {
      name: 'About someone else',
    }),
  };
};

describe('TranslationTable: texts with versions', () => {
  it('shows the text, its versions folded to a pill, until the cell has focus', () => {
    renderTable();

    expect(messageCell('English')).toHaveAccessibleDescription(
      /Participant or someone else/,
    );
    const pill = messageCell('English')
      .closest('td')
      ?.querySelector('[data-token="isYou"]');
    expect(pill).toHaveTextContent('Participant or someone else');
    expect(screen.queryByRole('textbox', { name: cellName('English') })).toBe(
      null,
    );
  });

  it('is edited as piped text is, and saved when the table is saved', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('French'));
    const text = await editedText('French');
    // A translation can word the text its own way: here one phrase that
    // names everyone, the participant included.
    await user.type(text, 'Frères et sœurs de ');
    await user.click(
      screen.getByRole('button', { name: 'Inject piped text from this stage' }),
    );
    const [name] = await screen.findAllByRole('option', { name: /^Name/ });
    if (name === undefined) throw new Error('Name not offered');
    await user.click(name);
    await waitFor(() =>
      expect(text.querySelector('[data-token="name"]')).not.toBeNull(),
    );
    await leaveCell(user, 'French');
    expect(listItem(store)).toEqual({ en: SIBLINGS });

    await save(user);
    expect(listItem(store)).toEqual({
      en: SIBLINGS,
      fr: 'Frères et sœurs de {name}',
    });
  });

  it('edits a version inside the text', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('English'));
    const { aboutYou } = await openVersions(user, await editedText('English'));
    await user.type(aboutYou, 'All ');
    await leaveCell(user, 'English');
    await save(user);

    expect(listItem(store)).toEqual({
      en: '{isYou, select, true {All Your brothers and sisters} other {Brothers and sisters of {name}}}',
    });
  });

  it('changes nothing when the cell is opened and left', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    await editedText('English');
    await leaveCell(user, 'English');
    await save(user);

    expect(getProtocol(store.getState())).toBe(before);
  });

  it('moves to the next row on Enter, also from inside a version', async () => {
    const { store, user } = renderTable();

    await user.click(messageCell('English'));
    const { aboutYou } = await openVersions(user, await editedText('English'));
    await user.type(aboutYou, 'All ');
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
      en: '{isYou, select, true {All Your brothers and sisters} other {Brothers and sisters of {name}}}',
    });
  });

  it('puts back the saved text on Escape, once a version is folded away', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    const { aboutYou } = await openVersions(user, await editedText('English'));
    await user.type(aboutYou, 'All ');
    // The first Escape folds the versions back into their pill and keeps
    // the change; the next leaves the cell as it was saved.
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'About the participant' }),
      ).toBeNull(),
    );
    const folded = await editedText('English');
    const { aboutYou: reopened } = await openVersions(user, folded);
    expect(reopened).toHaveTextContent(/^All Your brothers and sisters$/);
    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');

    const restored = await editedText('English');
    expect(
      within(restored).getByRole('button', {
        name: 'Participant or someone else',
      }),
    ).toBeInTheDocument();
    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
  });

  it('says why a version left empty cannot be saved, and refuses to save it', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    const { aboutYou } = await openVersions(user, await editedText('English'));
    await user.click(aboutYou);
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await leaveCell(user, 'English');

    expect(await screen.findByText(VERSIONS_BLANK)).toBeInTheDocument();
    expect(messageCell('English')).toHaveAttribute('aria-invalid', 'true');
    expect(messageCell('English')).toHaveAccessibleDescription(
      new RegExp(`${VERSIONS_BLANK}$`),
    );

    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
    // Save takes the researcher back into the text to finish it.
    await editedText('English');
  });

  it('says which placeholder a version leaves out, and refuses to save it', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('French'));
    await user.type(await editedText('French'), 'Ses frères et sœurs');
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
    await user.click(await editedText('English'));
    await user.keyboard('{Control>}a{/Control}{Backspace}');
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
