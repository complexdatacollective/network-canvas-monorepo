import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withMod } from '@codaco/fresco-ui/testing/modKey';
import { fieldBlockMarkdown } from '@codaco/protocol-validation';

import {
  fixtureVariableId,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId } from '../../../testing/testId.ts';
import FormDocumentSection from '../FormDocumentSection.tsx';
import {
  attributeRow,
  blockFor,
  caretAtEndOfFirstParagraph,
  caretInQuestion,
  chooseIn,
  editIn,
  fieldSettings,
  formEditor,
  newFieldPicker,
  selectField,
} from './formDocumentTesting.ts';

const RELATIONSHIP = fixtureVariableId(
  { entity: 'node', typeName: 'person' },
  'relationship_to_ego',
);
const AGE = fixtureVariableId({ entity: 'node', typeName: 'person' }, 'age');
const NAME = fixtureVariableId({ entity: 'node', typeName: 'person' }, 'name');

const FIXTURE = loadFixtureStage('alter-form-1');
const RELATIONSHIP_FIELD = testId('field/relationship');
const AGE_FIELD = testId('field/age');

const BILINGUAL = {
  defaultLocale: 'en-US',
  locales: ['en-US', 'es'],
} as const;

/**
 * A form written in English only. Spanish has no document of its own, so it
 * shows the English fields, and their Spanish questions were written in the
 * translation table: they are kept only in the form's fields (`form.fields`).
 */
const ENGLISH_ONLY = {
  content: {
    'en-US': `Intro\n\n${fieldBlockMarkdown(RELATIONSHIP_FIELD)}\n\n${fieldBlockMarkdown(AGE_FIELD)}`,
  },
  fields: [
    {
      id: RELATIONSHIP_FIELD,
      variable: RELATIONSHIP,
      prompt: { 'en-US': 'How do you know them?', 'es': '¿De qué lo conoces?' },
    },
    {
      id: AGE_FIELD,
      variable: AGE,
      prompt: { 'en-US': 'How old are they?', 'es': '¿Cuántos años tiene?' },
      hint: { 'en-US': 'In years.', 'es': 'En años.' },
    },
  ],
};

const openForm = async (
  form: Readonly<Record<string, unknown>> = ENGLISH_ONLY,
) => {
  const harness = renderStageEditor({
    stage: { ...FIXTURE, fields: { ...FIXTURE.fields, form } },
    sections: <FormDocumentSection subject="node" />,
    localization: BILINGUAL,
  });
  await harness.opened();
  const editor = await formEditor();
  return { harness, editor };
};

type SavedForm = Readonly<{
  content: Readonly<Record<string, string>>;
  fields: readonly Readonly<Record<string, unknown>>[];
}>;

const savedFormOf = (
  saved: Awaited<
    ReturnType<Awaited<ReturnType<typeof openForm>>['harness']['submit']>
  >,
) => saved?.stageDocument.form as SavedForm | undefined;

/** The saved form's fields, which the reviewer's scenarios must not change. */
const expectFieldsKept = (form: SavedForm | undefined) => {
  expect(form?.content).toEqual(ENGLISH_ONLY.content);
  expect(form?.fields).toEqual(ENGLISH_ONLY.fields);
};

/**
 * Starts a new step of the editor's history, as a pause does: ProseMirror
 * puts the edits made within half a second of each other in one step, and
 * a test runs faster than a researcher types.
 */
const pause = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 1000);
};

afterEach(() => {
  vi.useRealTimers();
});

