import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { dynamicValueNameFor } from '@codaco/protocol-validation';

import { familyPedigreeEditor } from '../../../editors/family-pedigree/__tests__/editorFixtures.ts';
import { familyPedigreeMessages } from '../../../editors/family-pedigree/sections/pedigreeMessages.ts';
import {
  fixtureVariableId,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testId } from '../../../testing/testId.ts';
import FormDocumentSection from '../FormDocumentSection.tsx';
import { caretInQuestion, formEditor } from './formDocumentTesting.ts';

const RELATIONSHIP = fixtureVariableId(
  { entity: 'node', typeName: 'person' },
  'relationship_to_ego',
);

type Form = Readonly<{
  title?: Readonly<Record<string, string>>;
  content: Readonly<Record<string, string>>;
  fields: readonly Readonly<{ id: string; variable: string }>[];
}>;

const fixtureForm = (stageId: Parameters<typeof loadFixtureStage>[0]) =>
  loadFixtureStage(stageId).fields.form as Form;

describe('the form section', () => {
  it('drops a field that no language places, and then the dynamic attribute and the condition that only its question used', async () => {
    const stage = loadFixtureStage('ego-form-1');
    const form = stage.fields.form as Form;
    const [first] = form.fields;
    if (first === undefined) throw new Error('The fixture has no field.');
    const asked = testId('condition/asked');
    const greeting = testId('dynamic/greeting');
    const unplaced = {
      id: testId('field/unplaced'),
      variable: first.variable,
      prompt: {
        'en-US': `Hello {${dynamicValueNameFor({ kind: 'dynamicAttribute', id: greeting })}}`,
      },
    };
    const harness = renderStageEditor({
      stage: {
        ...stage,
        fields: {
          ...stage.fields,
          form: { ...form, fields: [...form.fields, unplaced] },
          conditions: {
            [asked]: {
              rules: [
                {
                  id: testId('rule/asked'),
                  type: 'ego',
                  options: {
                    attribute: first.variable,
                    operator: 'EXACTLY',
                    value: 'Sam',
                  },
                },
              ],
            },
          },
          dynamicAttributes: {
            [greeting]: {
              logic: 'conditions',
              cases: [
                { condition: asked, when: 'met', wording: { 'en-US': 'Sam' } },
              ],
              otherwise: { 'en-US': 'friend' },
            },
          },
        },
      },
      sections: <FormDocumentSection subject="ego" />,
    });
    await harness.opened();
    await formEditor();

    const saved = await harness.submit();

    expect(saved).not.toBeNull();
    expect((saved?.stageDocument.form as Form | undefined)?.fields).toEqual([
      first,
    ]);
    expect(saved?.stageDocument.dynamicAttributes ?? {}).toEqual({});
    expect(saved?.stageDocument.conditions ?? {}).toEqual({});
  });

  it('saves an ego form it opened exactly as it was', async () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: <FormDocumentSection subject="ego" />,
    });
    await harness.opened();
    const editor = await formEditor();
    expect(editor).toHaveTextContent('There are a few questions about you');
    expect(screen.getByRole('heading', { name: 'Form' })).toBeInTheDocument();

    const saved = await harness.submit();
    expect(saved?.stageDocument.form).toEqual(fixtureForm('ego-form-1'));
  });

  it('writes the question typed into a field', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: <FormDocumentSection subject="node" />,
    });
    await harness.opened();
    const editor = await formEditor();
    const [first] = fixtureForm('alter-form-1').fields;
    if (first === undefined) throw new Error('The fixture has no field.');

    await caretInQuestion(harness, editor, first.id, 0);
    await harness.user.keyboard('Please say: ');

    const saved = await harness.submit();
    const form = saved?.stageDocument.form as Form | undefined;
    expect(form?.fields[0]).toEqual({
      ...first,
      prompt: {
        'en-US': "Please say: What is this person's relationship to you?",
      },
    });
    expect(form?.content).toEqual(fixtureForm('alter-form-1').content);
  });

  it('waits for the stage’s subject before offering a form', async () => {
    const stage = loadFixtureStage('alter-form-1');
    const { subject: _subject, ...withoutSubject } = stage.fields;
    renderStageEditor({
      stage: { ...stage, fields: withoutSubject },
      sections: <FormDocumentSection subject="node" />,
    });

    expect(
      await screen.findByText(
        'Choose what this stage works with before writing its form.',
      ),
    ).toBeInTheDocument();
  });

  it('asks a name generator for the title of its dialog', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <FormDocumentSection subject="node" hasTitle />,
    });
    await harness.opened();
    const title = await screen.findByRole('textbox', { name: 'Dialog title' });
    expect(title).toHaveTextContent('Add a person');

    await harness.user.click(title);
    await harness.user.keyboard('{Control>}a{/Control}{Backspace}');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Give this dialog a title.'),
    ).toBeInTheDocument();
  });

  it('refuses a field that collects an attribute its interface reserves', async () => {
    const harness = renderStageEditor({
      stageId: 'alter-form-1',
      sections: (
        <FormDocumentSection
          subject="node"
          reservedVariables={[RELATIONSHIP]}
          reservedVariableRefusal={
            familyPedigreeMessages.personFormReservedRefusal
          }
          reservedVariableReason={
            familyPedigreeMessages.personFormReservedReason
          }
        />
      ),
    });
    await harness.opened();
    await formEditor();

    expect(await harness.submit()).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByText(
          'The interface already records this attribute itself, so these fields cannot collect it as well. Choose another attribute, or remove the field.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('refuses a Family Pedigree whose additional fields are switched on without a field, and saves it without a form once they are switched off', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      editor: familyPedigreeEditor,
    });
    await harness.opened();
    expect(harness.seeded.fields).not.toHaveProperty('form');
    const toggle = await screen.findByRole('switch', {
      name: 'Additional person fields',
    });

    await harness.user.click(toggle);
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('Add at least one field to this form.'),
    ).toBeInTheDocument();

    await harness.user.click(toggle);
    const confirm = screen.queryByRole('button', { name: 'Remove the fields' });
    if (confirm !== null) await harness.user.click(confirm);
    await waitFor(() => expect(toggle).not.toBeChecked());

    const saved = await harness.submit();
    expect(saved).not.toBeNull();
    expect(saved?.stageDocument).not.toHaveProperty('form');
  });
});
