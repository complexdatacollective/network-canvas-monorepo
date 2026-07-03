import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { withFormStore } from '~/storybook/decorators';

import { Step3PinConfigureView } from './Step3PinConfigure';

// The PIN enrolment step's presentation: two 8-digit fields, the no-recovery
// warning, an error slot, and the affirmation checkbox. `error` is a control;
// affirmation is local so the checkbox toggles.
type StoryArgs = { error: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SetupWizard/Step3PinConfigure',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { error: '' },
  argTypes: { error: { control: 'text' } },
  render: ({ error }) => {
    const [affirmed, setAffirmed] = useState(false);
    return (
      <div className="max-w-xl">
        <Step3PinConfigureView
          error={error || null}
          affirmed={affirmed}
          onAffirmChange={setAffirmed}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const WithError: Story = { args: { error: 'PIN setup failed.' } };
