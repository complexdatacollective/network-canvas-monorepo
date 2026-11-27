import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fieldBlockMarkdown } from '@codaco/protocol-validation';

import {
  attributeField,
  chooseAttributeById,
} from '../../../testing/attributePicker.ts';
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
  caretInQuestion,
  fieldSettings,
  formEditor,
  selectField,
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

const FIELDS = [
  {
    id: RELATIONSHIP_FIELD,
    variable: RELATIONSHIP,
    prompt: { 'en-US': 'How do you know them?' },
  },
  { id: AGE_FIELD, variable: AGE, prompt: { 'en-US': 'How old are they?' } },
];

const openForm = async () => {
  const harness = renderStageEditor({
    stage: {
      ...FIXTURE,
      fields: {
        ...FIXTURE.fields,
        form: {
          content: {
            'en-US': `Intro\n\n${fieldBlockMarkdown(RELATIONSHIP_FIELD)}\n\n${fieldBlockMarkdown(AGE_FIELD)}`,
          },
          fields: FIELDS,
        },
      },
    },
    sections: <FormDocumentSection subject="node" />,
  });
  await harness.opened();
  const editor = await formEditor();
  return { harness, editor };
};

type SavedForm = Readonly<{
  content: Readonly<Record<string, string>>;
  fields: readonly Record<string, unknown>[];
}>;

const savedForm = (saved: Awaited<ReturnType<typeof submitOf>>) =>
  saved?.stageDocument.form as SavedForm | undefined;

const submitOf = (harness: Awaited<ReturnType<typeof openForm>>['harness']) =>
  harness.submit();

describe('the languages named in a field’s settings', () => {
  const BILINGUAL = { defaultLocale: 'en-US', locales: ['en-US', 'es'] };

  const openIn = async (content: Readonly<Record<string, string>>) => {
    const harness = renderStageEditor({
      stage: {
        ...FIXTURE,
        fields: { ...FIXTURE.fields, form: { content, fields: FIELDS } },
      },
      sections: <FormDocumentSection subject="node" />,
      localization: BILINGUAL,
    });
    await harness.opened();
    const editor = await formEditor();
    await selectField(harness, editor, AGE_FIELD);
    return fieldSettings();
  };

  // Spanish has no document of its own, so its participants are shown the
  // English one, with this field in it.
  it('include a language that is shown another language’s form', async () => {
    const settings = await openIn({
      'en-US': `Intro\n\n${fieldBlockMarkdown(AGE_FIELD)}`,
    });
    expect(
      settings.getByText(/This field is also in the español form\./),
    ).toBeInTheDocument();
  });

  it('leave out a language whose own form does not contain the field', async () => {
    const settings = await openIn({
      'en-US': `Intro\n\n${fieldBlockMarkdown(AGE_FIELD)}`,
      'es': `Hola\n\n${fieldBlockMarkdown(RELATIONSHIP_FIELD)}`,
    });
    expect(settings.queryByText(/This field is also in/)).toBeNull();
  });
});

