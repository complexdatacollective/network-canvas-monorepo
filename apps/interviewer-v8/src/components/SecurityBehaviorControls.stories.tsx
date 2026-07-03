import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import SecurityBehaviorControls, {
  type Behavior,
} from './SecurityBehaviorControls';

type StoryArgs = Behavior & { disabled: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SecurityBehaviorControls',
  parameters: { layout: 'padded' },
  args: {
    idleTimeoutMinutes: 15,
    requireUnlockOnEnter: true,
    requireUnlockOnExit: false,
    requireUnlockOnExport: false,
    disabled: false,
  },
  argTypes: {
    idleTimeoutMinutes: {
      control: 'inline-radio',
      options: [1, 5, 15, 30, 60],
    },
    requireUnlockOnEnter: { control: 'boolean' },
    requireUnlockOnExit: { control: 'boolean' },
    requireUnlockOnExport: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  render: ({ disabled, ...initial }) => {
    const [value, setValue] = useState<Behavior>(initial);
    return (
      <div className="max-w-xl" key={JSON.stringify(initial)}>
        <SecurityBehaviorControls
          value={value}
          onChange={setValue}
          disabled={disabled}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
