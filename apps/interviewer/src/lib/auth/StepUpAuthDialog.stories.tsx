import type { Meta, StoryObj } from '@storybook/react-vite';

import { MockAuthProvider } from './MockAuthProvider';
import { StepUpAuthDialogView } from './StepUpAuthDialog';

// The step-up re-auth dialog verifies without changing the app's lock state.
type Outcome = 'success' | 'failure';
type StoryArgs = {
  mode: 'pin' | 'passphrase' | 'biometric';
  outcome: Outcome;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const result = (o: Outcome, msg: string) =>
  o === 'success' ? { ok: true } : { ok: false, message: msg };
const makeVerify = (outcome: Outcome, msg: string) => async () => {
  await wait(120);
  return result(outcome, msg);
};

const meta: Meta<StoryArgs> = {
  title: 'Auth/StepUpAuthDialog',
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
    <MockAuthProvider
      value={{
        kind: 'unlocked',
        mode,
        verifyWithPin: makeVerify(outcome, 'Incorrect PIN.'),
        verifyWithPassphrase: makeVerify(outcome, 'Incorrect passphrase.'),
        verifyBiometric: makeVerify(outcome, 'Verification failed.'),
        verifyWithRecovery: makeVerify(outcome, 'Incorrect passphrase.'),
      }}
    >
      <StepUpAuthDialogView open onResolve={() => {}} onCancel={() => {}} />
    </MockAuthProvider>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