describe('the settings of a field', () => {
  it('open beside a selected field, not while its question is being typed', async () => {
    const { harness, editor } = await openForm();

    await caretInQuestion(harness, editor, AGE_FIELD, 3);
    expect(screen.queryByRole('dialog', { name: 'Field settings' })).toBeNull();

    await harness.user.keyboard('{Escape}');
    const settings = await fieldSettings();
    expect(settings.getAllByText('age').length).toBeGreaterThan(0);
    expect(
      settings.getByRole('combobox', { name: 'Input control' }),
    ).toHaveTextContent('Number');
  });

  it('open when the field’s control is clicked', async () => {
    const { harness, editor } = await openForm();
    const control = blockFor(editor, AGE_FIELD).querySelector<HTMLElement>(
      '[data-field-control]',
    );
    if (control === null) throw new Error('The field draws no control.');

    await harness.user.click(control);

    await waitFor(() =>
      expect(blockFor(editor, AGE_FIELD)).toHaveAttribute('data-selected'),
    );
    const settings = await fieldSettings();
    expect(
      settings.getByRole('combobox', { name: 'Input control' }),
    ).toHaveTextContent('Number');
  });

  it('are entered with Enter on the field, and left with Escape', async () => {
    const { harness, editor } = await openForm();
    await selectField(harness, editor, AGE_FIELD);
    const settings = () =>
      screen.getByRole('dialog', { name: 'Field settings' });
    const focusInSettings = () =>
      expect(settings().contains(document.activeElement)).toBe(true);
    await screen.findByRole('dialog', { name: 'Field settings' });
    expect(editor).toHaveFocus();

    await harness.user.keyboard('{Enter}');
    await waitFor(focusInSettings);

    // Escape takes the keyboard back to the field, which stays selected.
    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(editor).toHaveFocus());
    expect(blockFor(editor, AGE_FIELD)).toHaveAttribute('data-selected');

    // And Enter goes back in.
    await harness.user.keyboard('{Enter}');
    await waitFor(focusInSettings);
  });

  it('write the input control to the attribute when the stage is saved', async () => {
    const { harness, editor } = await openForm();
    await selectField(harness, editor, RELATIONSHIP_FIELD);
    const settings = await fieldSettings();

    await harness.user.click(
      settings.getByRole('combobox', { name: 'Input control' }),
    );
    await harness.user.click(
      await screen.findByRole('option', { name: /Text Area/ }),
    );

    expect(await harness.submit()).not.toBeNull();
    const variable: unknown =
      harness.hostCodebook().node?.[PERSON]?.variables?.[RELATIONSHIP];
    expect(variable).toMatchObject({ component: 'TextArea' });
  });

  it('show validation hints on the field when the toggle is on', async () => {
    const { harness, editor } = await openForm();
    await selectField(harness, editor, AGE_FIELD);
    const settings = await fieldSettings();

    await harness.user.click(
      settings.getByRole('switch', { name: 'Show validation hints' }),
    );

    const form = savedForm(await harness.submit());
    expect(form?.fields.find((field) => field.id === AGE_FIELD)).toEqual({
      ...FIELDS[1],
      showValidationHints: true,
    });
    expect(
      form?.fields.find((field) => field.id === RELATIONSHIP_FIELD),
    ).toEqual(FIELDS[0]);
  });

  it('delete the field from the form and from the fields it saves', async () => {
    const { harness, editor } = await openForm();
    await selectField(harness, editor, AGE_FIELD);
    const settings = await fieldSettings();

    await harness.user.click(
      settings.getByRole('button', { name: 'Delete field' }),
    );

    await waitFor(() =>
      expect(editor.querySelector(`[data-field-id="${AGE_FIELD}"]`)).toBeNull(),
    );
    const form = savedForm(await harness.submit());
    expect(form?.fields).toEqual([FIELDS[0]]);
    expect(form?.content['en-US']).not.toContain(AGE_FIELD);
    expect(form?.content['en-US']).toContain(RELATIONSHIP_FIELD);
  });

  it('point the field at another attribute', async () => {
    const { harness, editor } = await openForm();
    const NAME = fixtureVariableId(
      { entity: 'node', typeName: 'person' },
      'name',
    );
    await selectField(harness, editor, AGE_FIELD);
    await fieldSettings();

    await chooseAttributeById(
      harness.user,
      attributeField(
        'Attribute',
        await screen.findByRole('dialog', { name: 'Field settings' }),
      ),
      NAME,
    );

    await waitFor(() =>
      expect(blockFor(editor, AGE_FIELD)).toHaveTextContent('name'),
    );
    const form = savedForm(await harness.submit());
    expect(form?.fields.find((field) => field.id === AGE_FIELD)).toEqual({
      ...FIELDS[1],
      variable: NAME,
    });
  });
});

describe('the keyboard in the settings of a field', () => {
  it('goes back to the field with Tab after Delete field', async () => {
    const { harness, editor } = await openForm();
    await selectField(harness, editor, AGE_FIELD);
    const settings = await fieldSettings();
    const remove = settings.getByRole('button', { name: 'Delete field' });
    act(() => remove.focus());

    await harness.user.tab();

    await waitFor(() => expect(editor).toHaveFocus());
    expect(blockFor(editor, AGE_FIELD)).toHaveAttribute('data-selected');
  });
});

describe('the settings of a field whose attribute has no options', () => {
  const FLAGGED = fixtureVariableId(
    { entity: 'node', typeName: 'person' },
    'flagged',
  );
  const CONTACT_TYPE = fixtureVariableId(
    { entity: 'node', typeName: 'person' },
    'contactType',
  );
  const FLAGGED_FIELD = testId('field/flagged');
  const CONTACT_FIELD = testId('field/contact');

  const openWith = async () => {
    const harness = renderStageEditor({
      stage: {
        ...FIXTURE,
        fields: {
          ...FIXTURE.fields,
          form: {
            content: {
              'en-US': `${fieldBlockMarkdown(FLAGGED_FIELD)}\n\n${fieldBlockMarkdown(CONTACT_FIELD)}`,
            },
            fields: [
              {
                id: FLAGGED_FIELD,
                variable: FLAGGED,
                prompt: { 'en-US': 'Flagged?' },
              },
              {
                id: CONTACT_FIELD,
                variable: CONTACT_TYPE,
                prompt: { 'en-US': 'How do you keep in touch?' },
              },
            ],
          },
        },
      },
      sections: <FormDocumentSection subject="node" />,
    });
    await harness.opened();
    return { harness, editor: await formEditor() };
  };

  it('name the settings of its control, not its options', async () => {
    const { harness, editor } = await openWith();

    await selectField(harness, editor, FLAGGED_FIELD);
    const settings = await fieldSettings();
    expect(
      settings.getByRole('heading', { name: 'Control settings' }),
    ).toBeInTheDocument();
    expect(settings.queryByRole('heading', { name: 'Options' })).toBeNull();
    expect(
      settings.getByRole('button', { name: 'Edit control settings' }),
    ).toBeInTheDocument();

    await selectField(harness, editor, CONTACT_FIELD);
    const options = await fieldSettings();
    expect(
      options.getByRole('heading', { name: 'Options' }),
    ).toBeInTheDocument();
  });
});
