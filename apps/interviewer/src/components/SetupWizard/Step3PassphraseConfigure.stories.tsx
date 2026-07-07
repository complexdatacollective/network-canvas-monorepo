import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Step3PassphraseConfigureView } from './Step3PassphraseConfigure';

// The passphrase enrolment step: entry + confirm with a live strength meter,
// mismatch hint, no-recovery warning, error slot, and affirmation. Type into
// the fields to exercise strength/mismatch; `error` is a control.
type StoryArgs = { error: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SetupWizard/Step3PassphraseConfigure',
  parameters: { layout: 'padded' },
  args: { error: '' },
  argTypes: { error: { control: 'text' } },
  render: ({ error }) => {
    const [phrase, setPhrase] = useState('');
    const [confirmValue, setConfirmValue] = useState('');
    const [affirmed, setAffirmed] = useState(false);
    return (
      <div className="max-w-xl">
        <Step3PassphraseConfigureView
          phrase={phrase}
          confirmValue={confirmValue}
          affirmed={affirmed}
          error={error || null}
          onPhraseChange={setPhrase}
          onConfirmChange={setConfirmValue}
          onAffirmChange={setAffirmed}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const WithError: Story = { args: { error: 'Passphrase setup failed.' } };
