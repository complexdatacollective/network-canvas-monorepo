import type { Meta, StoryObj } from '@storybook/react-vite';

import { StepUpAuthDialogView } from './StepUpAuthDialog';

// The step-up re-auth dialog (verify without relocking). Routes by `mode`;
// biometric offers a recovery fallback and, when `limited`, starts on recovery.
type Outcome = 'success' | 'failure';
type StoryArgs = {
  mode: 'pin' | 'passphrase' | 'biometric';
  outcome: Outcome;
  limited: boolean;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const result = (o: Outcome, msg: string) =>
  o === 'success' ? { ok: true } : { ok: false, message: msg };

const meta: Meta<StoryArgs> = {
  title: 'Auth/StepUpAuthDialog',
  parameters: { layout: 'fullscreen' },
  args: { mode: 'pin', outcome: 'success', limited: false },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['pin', 'passphrase', 'biometric'],
    },
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
    limited: { control: 'boolean' },
  },
  render: ({ mode, outcome, limited }) => (
    <StepUpAuthDialogView
      mode={mode}
      open
      limited={limited}
      onResolve={() => {}}
      onCancel={() => {}}
      verifyWithPin={async () => (
        await wait(120),
        result(outcome, 'Incorrect PIN.')
      )}
      verifyWithPassphrase={async () => (
        await wait(120),
        result(outcome, 'Incorrect passphrase.')
      )}
      verifyBiometric={async () => (
        await wait(120),
        result(outcome, 'Verification failed.')
      )}
      verifyWithRecovery={async () => (
        await wait(120),
        result(outcome, 'Incorrect passphrase.')
      )}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
