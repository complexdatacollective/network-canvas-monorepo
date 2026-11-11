import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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
        onChange={(next) => setValue(next ?? '')}
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

    // Unicode's line and paragraph separators are line breaks too, and the
    // space a trailing one leaves stays, so the next word typed is its own.
    await userEvent.paste(
      `${String.fromCodePoint(0x2028)}or${String.fromCodePoint(0x2029)}`,
    );
    await userEvent.keyboard('worried');
    await expect(box).toHaveValue(
      'Who you turn to when things are hard or worried',
    );
  },
};

const outlineOf = (element: Element) => {
  const { outlineStyle, outlineWidth, outlineOffset, outlineColor } =
    getComputedStyle(element);
  return { outlineStyle, outlineWidth, outlineOffset, outlineColor };
};

/**
 * An invalid box keeps its focus ring: its red border says the text is wrong,
 * not which box the keyboard is in. The valid box beside it is the reference,
 * so the two cannot differ in a way this misses.
 */
export const InvalidKeyboardFocusRing: Story = {
  // This play reads a style that exists only while a control matches
  // `:focus-visible`, which never matches in Chromatic's unfocused capture
  // tab. `test:storybook` is where it runs.
  parameters: { chromatic: { disableSnapshot: true } },
  render: () => (
    <div className="flex max-w-md flex-col gap-6 p-6">
      <WrappingTextField aria-label="Valid" value="A valid message" />
      <WrappingTextField
        aria-label="Invalid"
        aria-invalid
        value="An invalid message"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const valid = canvas.getByRole('textbox', { name: 'Valid' });
    const invalid = canvas.getByRole('textbox', { name: 'Invalid' });
    // The box around each text draws the ring for it.
    const validBox = valid.parentElement;
    const invalidBox = invalid.parentElement;
    if (!validBox || !invalidBox) throw new Error('No box around the text');

    await expect(outlineOf(invalidBox).outlineStyle).toBe('none');

    await userEvent.tab();
    await waitFor(() => expect(valid).toHaveFocus());
    // The ring eases in, so it is read once it has settled.
    await waitFor(() =>
      expect(outlineOf(validBox)).toMatchObject({
        outlineStyle: 'solid',
        outlineWidth: '2px',
        outlineOffset: '3px',
      }),
    );
    const expected = outlineOf(validBox);
    const validBorder = getComputedStyle(validBox).borderTopColor;

    await userEvent.tab();
    await waitFor(() => expect(invalid).toHaveFocus());
    await waitFor(() => expect(outlineOf(invalidBox)).toEqual(expected));
    await expect(getComputedStyle(invalidBox).borderTopColor).not.toBe(
      validBorder,
    );
  },
};
