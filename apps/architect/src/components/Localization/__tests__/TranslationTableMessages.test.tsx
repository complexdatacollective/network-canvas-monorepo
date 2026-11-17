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

/** A text whose last version has a choice of its own among its words. */
const withChoiceInASentence = (listItem: string) => {
  const shown = structuredClone(protocol);
  const stage = shown.stages[0];
  if (
    stage !== undefined &&
    'completeness' in stage &&
    stage.completeness?.itemText?.siblings
  ) {
    stage.completeness.itemText.siblings.listItem = { en: listItem };
  }
  return shown;
};

const renderTable = (shown: CurrentProtocol = protocol) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(structuredClone(shown)));
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

/**
 * Presses Save and waits for it to finish: Save checks the protocol it would
 * write before writing it, which takes a moment.
 */
const save = async (user: ReturnType<typeof renderTable>['user']) => {
  const button = screen.getByRole('button', { name: 'Save' });
  await user.click(button);
  await waitFor(() => expect(button).toBeEnabled());
};

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
  new RegExp(`Brothers and sisters item ${language}$`);

/** The cell of the list item, in `language`'s column, before it has focus. */
const messageCell = (language: string) =>
  screen.getByRole('button', { name: cellName(language) });

/** The text focus opens in that cell, once it has focus. */
const editedText = async (language: string) => {
  const text = await screen.findByRole('textbox', { name: cellName(language) });
  await waitFor(() => expect(text).toHaveFocus());
  return text;
};

/**
 * The lines of the text's versions. The text in this cell is one choice and
 * nothing else, so they are listed open rather than folded to a pill.
 */
const versionLines = async () => ({
  aboutYou: await screen.findByRole('textbox', {
    name: 'About the participant',
  }),
  aboutSomeoneElse: await screen.findByRole('textbox', {
    name: 'About someone else',
  }),
});

