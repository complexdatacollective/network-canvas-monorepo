import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  testId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  dynamicValueNameFor,
  fieldBlockMarkdown,
  printContentDocument,
} from '@codaco/protocol-validation';
import { timelineActions } from '~/ducks/middleware/timeline';
import { getProtocol } from '~/selectors/protocol';

import {
  type RenderedTable,
  renderTranslationTable,
} from './renderTranslationTable';

const NAME_FIELD = 'field-name';
const AGE_FIELD = 'field-age';

/**
 * An Ego Form in English and Spanish whose Spanish document leaves out the
 * age field: its question is not used in Spanish.
 */
const protocol = {
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'es'] },
  assetManifest: {},
  codebook: {
    node: {},
    edge: {},
    ego: {
      variables: {
        name: { name: 'name', type: 'text', component: 'Text' },
        age: { name: 'age', type: 'number', component: 'Number' },
      },
    },
  },
  stages: [
    {
      id: 'about',
      type: 'EgoForm',
      label: { en: 'About you', es: 'Sobre usted' },
      form: {
        content: {
          en: [
            '# Your details',
            fieldBlockMarkdown(NAME_FIELD),
            fieldBlockMarkdown(AGE_FIELD),
          ].join('\n\n'),
          es: ['# Sus datos', fieldBlockMarkdown(NAME_FIELD)].join('\n\n'),
        },
        fields: [
          {
            id: NAME_FIELD,
            variable: 'name',
            prompt: { en: 'What is your name?', es: '¿Cómo se llama?' },
          },
          {
            id: AGE_FIELD,
            variable: 'age',
            prompt: { en: 'How old are you?' },
          },
        ],
      },
    },
  ],
} as unknown as CurrentProtocol;

const SMOKES = testVariableId('smokes');
const SMOKES_NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: SMOKES,
});
const SMOKING_WORDING = testId('smoking-wording');
const SMOKING_WORDING_NAME = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: SMOKING_WORDING,
});

/**
 * The form above, whose English text also has a logic block and a dynamic
 * attribute, each on an attribute that an earlier stage asked for.
 */
const protocolWithLogic = (() => {
  const [stage] = protocol.stages;
  if (stage?.type !== 'EgoForm') throw new Error('The stage is a form.');
  return {
    ...protocol,
    codebook: {
      ...protocol.codebook,
      ego: {
        variables: {
          ...protocol.codebook.ego?.variables,
          [SMOKES]: { name: 'smokes', type: 'boolean', component: 'Boolean' },
        },
      },
    },
    stages: [
      {
        ...stage,
        dynamicAttributes: {
          [SMOKING_WORDING]: {
            logic: 'answers',
            value: SMOKES_NAME,
            missing: { en: 'you' },
            answers: [
              { answer: 'true', wording: { en: 'a smoker' } },
              { answer: 'false', wording: { en: 'a non-smoker' } },
            ],
            other: { en: 'you' },
          },
        },
        form: {
          ...stage.form,
          content: {
            ...stage.form.content,
            en: [
              `# Your details, {${SMOKING_WORDING_NAME}}`,
              fieldBlockMarkdown(NAME_FIELD),
              printContentDocument([
                {
                  kind: 'logic',
                  logic: {
                    kind: 'answers',
                    value: SMOKES_NAME,
                    missing: [],
                    versions: [
                      {
                        caseKey: 'true',
                        content: [{ kind: 'field', fieldId: AGE_FIELD }],
                      },
                    ],
                    other: [],
                  },
                },
              ]),
            ].join('\n\n'),
          },
        },
      },
    ],
  } as unknown as CurrentProtocol;
})();

const DRINKS = testVariableId('drinks');
const DRINKS_NAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: DRINKS,
});

/** The form above, with a second yes-or-no attribute its logic can read. */
const withDrinking = {
  ...protocolWithLogic,
  codebook: {
    ...protocolWithLogic.codebook,
    ego: {
      variables: {
        ...protocolWithLogic.codebook.ego?.variables,
        [DRINKS]: { name: 'drinks', type: 'boolean', component: 'Boolean' },
      },
    },
  },
} as unknown as CurrentProtocol;

