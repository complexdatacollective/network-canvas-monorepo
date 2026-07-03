import type { Meta, StoryObj } from '@storybook/react-vite';

import NoRecoveryNotice from './NoRecoveryNotice';

type StoryArgs = { method: 'pin' | 'passphrase' | 'biometric' };

const meta: Meta<StoryArgs> = {
  title: 'Auth/NoRecoveryNotice',
  parameters: { layout: 'padded' },
  args: { method: 'pin' },
  argTypes: {
    method: {
      control: 'inline-radio',
      options: ['pin', 'passphrase', 'biometric'],
    },
  },
  render: ({ method }) => (
    <div className="max-w-xl">
      <NoRecoveryNotice method={method} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
