import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import type { FormAttributeRules } from '../sections/form-document/formDocumentEnvironment.ts';
import { useStageSubject } from '../sections/useStageSubject.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import { fixtureStageId } from '../testing/protocolFixture.ts';
import {
  FORM_CONTENT_PATH,
  FormDocumentField,
  useFormContentValidation,
} from './FormDocumentField.tsx';

const LABEL = 'Form content';

/** No attribute is reserved or written elsewhere on this stage. */
const RULES: FormAttributeRules = {
  draftUnvalidated: new Set(),
  draftUnvalidatedReason: undefined,
  reserved: new Set(),
  reservedReason: undefined,
  reservedRefusal: undefined,
  answeredFor: undefined,
};

/** The form of an alter form stage, collecting into its node type. */
function AlterFormContent() {
  const subject = useStageSubject('node');
  const validation = useFormContentValidation();
  return (
    <Field<typeof FormDocumentField>
      name={FORM_CONTENT_PATH}
      component={FormDocumentField}
      subject={subject}
      rules={RULES}
      label={LABEL}
      placeholder="Write the form, and add a field for each question."
      {...validation}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Form document',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The text of a form, in one language, with a block for each question among its paragraphs. Each field block shows the question and hint, which the researcher types in place, the attribute that the answer is stored in, and a picture of the control that the participant answers with. The Field button adds a field at the caret and opens the list of attributes; selecting a field opens its settings. Mounted by `FormDocumentSection`, which every form stage uses.',
      },
    },
  },
  args: {
    stageId: fixtureStageId('alter-form-1'),
    sectionTitle: 'Form',
    children: <AlterFormContent />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The fixture's form: two fields, each with its question and attribute. */
export const Main: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const editor = await within(canvasElement).findByRole('textbox', {
      name: LABEL,
    });
    await waitFor(async () => {
      await expect(
        editor.querySelectorAll('[data-field-block-view]'),
      ).toHaveLength(2);
    });
    await expect(editor).toHaveTextContent(
      "What is this person's relationship to you?",
    );
  },
};

/**
 * The Field button adds a field and opens the list beside it; dismissed
 * without a choice, the new field is taken out again.
 */
export const AddingAndDismissingAField: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByRole('textbox', { name: LABEL });
    await userEvent.click(editor);

    await userEvent.click(canvas.getByRole('button', { name: 'Field' }));
    const picker = await body.findByRole('dialog', {
      name: 'Attribute of the new field',
    });
    await waitFor(async () => {
      await expect(
        editor.querySelectorAll('[data-field-block-view]'),
      ).toHaveLength(3);
    });

    await userEvent.keyboard('{Escape}');
    await waitFor(async () => {
      await expect(picker).not.toBeInTheDocument();
      await expect(
        editor.querySelectorAll('[data-field-block-view]'),
      ).toHaveLength(2);
    });
  },
};

/** Somebody else holds the stage: the form can be read, not changed. */
export const ReadOnly: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const editor = await within(canvasElement).findByRole('textbox', {
      name: LABEL,
    });
    await expect(editor).toHaveAttribute('contenteditable', 'false');
  },
};