describe('a field that leaves the form and comes back', () => {
  it('keeps its questions in other languages when it is deleted and the deletion is undone', async () => {
    const { harness, editor } = await openForm();

    pause();
    await selectField(harness, editor, AGE_FIELD);
    const settings = await fieldSettings();
    await harness.user.click(
      settings.getByRole('button', { name: 'Delete field' }),
    );
    await waitFor(() =>
      expect(editor.querySelector(`[data-field-id="${AGE_FIELD}"]`)).toBeNull(),
    );

    await harness.user.keyboard(withMod('z'));
    await waitFor(() => expect(blockFor(editor, AGE_FIELD)).toBeTruthy());

    expectFieldsKept(savedFormOf(await harness.submit()));
  });

  it('keeps its questions in other languages when it is cut and pasted', async () => {
    const { harness, editor } = await openForm();

    await selectField(harness, editor, AGE_FIELD);
    const clipboard = await harness.user.cut();
    await waitFor(() =>
      expect(editor.querySelector(`[data-field-id="${AGE_FIELD}"]`)).toBeNull(),
    );
    // Pasted after the text at the top of the form.
    await caretAtEndOfFirstParagraph(harness, editor);
    await harness.user.paste(clipboard);
    await waitFor(() => expect(blockFor(editor, AGE_FIELD)).toBeTruthy());

    const form = savedFormOf(await harness.submit());
    expect(form?.fields).toEqual(ENGLISH_ONLY.fields);
  });

  it('keeps every Spanish question when a field is put in the empty Spanish form and taken out again', async () => {
    const { harness } = await openForm();
    await editIn(harness, /español/);

    await newFieldPicker(harness);
    await harness.user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Attribute of the new field' }),
      ).toBeNull(),
    );
    const editor = await formEditor();
    expect(editor.querySelector('[data-field-id]')).toBeNull();

    expectFieldsKept(savedFormOf(await harness.submit()));
  });

  it('keeps every Spanish question while text is typed in the empty Spanish form', async () => {
    const { harness } = await openForm();
    await editIn(harness, /español/);
    const editor = await formEditor();

    await harness.user.click(editor);
    pause();
    await harness.user.keyboard('x');
    await waitFor(() => expect(editor).toHaveTextContent('x'));
    // Undone, as jsdom does not delete what is typed with Backspace.
    pause();
    await harness.user.keyboard(withMod('z'));
    await waitFor(() => expect(editor).not.toHaveTextContent('x'));

    expectFieldsKept(savedFormOf(await harness.submit()));
  });

  it('brings back its question in this language when its attribute is chosen again', async () => {
    const { harness, editor } = await openForm({
      content: {
        'en-US': ENGLISH_ONLY.content['en-US'],
        'es': fieldBlockMarkdown(RELATIONSHIP_FIELD),
      },
      fields: ENGLISH_ONLY.fields,
    });
    await editIn(harness, /español/);
    const spanish = await formEditor();
    expect(spanish).not.toBe(editor);

    const picker = await newFieldPicker(harness);
    await harness.user.click(
      within(picker).getByRole('option', { name: /^age/ }),
    );

    // The block is the form's age field, with its Spanish question and hint.
    await waitFor(() => {
      const age = blockFor(spanish, AGE_FIELD);
      expect(age.querySelector('[data-field-label]')).toHaveTextContent(
        '¿Cuántos años tiene?',
      );
      expect(age.querySelector('[data-field-hint]')).toHaveTextContent(
        'En años.',
      );
    });
    const form = savedFormOf(await harness.submit());
    expect(form?.fields).toEqual(ENGLISH_ONLY.fields);
  });

  it('is left out of the saved form once no language shows it, with its translations', async () => {
    const { harness, editor } = await openForm();

    await selectField(harness, editor, AGE_FIELD);
    await harness.user.click(
      (await fieldSettings()).getByRole('button', { name: 'Delete field' }),
    );
    await waitFor(() =>
      expect(editor.querySelector(`[data-field-id="${AGE_FIELD}"]`)).toBeNull(),
    );

    const form = savedFormOf(await harness.submit());
    expect(form?.fields).toEqual([ENGLISH_ONLY.fields[0]]);
  });
});

