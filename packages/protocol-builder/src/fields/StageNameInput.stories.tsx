import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import StageNameInput from './StageNameInput.tsx';

/**
 * The control on its own, holding a value nothing else owns.
 *
 * `fields/StageNameField` is the connected one — it binds this to the stage's
 * name, draws the label an issues panel harvests and the region a refusal is
 * announced in, and is what a host actually mounts. This is the control
 * underneath it, for a host that draws its own field around the same box, and
 * for the two things about the box that are worth seeing on their own: how it
 * grows as a name outruns the column, and what it refuses to accept.
 */
function Control({
  initialValue = '',
  ...props
}: Readonly<{
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
  characterLimit?: number;
}>) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="max-w-2xl p-6">
      {/* Named here because nothing is drawing a label around it. */}
      <label className="sr-only" htmlFor="stage-name">
        Stage name
      </label>
      <StageNameInput
        id="stage-name"
        name="label"
        value={value}
        onChange={setValue}
        {...props}
      />
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Stage name control',
  component: Control,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The box a stage’s name is typed into, at the size of the page’s own heading. It is a text area rather than a single-line box for one reason: a name longer than the column has to wrap instead of being cut off at the edge with nothing saying more of it exists. The value it holds is still one line — Enter performs the form’s own submission instead of adding a break, and a pasted name’s line breaks become spaces.',
      },
    },
  },
  args: { placeholder: 'Enter stage name...' },
  tags: ['autodocs'],
} satisfies Meta<typeof Control>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing typed yet, so the placeholder stands in at the size the name will be. */
export const Empty: Story = {};

/** A name that fits on one line. */
export const AShortName: Story = {
  args: { initialValue: 'Close ties' },
};

/**
 * And one that does not. The box grows to hold every line rather than
 * scrolling or clipping, which is the whole reason it is a text area.
 */
export const ANameThatWraps: Story = {
  args: {
    initialValue:
      'People you would talk to about something personal, difficult or worrying',
  },
};

/** Held elsewhere: readable, and not rewritable. */
export const ASpectator: Story = {
  args: { initialValue: 'Close ties', disabled: true },
};

/**
 * A pasted name is still one line.
 *
 * Line breaks become spaces rather than being dropped, so two pasted lines do
 * not run together into one word — and nothing downstream has to cope with a
 * stage name that has a break in it.
 */
export const APasteWithLineBreaks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('textbox', { name: 'Stage name' });

    await userEvent.click(box);
    await userEvent.paste('Who you turn to\nwhen things are hard');

    await expect(box).toHaveValue('Who you turn to when things are hard');
  },
};
