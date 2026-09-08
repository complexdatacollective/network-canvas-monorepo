import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { Button } from '@codaco/fresco-ui/Button';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import DialogForm, { DialogFormField } from './DialogForm.tsx';

/** The story's fields are all text, so anything else has nothing to show. */
const asText = (value: FieldValue): string =>
  typeof value === 'string' ? value : '';

/**
 * One line of text for whatever the host currently holds, so a story — and its
 * play function — can read the saved record as a single string.
 */
const describeRule = (rule: Readonly<Record<string, FieldValue>>): string => {
  const label =
    asText(rule.label) === '' ? 'not named yet' : asText(rule.label);
  const variable = asText(rule.variable);
  return variable === '' ? label : `${label} — ${variable}`;
};

/**
 * A host with no session and no protocol: it holds one record, opens the
 * editor on it, and takes back whatever the editor saves.
 */
function RuleEditorHost({
  rule,
  requireVariable,
  openOnMount,
}: {
  rule: Readonly<Record<string, FieldValue>>;
  requireVariable: boolean;
  /** Shows the editor as soon as the story renders, rather than on the button. */
  openOnMount: boolean;
}) {
  const [saved, setSaved] = useState(rule);
  const [open, setOpen] = useState(openOnMount);

  return (
    <DialogProvider>
      <main className="mx-auto flex max-w-3xl flex-col items-start gap-4 p-6">
        <Paragraph>
          Saved rule: <strong>{describeRule(saved)}</strong>
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

/**
 * The editor as the researcher meets it, opened on a rule that already exists.
 * The play edits the name and saves, which is what carries the draft back to
 * the host.
 */
export const Editing: Story = {
  args: {
    rule: { label: 'Adults only', variable: 'age' },
    requireVariable: false,
    openOnMount: true,
  },
  play: async ({ canvasElement }) => {
    // The dialog is portalled out of the story root, so it is reached through
    // `screen`; the host it reports back to is inside `canvasElement`.
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const dialog = await screen.findByRole('dialog');
    const ruleName = within(dialog).getByRole('textbox', {
      name: 'Rule name',
    });
    await userEvent.clear(ruleName);
    await userEvent.type(ruleName, 'Adults in the study');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save rule' }),
    );

    await waitFor(async () => {
      await expect(
        canvas.getByText('Adults in the study — age'),
      ).toBeInTheDocument();
    });
  },
};

/**
 * A check no single field can make on its own, reported above the fields. The
 * play submits a draft that fails it, so the story settles with the message on
 * screen and the editor still open.
 */
export const WithAFormLevelCheck: Story = {
  args: {
    rule: { label: '', variable: '' },
    requireVariable: true,
    openOnMount: true,
  },
  play: async () => {
    await awaitPassiveEffects();

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Rule name' }),
      'Adults only',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save rule' }),
    );

    await expect(
      await screen.findByText('Name the attribute this rule looks at.'),
    ).toBeInTheDocument();
  },
};
