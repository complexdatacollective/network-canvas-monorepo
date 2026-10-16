import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import WrappingTextField from './WrappingTextField.tsx';

/**
 * The control on its own. `LocalizedStringField` mounts it for a text that is
 * one paragraph a participant reads; what is worth seeing here is how the box
 * grows once the text outruns the column, and what it refuses to accept.
 */
function Control({
  initialValue = '',
  ...props
}: Readonly<{
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
}>) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="max-w-md p-6">
      {/* Named here because nothing is drawing a label around it. */}
      <label className="sr-only" htmlFor="wrapping-text">
        Message
      </label>
      <WrappingTextField
        id="wrapping-text"
        name="message"
        value={value}
        onChange={setValue}
        {...props}
      />
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Wrapping text control',
  component: Control,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A box for one paragraph of plain text. While the text fits it looks like a one-line text input; once it does not, it grows to show every line instead of cutting the text off at the edge. The value stays one paragraph: Enter adds nothing, and a pasted text’s line breaks become spaces.',
      },
    },
  },
  args: { placeholder: 'Enter a message...' },
  tags: ['autodocs'],
} satisfies Meta<typeof Control>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing typed yet: one line high, with the placeholder showing. */
export const Empty: Story = {};

/** A text longer than the column: the box grows rather than clipping it. */
export const TextThatWraps: Story = {
  args: {
    initialValue:
      'Think about the people you would talk to about something personal, difficult or worrying, and add each of them below.',
  },
};

/** Held elsewhere: readable, and not rewritable. */
export const Disabled: Story = {
  args: { initialValue: 'Add the people you talk to', disabled: true },
};

/** Enter adds no line, and pasted line breaks become spaces. */
export const StaysOneParagraph: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('textbox', { name: 'Message' });

    await userEvent.click(box);
    await userEvent.type(box, 'Who you turn to{Enter}');
    await expect(box).toHaveValue('Who you turn to');

    await userEvent.paste('\nwhen things\nare hard');
    await expect(box).toHaveValue('Who you turn to when things are hard');
  },
};
