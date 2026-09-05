import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import DialogForm, { DialogFormField } from './DialogForm.tsx';

/** The story's fields are all text, so anything else has nothing to show. */
const asText = (value: FieldValue): string =>
  typeof value === 'string' ? value : '';

/**
 * A host with no session and no protocol: it holds one record, opens the
 * editor on it, and takes back whatever the editor saves.
 */
function RuleEditorHost({
  rule,
  requireVariable,
}: {
  rule: Readonly<Record<string, FieldValue>>;
  requireVariable: boolean;
}) {
  const [saved, setSaved] = useState(rule);
  const [open, setOpen] = useState(false);

  return (
    <DialogProvider>
      <main className="mx-auto flex max-w-3xl flex-col items-start gap-4 p-6">
        <Paragraph>
          Saved rule:{' '}
          {asText(saved.label) === '' ? 'not named yet' : asText(saved.label)}
          {asText(saved.variable) === '' ? '' : ` — ${asText(saved.variable)}`}
        </Paragraph>
        <Button color="primary" onClick={() => setOpen(true)}>
          Edit rule
        </Button>
        <DialogForm
          open={open}
          onClose={() => setOpen(false)}
          title="Edit rule"
          description="Rules decide which participants reach this stage."
          formId="rule-editor"
          initialValues={saved}
          onSubmit={(values) => setSaved(values)}
          validate={(values) =>
            requireVariable && values.variable === ''
              ? { formErrors: ['Name the attribute this rule looks at.'] }
              : undefined
          }
          submitLabel="Save rule"
        >
          <DialogFormField
            name="label"
            label="Rule name"
            hint="How this rule is listed in the skip logic summary."
            component={InputField}
            required
          />
          <DialogFormField
            name="variable"
            label="Attribute"
            component={InputField}
          />
        </DialogForm>
      </main>
    </DialogProvider>
  );
}

const meta = {
  title: 'Protocol Builder/Dialog form',
  component: RuleEditorHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A dialog that edits one self-contained thing — a rule, a prompt, a single row of an array — in a form store of its own. Nothing typed in it reaches the form behind it until the researcher saves, and closing it with unsaved changes asks first.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof RuleEditorHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editing: Story = {
  args: {
    rule: { label: 'Adults only', variable: 'age' },
    requireVariable: false,
  },
};

/** A check no single field can make on its own, reported above the fields. */
export const WithAFormLevelCheck: Story = {
  args: { rule: { label: '', variable: '' }, requireVariable: true },
};