describe('a field that is being put in', () => {
  it('is not refused while its attribute is chosen and its question typed', async () => {
    const { harness, editor: form } = await openForm();
    // The form has already been left once, so a change is judged at once.
    await harness.user.click(form);
    await harness.user.click(
      screen.getByRole('textbox', { name: /Stage name/ }),
    );

    const picker = await newFieldPicker(harness);
    expect(
      screen.queryByText('Choose an attribute for this field.'),
    ).toBeNull();

    const fieldId = picker.getAttribute('data-field-insert-picker') ?? '';
    await harness.user.click(await attributeRow('name'));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Attribute of the new field' }),
      ).toBeNull(),
    );
    const editor = await formEditor();
    expect(blockFor(editor, fieldId)).toBeTruthy();
    expect(screen.queryByText('Type the question of each field.')).toBeNull();
    expect(
      screen.queryByText('Choose an attribute for this field.'),
    ).toBeNull();
  });

  it('is refused once the researcher leaves the form without a question', async () => {
    const { harness } = await openForm();
    // The caret is in the new field's question once its attribute is chosen.
    await chooseIn(harness, await newFieldPicker(harness), NAME);
    expect(screen.queryByText('Type the question of each field.')).toBeNull();

    await harness.user.click(
      screen.getByRole('textbox', { name: /Stage name/ }),
    );

    expect(
      await screen.findByText('Type the question of each field.'),
    ).toBeInTheDocument();
  });

  it('is not refused while the researcher answers a dialog that the form opened', async () => {
    const { harness } = await openForm();
    await chooseIn(harness, await newFieldPicker(harness), NAME);

    // A confirmation opened through \`useDialog\` is drawn outside the form.
    const dialog = document.createElement('div');
    dialog.setAttribute('data-form-document-popup', '');
    const confirm = document.createElement('button');
    dialog.append(confirm);
    document.body.append(dialog);
    try {
      act(() => confirm.focus());
      // Leaving is settled a task later.
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(screen.queryByText('Type the question of each field.')).toBeNull();

      // The dialog closes, giving the keyboard back to the form; focus that
      // then leaves for anything else has left the form.
      await harness.user.click(await formEditor());
      await harness.user.click(
        screen.getByRole('textbox', { name: /Stage name/ }),
      );
      expect(
        await screen.findByText('Type the question of each field.'),
      ).toBeInTheDocument();
    } finally {
      dialog.remove();
    }
  });

  it('is refused by a save, which selects it', async () => {
    const { harness } = await openForm();
    const picker = await newFieldPicker(harness);
    const fieldId = picker.getAttribute('data-field-insert-picker') ?? '';
    await harness.user.click(await attributeRow('name'));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Attribute of the new field' }),
      ).toBeNull(),
    );

    expect(await harness.submit()).toBeNull();

    expect(
      await screen.findByText('Type the question of each field.'),
    ).toBeInTheDocument();
    const editor = await formEditor();
    await waitFor(() =>
      expect(blockFor(editor, fieldId)).toHaveAttribute('data-selected'),
    );
  });
});

