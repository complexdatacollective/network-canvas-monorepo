import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fieldBlockMarkdown } from '@codaco/protocol-validation';

import {
  fixtureTypeId,
  fixtureVariableId,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId } from '../../../testing/testId.ts';
import FormDocumentSection from '../FormDocumentSection.tsx';
import {
  blockFor,
  editIn,
  formEditor,
  openFieldSettings,
} from './formDocumentTesting.ts';

const PERSON = fixtureTypeId('node', 'person');
const RELATIONSHIP = fixtureVariableId(
  { entity: 'node', typeName: 'person' },
  'relationship_to_ego',
);
const AGE = fixtureVariableId({ entity: 'node', typeName: 'person' }, 'age');

const FIXTURE = loadFixtureStage('alter-form-1');
const RELATIONSHIP_FIELD = testId('field/relationship');
const AGE_FIELD = testId('field/age');

const BILINGUAL = {
  defaultLocale: 'en-US',
  locales: ['en-US', 'es'],
} as const;

/** The fixture's alter form, with `form` in place of its own. */
const alterFormWith = (form: Readonly<Record<string, unknown>>) => ({
  stage: { ...FIXTURE, fields: { ...FIXTURE.fields, form } },
  sections: <FormDocumentSection subject="node" />,
});

const TWO_FIELDS = [
  {
    id: RELATIONSHIP_FIELD,
    variable: RELATIONSHIP,
    prompt: { 'en-US': 'How do you know them?', 'es': '¿De qué lo conoces?' },
  },
  { id: AGE_FIELD, variable: AGE, prompt: { 'en-US': 'How old are they?' } },
];

const ENGLISH_DOCUMENT = `${fieldBlockMarkdown(RELATIONSHIP_FIELD)}\n\n${fieldBlockMarkdown(AGE_FIELD)}`;

describe('a form that has no field in one language', () => {
  const form = {
    content: { 'en-US': ENGLISH_DOCUMENT, 'es': 'Solo texto.' },
    fields: TWO_FIELDS.map((field) => ({
      ...field,
      prompt: { 'en-US': field.prompt['en-US'] },
    })),
  };

  it('is refused, naming the language, while another language is edited', async () => {
    const harness = renderStageEditor({
      ...alterFormWith(form),
      localization: BILINGUAL,
    });
    await harness.opened();
    await formEditor();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Add at least one field to the form in español.'),
    ).toBeInTheDocument();
  });

  it('is refused in plain words while that language is edited', async () => {
    const harness = renderStageEditor({
      ...alterFormWith(form),
      localization: BILINGUAL,
    });
    await harness.opened();
    await formEditor();
    await editIn(harness, /español/);

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Add at least one field to this form.'),
    ).toBeInTheDocument();
  });
});

