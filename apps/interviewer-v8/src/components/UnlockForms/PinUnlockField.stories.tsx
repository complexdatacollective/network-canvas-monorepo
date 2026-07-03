import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

import { withFormStore } from '~/storybook/decorators';

import PinUnlockField from './PinUnlockField';

// The 8-digit segmented PIN field. It fires `onComplete` once all 8 segments
// are filled (the form uses that to auto-submit).
type StoryArgs = { autoFocus: boolean; disabled: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/PinUnlockField',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { autoFocus: true, disabled: false },
  argTypes: {
    autoFocus: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  render: ({ autoFocus, disabled }) => (
    <div className="max-w-md">
      <PinUnlockField autoFocus={autoFocus} disabled={disabled} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Confirms onComplete fires only after the 8th digit is entered.
type FiresOnCompleteArgs = StoryArgs & { onComplete: () => void };

export const FiresOnComplete: StoryObj<FiresOnCompleteArgs> = {
  args: { ...meta.args, onComplete: fn() },
  render: ({ autoFocus, disabled, onComplete }) => (
    <div className="max-w-md">
      <PinUnlockField
        autoFocus={autoFocus}
        disabled={disabled}
        onComplete={onComplete}
      />
    </div>
  ),
  play: async ({ canvas, userEvent, args }) => {
    const inputs = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        canvas.findByLabelText(`Digit ${String(i + 1)} of 8, hidden`),
      ),
    );

    for (const [index, digit] of '1234567'.split('').entries()) {
      await userEvent.type(inputs[index], digit);
    }
    await expect(args.onComplete).not.toHaveBeenCalled();

    await userEvent.type(inputs[7], '8');
    await expect(args.onComplete).toHaveBeenCalled();
  },
};