const renderTable = (initial: CurrentProtocol = protocol) =>
  renderTranslationTable(initial);

type Rendered = RenderedTable;

/** The form as the protocol has it now. */
const formOf = (store: Rendered['store']) => {
  const stage = getProtocol(store.getState())?.stages[0];
  return stage?.type === 'EgoForm' ? stage.form : undefined;
};

/** The cell of the form's text in `language`, opened for editing. */
const openFormText = async (user: Rendered['user'], language: string) => {
  const name = new RegExp(`Form ${language}$`);
  await user.click(screen.getByRole('button', { name }));
  const editor = await screen.findByRole('textbox', { name });
  await waitFor(() => expect(editor).toHaveFocus());
  return editor;
};

/** The block of the field `fieldId` in the editor. */
const blockIn = (editor: HTMLElement, fieldId: string): HTMLElement => {
  const frame = editor.querySelector<HTMLElement>(
    `[data-field-id="${fieldId}"]`,
  );
  if (frame === null) throw new Error(`The text has no field "${fieldId}".`);
  return frame;
};

/** The cell of the form's text in `locale`, open or not. */
const formCell = (locale: string) => {
  const cell = document.querySelector<HTMLElement>(
    `td[data-form-text][lang="${locale}"]`,
  );
  if (cell === null) throw new Error(`No cell has the form in ${locale}.`);
  return cell;
};

/** Whether `cell` is marked as changed and unsaved. */
const isMarkedUnsaved = (cell: HTMLElement) =>
  cell.querySelector('[data-unsaved-mark]') !== null;

/**
 * Clicks the pill of a value in an editor. ProseMirror asks where the click
 * landed, which jsdom cannot say.
 */
const clickPill = async (user: Rendered['user'], pill: HTMLElement) => {
  const original = document.elementFromPoint.bind(document);
  const target = pill.querySelector('data') ?? pill;
  document.elementFromPoint = () => target;
  try {
    await user.click(target);
  } finally {
    document.elementFromPoint = original;
  }
};

/** Opens the popover of the dynamic attribute on smoking in `editor`. */
const openDynamicAttribute = async (
  user: Rendered['user'],
  editor: HTMLElement,
) => {
  const pill = await waitFor(() => {
    const found = editor.querySelector<HTMLElement>(
      `[data-inline-value="${SMOKING_WORDING_NAME}"]`,
    );
    if (found === null) throw new Error('The text shows no pill.');
    return found;
  });
  await clickPill(user, pill);
  return screen.findByRole('dialog', { name: 'Dynamic attribute' });
};

/**
 * Chooses the attribute whose value name is `valueName` in a dynamic
 * attribute's popover, from the keyboard and with one press on the option.
 */
const chooseAttribute = async (
  user: Rendered['user'],
  popover: HTMLElement,
  valueName: string,
) => {
  const picker = within(popover).getByRole('combobox', { name: /^Attribute/ });
  act(() => picker.focus());
  await user.keyboard('{ArrowDown}');
  const option = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(
      `[role="option"][data-attribute-id="${valueName}"]`,
    );
    if (found === null)
      throw new Error(`The list does not offer ${valueName}.`);
    return found;
  });
  fireEvent.click(option);
};

/** Leaves the cell for the stage name's English cell. */
const leaveCell = async (user: Rendered['user']) => {
  await user.click(
    screen.getByRole('textbox', { name: /Stage name English$/ }),
  );
};

/**
 * Presses Save and waits for it to finish: Save checks the protocol it would
 * write before writing it, which takes a moment.
 */
const save = async (user: Rendered['user']) => {
  const button = screen.getByRole('button', { name: 'Save' });
  await user.click(button);
  await waitFor(() => expect(button).toBeEnabled());
};

/** The table row that `text` is in. */
const rowOf = (text: HTMLElement) => {
  const row = text.closest('tr');
  if (row === null) throw new Error('The text is not in a table row.');
  return row;
};

/** The column heading's count of translated strings, as read aloud. */
const progressOf = (language: string) => {
  const heading = screen.getByRole('columnheader', { name: language });
  const count = within(heading).getByText(/^\d+ of \d+ translated$/);
  const [translated, total] = (count.textContent ?? '')
    .split(' ')
    .filter((word) => /^\d+$/.test(word))
    .map(Number);
  return { translated, total };
};

