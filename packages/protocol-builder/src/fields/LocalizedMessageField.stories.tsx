import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import type { MessageArguments } from '@codaco/protocol-validation';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import LocalizedMessageField from './LocalizedMessageField.tsx';

/** A person, and a count: a select and a plural. */
const PARENTS_ARGUMENTS = {
  isYou: { kind: 'select', cases: ['true'] },
  name: { kind: 'text' },
  missing: { kind: 'plural' },
} as const satisfies MessageArguments;

const PARENTS_ITEM = {
  'en-US':
    '{isYou, select, true {{missing, plural, one {Add your other biological parent} other {Add your biological parents}}} other {{missing, plural, one {Add another biological parent for “{name}”} other {Add biological parents for “{name}”}}}}',
};

const parentsItem = (
  <Field<typeof LocalizedMessageField>
    name="completeness.itemText.parents.listItem"
    component={LocalizedMessageField}
    label="Missing parents"
    hint="Asks for a person’s missing parents. It can show their name and how many parents are missing."
    arguments={PARENTS_ARGUMENTS}
    initialValue={PARENTS_ITEM}
    required={REQUIRED}
  />
);

const meta = {
  title: 'Protocol Builder/Fields/Text with versions',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Participant-facing text that reads differently depending on what it is about, edited as piped text is: one line, its placeholders (such as a person’s name) as pills, and a piece of text with a version for each case (about the participant, about someone else) or wording that fits a number only where the text has one, folded to a pill until it is opened. The insert menu (the syringe button, or typing `{`) offers what the setting declares; the names come from `useMessageArgumentLabels`.\n\n```tsx\n<Field\n  name="completeness.itemText.parents.listItem"\n  component={LocalizedMessageField}\n  label="Missing parents"\n  arguments={PARENTS_ARGUMENTS}\n/>\n```',
      },
    },
  },
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'What the list says',
    children: parentsItem,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A message with a select and a plural: one line holding a pill, whose
 * versions open in place, the participant's own fitting its words to the
 * number.
 */
export const SelectAndPlural: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const line = await canvas.findByRole('textbox', {
      name: 'Missing parents',
    });
    await userEvent.click(
      within(line).getByRole('button', { name: 'Participant or someone else' }),
    );
    const aboutYou = await canvas.findByRole('textbox', {
      name: 'About the participant',
    });
    await expect(
      within(aboutYou).getByRole('button', { name: 'Parents missing' }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('textbox', { name: 'About someone else' }),
    ).toHaveTextContent('Add another biological parent for “Name”');
  },
};
