import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { WizardSelectedMethod } from '../SetupWizardDialog';
import { Step2MethodPickerView } from './Step2MethodPicker';

// The enrolment method picker. Args model biometric availability (the only
// branch that changes the presentation); selection is local to the story.
type StoryArgs = { biometricDisabled: boolean; biometricDescription: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SetupWizard/Step2MethodPicker',
  parameters: { layout: 'padded' },
  args: {
    biometricDisabled: false,
    biometricDescription:
      'Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device.',
  },
  argTypes: {
    biometricDisabled: { control: 'boolean' },
    biometricDescription: { control: 'text' },
  },
  render: ({ biometricDisabled, biometricDescription }) => {
    const [value, setValue] = useState<WizardSelectedMethod | null>(null);
    return (
      <div className="max-w-xl">
        <Step2MethodPickerView
          value={value}
          onChange={setValue}
          biometricDisabled={biometricDisabled}
          biometricDescription={biometricDescription}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const BiometricUnavailable: Story = {
  args: {
    biometricDisabled: true,
    biometricDescription: 'This device has no usable biometric sensor.',
  },
};