describe('the translation table for a form whose languages place different fields', () => {
  it('says that a question is not used in a language whose form leaves its field out', () => {
    renderTable();

    const notUsed = screen.getAllByText('Not used in Spanish');
    expect(notUsed).toHaveLength(1);
    const [cell] = notUsed;
    if (cell === undefined) throw new Error('No cell is marked as not used.');
    // The age question's row, whose Spanish cell cannot be opened.
    const row = rowOf(cell);
    expect(within(row).getByText('How old are you?')).toBeInTheDocument();
    expect(within(row).queryAllByRole('button', { name: /Spanish$/ })).toEqual(
      [],
    );
  });

  it('counts only the strings that each language uses', () => {
    renderTable();

    const english = progressOf('English');
    const spanish = progressOf('Spanish');
    // Spanish has everything it uses: the age question is not counted.
    expect(spanish.translated).toBe(spanish.total);
    expect(spanish.total).toBe((english.total ?? 0) - 1);
    expect(english.translated).toBe(english.total);
  });

  it("shows the text of each language's form with its fields' questions, and says where those are translated", () => {
    renderTable();

    const spanishHeading = screen.getByText('Sus datos');
    const row = rowOf(spanishHeading);
    const fieldSummaries = Array.from(
      row.querySelectorAll<HTMLElement>(`[data-field-summary="${NAME_FIELD}"]`),
    );
    // The name field in both languages' text, each in that language.
    expect(fieldSummaries.map((summary) => summary.textContent)).toEqual([
      'What is your name?',
      '¿Cómo se llama?',
    ]);
    expect(row.querySelector(`[data-field-summary="${AGE_FIELD}"]`)).toEqual(
      expect.objectContaining({ textContent: 'How old are you?' }),
    );
    expect(
      within(row).getAllByText(
        'The question and hint of each field are translated in their own rows.',
      ),
    ).toHaveLength(2);
    // Each language's text opens for editing.
    expect(
      within(row).getAllByRole('button', { name: /(English|Spanish)$/ }),
    ).toHaveLength(2);
  });
});

describe('moving between the cells of the translation table', () => {
  it('passes over a row whose shown cells are all not used, with the default language hidden', async () => {
    const { user } = renderTable({
      ...protocol,
      stages: [
        ...protocol.stages,
        {
          id: 'thanks',
          type: 'Information',
          label: { en: 'Thanks', es: 'Gracias' },
          content: { en: 'Goodbye', es: 'Adiós' },
        },
      ],
    } as unknown as CurrentProtocol);
    await user.click(screen.getByRole('button', { name: /^Languages/ }));
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'English' }),
    );
    await user.keyboard('{Escape}');
    // The age question, which Spanish does not use, is the row above the
    // next stage's name.
    expect(screen.getByText('Not used in Spanish')).toBeVisible();

    const stageName = screen.getByRole<HTMLTextAreaElement>('textbox', {
      name: /Stage 2 .*Stage name Spanish$/,
    });
    await user.click(stageName);
    stageName.setSelectionRange(0, 0);
    await user.keyboard('{ArrowUp}');

    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: /name › Question Spanish$/ }),
      ).toHaveFocus(),
    );
  });
});

