import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import OptionLabelField from './OptionLabelField.tsx';

/** Where a row of an option list keeps the words on one answer. */
const LABEL_FIELD = 'optionLabel';
const LABEL = 'Option 1 label';

function OptionLabel({
  initialValue,
  readOnly = false,
}: Readonly<{ initialValue?: string; readOnly?: boolean }>) {
  return (
    <Field<typeof OptionLabelField>
      name={LABEL_FIELD}
      component={OptionLabelField}
      label={LABEL}
      hint="What a participant reads for this answer."
      placeholder="Enter a label..."
      readOnly={readOnly}
      {...(initialValue === undefined ? {} : { initialValue })}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Option label',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The words one answer puts in front of a participant — a bin, a button of a yes-or-no question, a point on a tie-strength scale, a choice in a form. The interview renders an option label as markdown wherever it shows one, so the label is markdown and this is the one box every surface that authors one uses. Bold and italic, and nothing else: a label is one line of somebody’s reading, so the document is one paragraph and a heading, link, list or rule is withheld rather than offered and refused. Punctuation a researcher types stays punctuation — an asterisk is an asterisk to the participant, not the start of an emphasis they never asked for — and the label is stored in Unicode canonical form, so two labels that read identically are also the same bytes in an export.',
      },
    },
  },
  args: {
    stageId: 'categorical-bin-1',
    sectionTitle: 'Answer options',
    children: <OptionLabel />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing written yet, so the box shows an example of what it wants. */
export const NothingWrittenYet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the field is drawn a
    // turn after the story mounts. Every play here awaits its first query.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: LABEL }),
    ).toHaveAttribute('aria-placeholder', 'Enter a label...');
  },
};

/**
 * A label the attribute already carries, shown as the participant will read
 * it rather than as the characters that produce it.
 */
export const AnEmphasisedLabel: Story = {
  args: { children: <OptionLabel initialValue="**Very** close" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', { name: LABEL });
    await expect(box).toHaveTextContent('Very close');
    await expect(box.querySelector('strong')).toHaveTextContent('Very');
  },
};

/**
 * Bold and italic, and nothing a single line could not hold. The control says
 * it holds one line, so a reader is not promised an Enter that does nothing.
 */
export const BoldAndItalicOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: LABEL }),
    ).toHaveAttribute('aria-multiline', 'false');
    await expect(canvas.getByRole('button', { name: 'Bold' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Italic' })).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Heading 1' }),
    ).toBeNull();
    await expect(
      canvas.queryByRole('button', { name: 'Bullet list' }),
    ).toBeNull();
    await expect(
      canvas.queryByRole('button', { name: 'Thematic break' }),
    ).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Add link' })).toBeNull();
  },
};

/**
 * Punctuation is punctuation. An asterisk typed into a label is a character
 * the participant reads, and the box shows it as one — the emphasis a
 * markdown renderer would otherwise make of it is what the escaping on the way
 * out exists to prevent.
 */
export const TypedPunctuationStaysPunctuation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', { name: LABEL });
    await userEvent.click(box);
    await userEvent.type(box, '5 * a day');

    await expect(box).toHaveTextContent('5 * a day');
    await expect(box.querySelector('em')).toBeNull();
    await expect(box.querySelector('strong')).toBeNull();
  },
};

/**
 * Held elsewhere: the label can be read, and neither the words nor the
 * formatting can be changed. The toolbar stays on screen rather than
 * disappearing — a control that vanishes cannot show that editing is held
 * somewhere else.
 */
export const ASpectator: Story = {
  args: { children: <OptionLabel readOnly initialValue="Very close" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: LABEL }),
    ).toHaveAttribute('aria-readonly', 'true');
    await expect(canvas.getByRole('button', { name: 'Bold' })).toBeDisabled();
  },
};
