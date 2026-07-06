import type { Meta, StoryObj } from '@storybook/react-vite';

import { withFormStore } from '~/storybook/decorators';

import PasswordUnlockField from './PasswordUnlockField';

// The passphrase entry field used by the passphrase lock/step-up dialogs.
// Password-manager autofill is suppressed and the strength meter is hidden
// (this is unlock, not enrolment).
type StoryArgs = { autoFocus: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/PasswordUnlockField',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { autoFocus: false },
  argTypes: { autoFocus: { control: 'boolean' } },
  render: ({ autoFocus }) => (
    <div className="max-w-sm">
      <PasswordUnlockField autoFocus={autoFocus} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