describe('editing the text of a form in the translation table', () => {
  it('shows each field with its question in the language, which is not typed there, and no settings', async () => {
    const { user } = renderTable();

    const editor = await openFormText(user, 'Spanish');

    const name = blockIn(editor, NAME_FIELD);
    expect(name.querySelector('[data-field-question]')?.textContent).toBe(
      '¿Cómo se llama?',
    );
    // The question is translated in its own row.
    expect(
      name.querySelector('[data-field-question] [contenteditable="true"]'),
    ).toBeNull();
    expect(
      within(name).queryByRole('button', { name: 'Field settings' }),
    ).not.toBeInTheDocument();
  });

  it("puts in only the form's own fields, dimming those that this language's text already contains", async () => {
    const { store, user } = renderTable();
    const editor = await openFormText(user, 'Spanish');

    await user.click(screen.getByRole('button', { name: 'Field' }));

    const picker = await screen.findByRole('dialog', {
      name: 'Attribute of the new field',
    });
    const rows = within(picker).getAllByRole('option');
    // Listed by name, as the stage editor lists them.
    expect(rows.map((row) => row.dataset.attributeId)).toEqual(['age', 'name']);
    const [age, name] = rows;
    expect(name).toHaveAttribute('aria-disabled', 'true');
    expect(name).toHaveTextContent(
      'This field is already in the form in this language.',
    );
    expect(age).not.toHaveAttribute('aria-disabled', 'true');
    // New attributes are made in the stage editor.
    expect(
      within(picker).queryByRole('button', { name: /Create/ }),
    ).not.toBeInTheDocument();

    if (age === undefined) throw new Error('The list does not offer age.');
    await user.click(age);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // The same field as in English, selected: its question is not typed
    // here, and is now used in Spanish.
    await waitFor(() =>
      expect(blockIn(editor, AGE_FIELD)).toHaveAttribute('data-selected'),
    );
    await leaveCell(user);
    expect(screen.queryByText('Not used in Spanish')).not.toBeInTheDocument();

    await save(user);
    const form = formOf(store);
    expect(form?.content.es).toContain(fieldBlockMarkdown(AGE_FIELD));
    expect(form?.fields.map(({ id }) => id)).toEqual([NAME_FIELD, AGE_FIELD]);
  });

  it("takes a field's question out of a language whose text no longer contains the field", async () => {
    const { store, user } = renderTable();
    const editor = await openFormText(user, 'Spanish');

    const question = blockIn(editor, NAME_FIELD).querySelector<HTMLElement>(
      '[data-field-question]',
    );
    if (question === null) throw new Error('The field shows no question.');
    await user.click(question);
    await waitFor(() =>
      expect(blockIn(editor, NAME_FIELD)).toHaveAttribute('data-selected'),
    );
    await user.keyboard('{Backspace}');
    await waitFor(() =>
      expect(
        editor.querySelector(`[data-field-id="${NAME_FIELD}"]`),
      ).toBeNull(),
    );
    await leaveCell(user);
    await save(user);

    const form = formOf(store);
    expect(form?.content.es).toBe('# Sus datos');
    // Still in the English text, with its English question.
    expect(form?.fields.find(({ id }) => id === NAME_FIELD)?.prompt).toEqual({
      en: 'What is your name?',
    });
  });

  // French has no text of its own, so its participants are shown the
  // English text: a field that the English text no longer contains is not
  // asked in French either.
  it('says that a question is not used in a language shown the text that no longer contains its field', async () => {
    const { user } = renderTable({
      ...protocol,
      localization: { defaultLocale: 'en', locales: ['en', 'es', 'fr'] },
    });
    // The name question's own row, not the rows of the form's text.
    const nameQuestionRow = () => {
      const row = screen
        .getAllByText('What is your name?')
        .map(rowOf)
        .find((each) => each.querySelector('[data-form-text]') === null);
      if (row === undefined) throw new Error('The question has no row.');
      return row;
    };
    expect(
      within(nameQuestionRow()).queryByText('Not used in French'),
    ).not.toBeInTheDocument();

    const editor = await openFormText(user, 'English');
    const question = blockIn(editor, NAME_FIELD).querySelector<HTMLElement>(
      '[data-field-question]',
    );
    if (question === null) throw new Error('The field shows no question.');
    await user.click(question);
    await waitFor(() =>
      expect(blockIn(editor, NAME_FIELD)).toHaveAttribute('data-selected'),
    );
    await user.keyboard('{Backspace}');
    await waitFor(() =>
      expect(
        editor.querySelector(`[data-field-id="${NAME_FIELD}"]`),
      ).toBeNull(),
    );
    await leaveCell(user);

    await waitFor(() =>
      expect(
        within(nameQuestionRow()).getByText('Not used in French'),
      ).toBeInTheDocument(),
    );
  });

  // Emptied, the Spanish text is no translation: Spanish participants are
  // shown the English text, which asks the age question.
  it('says that a question is used in a language once that language falls back to a text that contains its field', async () => {
    const { user } = renderTable();
    // The age question's own row, not the rows of the form's text.
    const ageRow = () => {
      const row = screen
        .getAllByText('How old are you?')
        .map(rowOf)
        .find((each) => each.querySelector('[data-form-text]') === null);
      if (row === undefined) throw new Error('The question has no row.');
      return row;
    };
    expect(within(ageRow()).getByText('Not used in Spanish')).toBeVisible();

    await openFormText(user, 'Spanish');
    await user.keyboard('{Control>}a{/Control}{Delete}');
    await leaveCell(user);

    await waitFor(() =>
      expect(
        within(ageRow()).queryByText('Not used in Spanish'),
      ).not.toBeInTheDocument(),
    );
    // Its Spanish cell opens for editing.
    expect(
      within(ageRow()).getByRole('button', { name: /Spanish$/ }),
    ).toBeInTheDocument();
  });

  it('refuses text that leaves a field out of every language', async () => {
    const { store, user } = renderTable();
    const before = formOf(store);
    const editor = await openFormText(user, 'English');

    // Only the English text contains the age field.
    // A click on the field's question selects the field, which is not
    // typed here.
    const question = blockIn(editor, AGE_FIELD).querySelector<HTMLElement>(
      '[data-field-question]',
    );
    if (question === null) throw new Error('The field shows no question.');
    await user.click(question);
    await waitFor(() =>
      expect(blockIn(editor, AGE_FIELD)).toHaveAttribute('data-selected'),
    );
    await user.keyboard('{Backspace}');
    await waitFor(() =>
      expect(editor.querySelector(`[data-field-id="${AGE_FIELD}"]`)).toBeNull(),
    );
    await leaveCell(user);

    const cell = screen
      .getByRole('button', { name: /Form English$/ })
      .closest('td');
    if (cell === null) throw new Error('The text is not in a cell.');
    expect(
      within(cell).getByText(
        'The form no longer contains the field that collects “age” in any language. Put the field back, or remove it in the stage editor.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // The refusal brings the cell that it refused back into use.
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: /Form English$/ }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(formOf(store)).toEqual(before);
  });

  it('refuses an emptied text that was the only one to contain a field, saying so in its cell', async () => {
    const { store, user } = renderTable();
    const before = formOf(store);
    await openFormText(user, 'English');

    // Only the English text contains the age field.
    await user.keyboard('{Control>}a{/Control}{Delete}');
    await leaveCell(user);

    const message =
      'The form no longer contains the field that collects “age” in any language. Put the field back, or remove it in the stage editor.';
    expect(await within(formCell('en')).findByText(message)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: /Form English$/ }),
      ).toHaveFocus(),
    );
    expect(formOf(store)).toEqual(before);
  });

  it("offers a dynamic attribute's wording in a language as soon as that language's text shows it, before the table is saved", async () => {
    const { user } = renderTable(protocolWithLogic);
    // The row of the wording for smokers, which only the English text shows.
    const smokerRow = () => {
      const [wording] = screen.getAllByText('a smoker');
      if (wording === undefined) throw new Error('No row has the wording.');
      return rowOf(wording);
    };
    expect(within(smokerRow()).getByText('Not used in Spanish')).toBeVisible();

    await openFormText(user, 'English');
    await user.keyboard('{Control>}a{/Control}');
    const copied = await user.copy();
    if (copied === undefined) throw new Error('Nothing was copied.');
    await leaveCell(user);
    const spanish = await openFormText(user, 'Spanish');
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(copied);
    await waitFor(() =>
      expect(
        spanish.querySelector(`[data-inline-value="${SMOKING_WORDING_NAME}"]`),
      ).not.toBeNull(),
    );

    await waitFor(() =>
      expect(
        within(smokerRow()).queryByText('Not used in Spanish'),
      ).not.toBeInTheDocument(),
    );
    // Its Spanish wording can be typed in the row.
    const box = within(smokerRow()).getByRole('textbox', { name: /Spanish$/ });
    await user.type(box, 'un fumador');
    expect(box).toHaveValue('un fumador');
  });

  it("writes a version's wording changed in a dynamic attribute's popover to the version's own row, which Escape there puts back", async () => {
    const { store, user } = renderTable(protocolWithLogic);
    const before = getProtocol(store.getState())?.stages[0];
    const editor = await openFormText(user, 'English');

    const popover = await openDynamicAttribute(user, editor);
    const wording = within(popover)
      .getAllByRole<HTMLInputElement>('textbox')
      .find((box) => box.value === 'a smoker');
    if (wording === undefined) throw new Error('No box has the wording.');
    // Typed a key at a time: each key writes the version's row, and the
    // cell's editor, and the popover in it, stay open while it is written.
    await user.clear(wording);
    await user.type(wording, 'someone who smokes');
    expect(wording).toHaveValue('someone who smokes');
    expect(wording).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Dynamic attribute' }),
      ).not.toBeInTheDocument(),
    );
    await leaveCell(user);

    // The wording is the version's row's, which shows it as unsaved; the
    // text of the form is as it was.
    const [row] = new Set(screen.getAllByText('someone who smokes').map(rowOf));
    if (row === undefined) throw new Error('No row has the wording.');
    const box = within(row).getByRole('textbox', { name: /English$/ });
    const cell = box.closest('td');
    if (cell === null) throw new Error('The wording is not in a cell.');
    expect(isMarkedUnsaved(cell)).toBe(true);
    expect(isMarkedUnsaved(formCell('en'))).toBe(false);

    await user.click(box);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(isMarkedUnsaved(cell)).toBe(false));
    expect(box).toHaveValue('a smoker');
    await save(user);
    expect(getProtocol(store.getState())?.stages[0]).toEqual(before);
  });

  describe("a version's wording changed in a dynamic attribute's popover", () => {
    /**
     * Changes the wording for smokers in the popover of the English text's
     * dynamic attribute, typed a key at a time, and leaves the cell. The
     * version's row's English box, and its cell.
     */
    const changeSmokerWording = async (user: Rendered['user']) => {
      const editor = await openFormText(user, 'English');
      const popover = await openDynamicAttribute(user, editor);
      const wording = within(popover)
        .getAllByRole<HTMLInputElement>('textbox')
        .find((box) => box.value === 'a smoker');
      if (wording === undefined) throw new Error('No box has the wording.');
      await user.clear(wording);
      await user.type(wording, 'someone who smokes');
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Dynamic attribute' }),
        ).not.toBeInTheDocument(),
      );
      await leaveCell(user);
      const [row] = new Set(
        screen.getAllByText('someone who smokes').map(rowOf),
      );
      if (row === undefined) throw new Error('No row has the wording.');
      const box = within(row).getByRole<HTMLTextAreaElement>('textbox', {
        name: /English$/,
      });
      const cell = box.closest('td');
      if (cell === null) throw new Error('The wording is not in a cell.');
      expect(isMarkedUnsaved(cell)).toBe(true);
      return { box, cell };
    };

    /** Presses Escape in the English text of the form. */
    const escapeInFormText = async (user: Rendered['user']) => {
      await openFormText(user, 'English');
      await user.keyboard('{Escape}');
    };

    it('is put back by Escape in the cell the popover was opened from', async () => {
      const { store, user } = renderTable(protocolWithLogic);
      const before = getProtocol(store.getState())?.stages[0];
      const { box, cell } = await changeSmokerWording(user);

      await escapeInFormText(user);

      await waitFor(() => expect(isMarkedUnsaved(cell)).toBe(false));
      expect(box).toHaveValue('a smoker');
      await save(user);
      expect(getProtocol(store.getState())?.stages[0]).toEqual(before);
    });

    it('is put back by Escape in that cell after its language was hidden and shown again', async () => {
      const { user } = renderTable(protocolWithLogic);
      await changeSmokerWording(user);
      const toggleEnglish = async () => {
        await user.click(screen.getByRole('button', { name: /^Languages/ }));
        await user.click(
          await screen.findByRole('menuitemcheckbox', { name: 'English' }),
        );
        await user.keyboard('{Escape}');
      };
      await toggleEnglish();
      expect(
        screen.queryByRole('button', { name: /Form English$/ }),
      ).not.toBeInTheDocument();
      await toggleEnglish();
      expect(screen.getByDisplayValue('someone who smokes')).toBeVisible();

      await escapeInFormText(user);

      await waitFor(() =>
        expect(
          screen.queryByDisplayValue('someone who smokes'),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByDisplayValue('a smoker')).toBeVisible();
    });

    it("keeps what was typed in the version's row afterwards when Escape is pressed in the cell", async () => {
      const { user } = renderTable(protocolWithLogic);
      const { box, cell } = await changeSmokerWording(user);
      await user.clear(box);
      await user.type(box, 'a person who smokes');

      await escapeInFormText(user);
      await leaveCell(user);

      expect(box).toHaveValue('a person who smokes');
      expect(isMarkedUnsaved(cell)).toBe(true);
      await user.click(box);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(isMarkedUnsaved(cell)).toBe(false));
      expect(box).toHaveValue('a smoker');
    });
  });

  describe('a cell whose text and logic both changed', () => {
    const changeTextAndLogic = async (user: Rendered['user']) => {
      const editor = await openFormText(user, 'English');
      await user.paste('Welcome. ');
      await waitFor(() => expect(editor).toHaveTextContent(/Welcome\./));
      const popover = await openDynamicAttribute(user, editor);
      await chooseAttribute(user, popover, DRINKS_NAME);
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Dynamic attribute' }),
        ).not.toBeInTheDocument(),
      );
      await waitFor(() => expect(isMarkedUnsaved(formCell('en'))).toBe(true));
    };

    it('puts back both with Escape in the cell', async () => {
      const { store, user } = renderTable(withDrinking);
      const before = getProtocol(store.getState())?.stages[0];
      await changeTextAndLogic(user);

      // Escape in the cell, whether or not it was left in between.
      const reopened = screen.queryByRole('textbox', { name: /Form English$/ });
      if (reopened === null) await openFormText(user, 'English');
      else reopened.focus();
      await user.keyboard('{Escape}');

      await waitFor(() => expect(isMarkedUnsaved(formCell('en'))).toBe(false));
      await save(user);
      expect(getProtocol(store.getState())?.stages[0]).toEqual(before);
    });

    it('saves both as one change, which one undo takes back', async () => {
      const { store, user } = renderTable(withDrinking);
      const before = getProtocol(store.getState())?.stages[0];
      await changeTextAndLogic(user);
      await leaveCell(user);

      await save(user);
      const saved = getProtocol(store.getState())?.stages[0];
      if (saved?.type !== 'EgoForm') throw new Error('The stage is a form.');
      expect(saved.form.content.en).toContain('Welcome.');
      expect(saved.dynamicAttributes?.[SMOKING_WORDING]).toMatchObject({
        value: DRINKS_NAME,
      });

      act(() => {
        store.dispatch(timelineActions.undo());
      });
      expect(getProtocol(store.getState())?.stages[0]).toEqual(before);
    });
  });

  it('copies the text of one language into another with its fields, logic blocks and dynamic attributes', async () => {
    const { store, user } = renderTable(protocolWithLogic);

    await openFormText(user, 'English');
    await user.keyboard('{Control>}a{/Control}');
    // What the editor puts on the clipboard, as a browser would keep it.
    const copied = await user.copy();
    if (copied === undefined) throw new Error('Nothing was copied.');
    await leaveCell(user);
    const spanish = await openFormText(user, 'Spanish');
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(copied);
    await waitFor(() =>
      expect(blockIn(spanish, NAME_FIELD)).toBeInTheDocument(),
    );
    await leaveCell(user);

    await save(user);
    const form = formOf(store);
    expect(form?.content.es).toBe(form?.content.en);
    expect(form?.content.es).toContain(fieldBlockMarkdown(NAME_FIELD));
    expect(form?.content.es).toContain(fieldBlockMarkdown(AGE_FIELD));
    expect(form?.content.es).toContain(`{${SMOKES_NAME}, select,`);
    expect(form?.content.es).toContain(`{${SMOKING_WORDING_NAME}}`);
  });
});