describe('a problem in the form in another language', () => {
  const SPANISH_ONLY_FIELD = testId('field/spanish');
  const form = {
    content: {
      'en-US': fieldBlockMarkdown(RELATIONSHIP_FIELD),
      'es': `${fieldBlockMarkdown(RELATIONSHIP_FIELD)}\n\n${fieldBlockMarkdown(SPANISH_ONLY_FIELD)}`,
    },
    fields: [
      ENGLISH_ONLY.fields[0],
      { id: SPANISH_ONLY_FIELD, variable: AGE, prompt: { 'en-US': 'Age?' } },
    ],
  };

  const NAMED = 'Type the question of the field “age” in español.';
  const editingLanguage = () =>
    screen.getAllByRole('button', { name: /Editing language/ })[0];

  it('names the language and the field beside the form being edited', async () => {
    const { harness, editor } = await openForm(form);

    // A change to the English form, and then the researcher leaves it.
    await caretInQuestion(harness, editor, RELATIONSHIP_FIELD, 3);
    await harness.user.keyboard('!');
    await harness.user.click(
      screen.getByRole('textbox', { name: /Stage name/ }),
    );

    expect(await screen.findByText(NAMED)).toBeInTheDocument();
    const seam = document.querySelector('[data-field-path="form.fields"]');
    expect(seam?.querySelector('label')).toHaveTextContent('Form in español');
    expect(seam?.closest('[data-field-block]')).toBeNull();
  });

  it('switches the editor to that language and selects the field when a save is refused', async () => {
    const { harness } = await openForm(form);

    expect(await harness.submit()).toBeNull();

    await waitFor(() => expect(editingLanguage()).toHaveTextContent(/español/));
    const spanish = await formEditor();
    await waitFor(() =>
      expect(blockFor(spanish, SPANISH_ONLY_FIELD)).toHaveAttribute(
        'data-selected',
      ),
    );
    // Said in plain words beside the field, now that it is on screen.
    expect(
      await screen.findByText('Type the question of each field.'),
    ).toBeInTheDocument();
  });

  it('switches the editor to that language when the problem is chosen in the list of problems', async () => {
    const { harness } = await openForm(form);
    expect(await harness.submit()).toBeNull();
    await waitFor(() => expect(editingLanguage()).toHaveTextContent(/español/));
    await editIn(harness, /English/);
    expect(await screen.findByText(NAMED)).toBeInTheDocument();

    // As the list of problems does: focus goes to what answers for the
    // form's fields.
    const seam = document.querySelector<HTMLElement>(
      '[data-field-path="form.fields"]',
    );
    act(() => {
      seam?.setAttribute('tabindex', '-1');
      seam?.focus();
    });

    await waitFor(() => expect(editingLanguage()).toHaveTextContent(/español/));
    const spanish = await formEditor();
    await waitFor(() =>
      expect(blockFor(spanish, SPANISH_ONLY_FIELD)).toHaveAttribute(
        'data-selected',
      ),
    );
  });
});

describe('a field whose attribute was deleted from the codebook', () => {
  const MISSING_FIELD = testId('field/missing');
  const form = {
    content: {
      'en-US': `${fieldBlockMarkdown(RELATIONSHIP_FIELD)}\n\n${fieldBlockMarkdown(MISSING_FIELD)}`,
    },
    fields: [
      ENGLISH_ONLY.fields[0],
      {
        id: MISSING_FIELD,
        variable: testId('variable/deleted'),
        prompt: { 'en-US': 'Where do they live?' },
      },
    ],
  };

  it('is refused by a save', async () => {
    const { harness } = await openForm(form);

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Choose an attribute for this field.'),
    ).toBeInTheDocument();
  });

  it('opens the attribute list when it is selected, and takes the attribute chosen there', async () => {
    const { harness, editor } = await openForm(form);

    await caretInQuestion(harness, editor, MISSING_FIELD);
    await harness.user.keyboard('{Escape}');
    await waitFor(() =>
      expect(blockFor(editor, MISSING_FIELD)).toHaveAttribute('data-selected'),
    );
    await harness.user.keyboard('{Enter}');

    const picker = await screen.findByRole('dialog', {
      name: 'Attribute of the field',
    });
    await harness.user.click(
      within(picker).getByRole('option', { name: /^age/ }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Attribute of the field' }),
      ).toBeNull(),
    );

    const saved = savedFormOf(await harness.submit());
    expect(saved?.fields[1]).toEqual({
      id: MISSING_FIELD,
      variable: AGE,
      prompt: { 'en-US': 'Where do they live?' },
    });
  });

  it('stays when its attribute list is dismissed', async () => {
    const { harness, editor } = await openForm({
      ...form,
      fields: [
        ENGLISH_ONLY.fields[0],
        { id: MISSING_FIELD, variable: testId('variable/deleted') },
      ],
    });

    await harness.user.click(
      within(blockFor(editor, MISSING_FIELD)).getByRole('button', {
        name: /Deleted attribute/,
      }),
    );
    await screen.findByRole('dialog', { name: 'Attribute of the field' });
    await harness.user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Attribute of the field' }),
      ).toBeNull(),
    );

    expect(blockFor(editor, MISSING_FIELD)).toBeTruthy();
  });
});
