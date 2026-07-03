import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Step3BiometricConfigureView } from './Step3BiometricConfigure';

// The biometric enrolment step: intro + recovery-passphrase entry/confirm with
// strength meter and mismatch hint. `error` is a control.
type StoryArgs = { error: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SetupWizard/Step3BiometricConfigure',
  parameters: { layout: 'padded' },
  args: { error: '' },
  argTypes: { error: { control: 'text' } },
  render: ({ error }) => {
    const [phrase, setPhrase] = useState('');
    const [confirmValue, setConfirmValue] = useState('');
    return (
      <div className="max-w-xl">
        <Step3BiometricConfigureView
          phrase={phrase}
          confirmValue={confirmValue}
          error={error || null}
          onPhraseChange={setPhrase}
          onConfirmChange={setConfirmValue}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const WithError: Story = { args: { error: 'Biometric setup failed.' } };
