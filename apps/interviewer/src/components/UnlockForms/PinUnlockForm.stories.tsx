import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

import { withFormStore } from '~/storybook/decorators';

import { PinUnlockForm } from './PinUnlockForm';

// The full PIN unlock form: it auto-submits when the 8th digit lands and, on a
// wrong PIN, clears + refocuses the field so the user can retype. Drive the
// verify outcome from the controls.
type Outcome = 'success' | 'failure';
type StoryArgs = { outcome: Outcome; invalidMessage: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/PinUnlockForm',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { outcome: 'failure', invalidMessage: 'Incorrect PIN.' },
  argTypes: {
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
    invalidMessage: { control: 'text' },
  },
  render: ({ outcome, invalidMessage }) => (
    <div className="max-w-md">
      <PinUnlockForm
        formId="story-pin-form"
        invalidMessage={invalidMessage}
        verifyPin={async (_pin) => {
          await new Promise((r) => setTimeout(r, 100));
          return outcome === 'success'
            ? { ok: true }
            : { ok: false, message: invalidMessage };
        }}
      />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Typing 8 digits auto-submits; a wrong PIN surfaces the error and clears.
export const AutoSubmitAndClearOnError: Story = {
  render: (_args) => {
    const verifyPin = fn(async () => ({
      ok: false,
      message: 'Incorrect PIN.',
    }));
    return (
      <div className="max-w-md">
        <PinUnlockForm formId="story-pin-form" verifyPin={verifyPin} />
      </div>
    );
  },
  play: async ({ canvas, userEvent }) => {
    for (const digit of '00000000') {
      await userEvent.keyboard(digit);
    }
    // Auto-submit fired verifyPin; the error message is shown.
    await expect(await canvas.findByText('Incorrect PIN.')).toBeInTheDocument();
  },
};