describe('the note about fields that differ between languages', () => {
  const form = {
    content: {
      'en-US': ENGLISH_DOCUMENT,
      'es': fieldBlockMarkdown(RELATIONSHIP_FIELD),
    },
    fields: TWO_FIELDS,
  };

  it('says which fields the language being edited leaves out', async () => {
    const harness = renderStageEditor({
      ...alterFormWith(form),
      localization: BILINGUAL,
    });
    await harness.opened();
    await formEditor();
    await editIn(harness, /español/);

    const note = await screen.findByText(/does not include 1 field/);
    expect(note).toHaveTextContent(
      'The español form does not include 1 field that the American English form contains: age.',
    );
    // Information, never a problem: the form saves as it is.
    expect(await harness.submit()).not.toBeNull();
  });

  it('lists the attributes as a list, under the menu of the language that it compares', async () => {
    const NAME = fixtureVariableId(
      { entity: 'node', typeName: 'person' },
      'name',
    );
    const NAME_FIELD = testId('field/name');
    const harness = renderStageEditor({
      ...alterFormWith({
        content: {
          'en-US': `${ENGLISH_DOCUMENT}\n\n${fieldBlockMarkdown(NAME_FIELD)}`,
          'es': fieldBlockMarkdown(RELATIONSHIP_FIELD),
        },
        fields: [
          ...TWO_FIELDS,
          { id: NAME_FIELD, variable: NAME, prompt: { 'en-US': 'Name?' } },
        ],
      }),
      localization: BILINGUAL,
    });
    await harness.opened();
    await formEditor();
    await editIn(harness, /español/);

    const note = await screen.findByText(/does not include 2 fields/);
    expect(note).toHaveTextContent(
      'The español form does not include 2 fields that the American English form contains: age and name.',
    );
    const menus = screen.getAllByRole('button', { name: /Editing language/ });
    const formMenu = menus.at(-1);
    expect(
      (formMenu?.compareDocumentPosition(note) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('is not shown in the default language', async () => {
    const harness = renderStageEditor({
      ...alterFormWith(form),
      localization: BILINGUAL,
    });
    await harness.opened();
    await formEditor();

    expect(screen.queryByText(/does not include/)).toBeNull();
  });
});

describe('saving the form', () => {
  it('refuses a field that has no attribute', async () => {
    const harness = renderStageEditor(
      alterFormWith({
        content: {
          'en-US': `${ENGLISH_DOCUMENT}\n\n${fieldBlockMarkdown(testId('x'))}`,
        },
        fields: [
          ...TWO_FIELDS,
          { id: testId('x'), variable: '', prompt: { 'en-US': 'Where?' } },
        ],
      }),
    );
    await harness.opened();
    await formEditor();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Choose an attribute for this field.'),
    ).toBeInTheDocument();
  });

  it('refuses a field placed without a question in that language', async () => {
    const harness = renderStageEditor(
      alterFormWith({
        content: { 'en-US': ENGLISH_DOCUMENT },
        fields: [
          TWO_FIELDS[0],
          { id: AGE_FIELD, variable: AGE, prompt: { es: '¿Cuántos años?' } },
        ],
      }),
    );
    await harness.opened();
    await formEditor();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Type the question of each field.'),
    ).toBeInTheDocument();
  });

  it('names the field that has a problem, and selects it', async () => {
    const harness = renderStageEditor(
      alterFormWith({
        content: { 'en-US': ENGLISH_DOCUMENT },
        fields: [
          TWO_FIELDS[0],
          { id: AGE_FIELD, variable: AGE, prompt: { es: '¿Cuántos años?' } },
        ],
      }),
    );
    await harness.opened();
    const editor = await formEditor();

    expect(await harness.submit()).toBeNull();

    // The list of problems finds the form's fields at this field, and names
    // the field by its attribute.
    const age = blockFor(editor, AGE_FIELD);
    await waitFor(() =>
      expect(
        age.querySelector('[data-field-path="form.fields"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelectorAll('[data-field-path="form.fields"]'),
    ).toHaveLength(1);
    expect(age.querySelector('label')).toHaveTextContent('Field “age”');
    // And the refused save selects it.
    await waitFor(() => {
      expect(editor).toHaveFocus();
      expect(age).toHaveAttribute('data-selected');
    });
  });

  it('selects the field that the refusal names when an earlier field has another problem', async () => {
    const UNCHOSEN = testId('field/unchosen');
    const harness = renderStageEditor(
      alterFormWith({
        // The age field, first, has no question; the last has no attribute,
        // which the refusal names first.
        content: {
          'en-US': `${ENGLISH_DOCUMENT}\n\n${fieldBlockMarkdown(UNCHOSEN)}`,
        },
        fields: [
          TWO_FIELDS[0],
          { id: AGE_FIELD, variable: AGE, prompt: { es: '¿Cuántos años?' } },
          { id: UNCHOSEN, variable: '', prompt: { 'en-US': 'Where?' } },
        ],
      }),
    );
    await harness.opened();
    const editor = await formEditor();

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Choose an attribute for this field.'),
    ).toBeInTheDocument();

    const unchosen = blockFor(editor, UNCHOSEN);
    await waitFor(() =>
      expect(
        unchosen.querySelector('[data-field-path="form.fields"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelectorAll('[data-field-path="form.fields"]'),
    ).toHaveLength(1);
  });

  it('discards the attribute changes made in the form when the stage is cancelled', async () => {
    const harness = renderStageEditor(
      alterFormWith({
        content: { 'en-US': ENGLISH_DOCUMENT },
        fields: TWO_FIELDS.map((field) => ({
          ...field,
          prompt: { 'en-US': field.prompt['en-US'] },
        })),
      }),
    );
    await harness.opened();
    const editor = await formEditor();
    const componentOf = (
      codebook: ReturnType<typeof harness.hostCodebook>,
    ): unknown => {
      const variable: unknown =
        codebook.node?.[PERSON]?.variables?.[RELATIONSHIP];
      return typeof variable === 'object' && variable !== null
        ? Reflect.get(variable, 'component')
        : undefined;
    };
    const before = componentOf(harness.hostCodebook());

    const settings = await openFieldSettings(
      harness,
      editor,
      RELATIONSHIP_FIELD,
    );
    await harness.user.click(
      settings.getByRole('combobox', { name: 'Input control' }),
    );
    await harness.user.click(
      await screen.findByRole('option', { name: /Text Area/ }),
    );
    await waitFor(() =>
      expect(componentOf(harness.editorCodebook())).toBe('TextArea'),
    );
    // Kept with the stage, not yet written to the protocol.
    expect(componentOf(harness.hostCodebook())).toBe(before);

    await harness.cancel();

    expect(componentOf(harness.hostCodebook())).toBe(before);
    expect(
      within(document.body).queryByRole('dialog', { name: 'Field settings' }),
    ).toBeNull();
  });
});
