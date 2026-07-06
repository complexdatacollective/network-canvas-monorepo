import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import BiometricUnlockForm from './BiometricUnlockForm';

// The button-driven biometric unlock control. `onSubmit` returns
// {ok, message?}; the form shows a "Waiting…" label while pending and an
// alert on failure. Drive the outcome from the controls.
type Outcome = 'success' | 'failure';
type StoryArgs = { outcome: Outcome; submitLabel: string; disabled: boolean };

const makeSubmit = (outcome: Outcome) => async () => {
  await new Promise((r) => setTimeout(r, 150));
  return outcome === 'success'
    ? { ok: true }
    : { ok: false, message: 'Authenticator not recognised.' };
};

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/BiometricUnlockForm',
  parameters: { layout: 'padded' },
  args: {
    outcome: 'success',
    submitLabel: 'Unlock with authenticator',
    disabled: false,
  },
  argTypes: {
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
    submitLabel: { control: 'text' },
    disabled: { control: 'boolean' },
  },
  render: ({ outcome, submitLabel, disabled }) => (
    <div className="max-w-sm">
      <BiometricUnlockForm
        onSubmit={makeSubmit(outcome)}
        submitLabel={submitLabel}
        disabled={disabled}
      />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// A failed authentication surfaces the error alert.
export const Failure: Story = {
  args: { outcome: 'failure' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button'));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Authenticator not recognised.',
    );
  },
};
