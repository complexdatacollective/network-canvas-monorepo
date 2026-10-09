import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { PEDIGREE_PARENTS_ARGUMENTS } from '@codaco/protocol-validation';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import LocalizedMessageField from './LocalizedMessageField.tsx';

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
    arguments={PEDIGREE_PARENTS_ARGUMENTS}
    caseLabels={{
      isYou: { true: 'About the participant', other: 'About someone else' },
    }}
    placeholderLabels={{ name: 'Name', missing: 'Parents missing' }}
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
          'Participant-facing text that reads differently depending on what it is about: a version for each case (about the participant, about someone else) and, where it shows a number, one for each plural form of the editing language, labelled with examples of the numbers it is for. Placeholders such as a person’s name show as chips, inserted from the toolbar. Versions that all read the same are saved as one phrase.\n\n```tsx\n<Field\n  name="completeness.itemText.parents.listItem"\n  component={LocalizedMessageField}\n  label="Missing parents"\n  arguments={PEDIGREE_PARENTS_ARGUMENTS}\n  caseLabels={{ isYou: { true: "About the participant", other: "About someone else" } }}\n  placeholderLabels={{ name: "Name", missing: "Parents missing" }}\n/>\n```',
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

/** A message with a select and a plural: four versions in English. */
export const SelectAndPlural: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const group = await canvas.findByRole('group', { name: 'Missing parents' });
    const versions = within(group).getAllByRole('textbox');
    await expect(versions).toHaveLength(4);
    await expect(versions[0]).toHaveTextContent(
      'Add your other biological parent',
    );
    await expect(
      within(group).getAllByRole('button', { name: 'Insert “Name”' }),
    ).toHaveLength(4);
  },
};