describe('TranslationTable: texts with versions', () => {
  it('shows the text, a line for each of its versions, until the cell has focus', () => {
    renderTable();

    const cell = messageCell('English').closest('td');
    expect(cell).toHaveAttribute('data-typed-language');
    // The text is nothing but a choice between versions, so each is written
    // out under its case; the words are readable before the cell is edited.
    const versions = [
      ...(cell?.querySelectorAll('[data-version-summary]') ?? []),
    ];
    expect(versions.map((version) => version.textContent)).toEqual([
      'About the participantYour brothers and sisters',
      'About someone elseBrothers and sisters of Name',
    ]);
    expect(messageCell('English')).toHaveAccessibleDescription(
      /About the participantYour brothers and sisters/,
    );
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
    await editedText('English');
    const { aboutYou } = await versionLines();
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
    await editedText('English');
    const { aboutYou } = await versionLines();
    await user.type(aboutYou, 'All ');
    await user.keyboard('{Enter}');

    // The stage's next text, which the table lists whether or not the
    // protocol holds wording of its own for it.
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', {
          name: /No brothers or sisters button English$/,
        }),
      ).toHaveFocus(),
    );
    await save(user);
    expect(listItem(store)).toEqual({
      en: '{isYou, select, true {All Your brothers and sisters} other {Brothers and sisters of {name}}}',
    });
  });

  it('puts back the saved text on Escape, after the first Escape has left the version', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    const text = await editedText('English');
    const { aboutYou } = await versionLines();
    await user.type(aboutYou, 'All ');
    // The first Escape hands the caret back to the line and keeps the
    // change, with every version still shown; the next leaves the cell as it
    // was saved.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(text).toHaveFocus());
    expect(
      await screen.findByRole('textbox', { name: 'About the participant' }),
    ).toHaveTextContent(/^All Your brothers and sisters$/);
    await user.keyboard('{Escape}');

    await editedText('English');
    expect(
      await screen.findByRole('textbox', { name: 'About the participant' }),
    ).toHaveTextContent(/^Your brothers and sisters$/);
    await save(user);
    expect(getProtocol(store.getState())).toBe(before);
  });

  it('steps between the versions with the arrow keys, rather than leaving the cell', async () => {
    const { user } = renderTable();

    await user.click(messageCell('English'));
    await editedText('English');
    const { aboutYou, aboutSomeoneElse } = await versionLines();
    await user.click(aboutYou);
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(aboutSomeoneElse).toHaveFocus());
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(aboutYou).toHaveFocus());
  });

  it('says why a version left empty cannot be saved, and refuses to save it', async () => {
    const { store, user } = renderTable();
    const before = getProtocol(store.getState());

    await user.click(messageCell('English'));
    await editedText('English');
    const { aboutYou } = await versionLines();
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

  // Network Canvas words this text, so a cell with none of the researcher's
  // wording is not an empty one: it reads as Network Canvas words it.
  it("goes back to Network Canvas's wording when its only translation is cleared", async () => {
    const { store, user } = renderTable(
      withChoiceInASentence(
        '{isYou, select, true {Your siblings} other {Siblings of {name}}}',
      ),
    );
    expect(messageCell('English')).toHaveAccessibleDescription(/Your siblings/);

    await user.click(messageCell('English'));
    await user.click(await editedText('English'));
    await user.keyboard('{Control>}a{/Control}{Backspace}');
    await leaveCell(user, 'English');

    await waitFor(() =>
      expect(messageCell('English')).toHaveAccessibleDescription(
        /Add your biological brothers and sisters, or say you have none/,
      ),
    );
    expect(
      screen.queryByText(/This is the only translation/),
    ).not.toBeInTheDocument();

    await save(user);
    expect(listItem(store)).toBeUndefined();
  });

  const FOLDED_CHOICE =
    '{isYou, select, true {Your brothers and sisters} other {Brothers and sisters of {name}{isYou, select, true { now} other { later}}}}';
  // The folded choice has a version that is nothing but another choice, so a
  // hidden row inside it is listed open.
  const FOLDED_CHOICE_OF_A_CHOICE =
    '{isYou, select, true {Your brothers and sisters} other {Brothers and sisters of {name}{isYou, select, true {{isYou, select, true { now} other { soon}}} other { later}}}}';

  /** Puts the caret at the start or end of `row`, as the cell reads it. */
  const placeCaret = (row: HTMLElement, at: 'start' | 'end') => {
    // Tiptap keeps each editor on the element it draws.
    const { editor } = row as HTMLElement & {
      editor?: {
        commands: { setTextSelection: (position: number) => boolean };
        state: { doc: { content: { size: number } } };
      };
    };
    if (!editor) throw new Error('The row has no editor.');
    row.focus();
    editor.commands.setTextSelection(
      at === 'start' ? 1 : editor.state.doc.content.size - 1,
    );
  };

  it.each([
    ['a folded choice among its words', FOLDED_CHOICE],
    ['a folded choice with a choice for a version', FOLDED_CHOICE_OF_A_CHOICE],
  ])(
    'moves on to the next cell from the last visible version, with %s',
    async (_name, message) => {
      const { user } = renderTable(withChoiceInASentence(message));

      const cell = messageCell('English').closest('td');
      await user.click(messageCell('English'));
      await editedText('English');
      const lastVisible = await screen.findByRole('textbox', {
        name: 'About someone else',
      });
      // The folded choice's rows are mounted, hidden, in that last version.
      expect(
        screen.getAllByRole('textbox', {
          name: /^About someone else, /,
          hidden: true,
        }).length,
      ).toBeGreaterThanOrEqual(2);

      placeCaret(lastVisible, 'end');
      await user.keyboard('{ArrowDown}');

      // The key goes on to the next cell, not up to the first version or
      // into a hidden row.
      await waitFor(() =>
        expect(cell?.contains(document.activeElement)).toBe(false),
      );
      expect(document.activeElement?.closest('td')).not.toBe(null);
    },
  );

  it('moves on to the cell above from the first version, and not down into a hidden row', async () => {
    const { user } = renderTable(
      withChoiceInASentence(FOLDED_CHOICE_OF_A_CHOICE),
    );

    const cell = messageCell('English').closest('td');
    await user.click(messageCell('English'));
    await editedText('English');
    const firstVisible = await screen.findByRole('textbox', {
      name: 'About the participant',
    });

    placeCaret(firstVisible, 'start');
    await user.keyboard('{ArrowUp}');

    await waitFor(() =>
      expect(cell?.contains(document.activeElement)).toBe(false),
    );
  });

  const CHOICE_IN_THE_FIRST_VERSION =
    '{isYou, select, true {Your brothers and sisters{isYou, select, true { now} other { later}}} other {Brothers and sisters of {name}}}';

  /** Opens the choice among the words of `row`, and gives its two rows. */
  const openInlineChoice = async (
    user: ReturnType<typeof renderTable>['user'],
    row: HTMLElement,
    inside: RegExp,
  ) => {
    await user.click(
      within(row).getByRole('button', { name: 'Participant or someone else' }),
    );
    const rows = await screen.findAllByRole('textbox', { name: inside });
    const [first, last] = rows;
    if (rows.length !== 2 || !first || !last)
      throw new Error('The opened choice has two rows.');
    return { first, last };
  };

  it('steps from the last row of an inline choice opened in an earlier version to the version below', async () => {
    const { user } = renderTable(
      withChoiceInASentence(CHOICE_IN_THE_FIRST_VERSION),
    );

    await user.click(messageCell('English'));
    await editedText('English');
    const firstVersion = await screen.findByRole('textbox', {
      name: 'About the participant',
    });
    const { last } = await openInlineChoice(
      user,
      firstVersion,
      /^About the participant, /,
    );
    const below = screen.getByRole('textbox', { name: 'About someone else' });

    // The opened choice is drawn among the rows, so the key walks out of it
    // to the version below instead of staying in the cell.
    placeCaret(last, 'end');
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(below).toHaveFocus());
  });

  it('moves on to the next cell from the last row of an inline choice opened in the last version', async () => {
    const { user } = renderTable(withChoiceInASentence(FOLDED_CHOICE));

    const cell = messageCell('English').closest('td');
    await user.click(messageCell('English'));
    await editedText('English');
    const lastVersion = await screen.findByRole('textbox', {
      name: 'About someone else',
    });
    const { first, last } = await openInlineChoice(
      user,
      lastVersion,
      /^About someone else, /,
    );

    // Down through the opened choice, then out of the cell.
    placeCaret(first, 'end');
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(last).toHaveFocus());
    placeCaret(last, 'end');
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(cell?.contains(document.activeElement)).toBe(false),
    );
  });

  it('moves on to the cell above from the first version, with an inline choice opened below it', async () => {
    const { user } = renderTable(withChoiceInASentence(FOLDED_CHOICE));

    const cell = messageCell('English').closest('td');
    await user.click(messageCell('English'));
    await editedText('English');
    const lastVersion = await screen.findByRole('textbox', {
      name: 'About someone else',
    });
    await openInlineChoice(user, lastVersion, /^About someone else, /);
    const firstVersion = screen.getByRole('textbox', {
      name: 'About the participant',
    });

    placeCaret(firstVersion, 'start');
    await user.keyboard('{ArrowUp}');
    await waitFor(() =>
      expect(cell?.contains(document.activeElement)).toBe(false),
    );
  });
});
