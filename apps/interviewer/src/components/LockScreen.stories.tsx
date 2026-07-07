import type { Meta, StoryObj } from '@storybook/react-vite';

import { MockAuthProvider } from '~/lib/auth/MockAuthProvider';

import { LockScreenView } from './LockScreen';

// The locked-vault screen. It renders the unlock dialog for the enrolled mode.
// Switch `mode` to see PIN / passphrase / biometric. Dialogs portal to body.
type Outcome = 'success' | 'failure';
type StoryArgs = { mode: 'pin' | 'passphrase' | 'biometric'; outcome: Outcome };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const result = (o: Outcome, msg: string) =>
  o === 'success' ? { ok: true } : { ok: false, message: msg };

const meta: Meta<StoryArgs> = {
  title: 'Auth/LockScreen',
  parameters: { layout: 'fullscreen' },
  args: { mode: 'pin', outcome: 'success' },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['pin', 'passphrase', 'biometric'],
    },
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
  },
  render: ({ mode, outcome }) => (
    <MockAuthProvider>
      <LockScreenView
        mode={mode}
        unlockWithPin={async () => {
          await wait(120);
          return result(outcome, 'Incorrect PIN.');
        }}
        unlockWithPassphrase={async () => {
          await wait(120);
          return result(outcome, 'Incorrect passphrase.');
        }}
        unlockWithBiometric={async () => {
          await wait(120);
          return result(outcome, 'Biometric attempt failed.');
        }}
        unlockWithRecovery={async () => {
          await wait(120);
          return result(outcome, 'Incorrect passphrase.');
        }}
      />
    </MockAuthProvider>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
