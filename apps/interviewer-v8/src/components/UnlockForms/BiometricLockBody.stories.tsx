import type { Meta, StoryObj } from '@storybook/react-vite';

import { MockAuthProvider } from '~/lib/auth/MockAuthProvider';

import { BiometricLockBody } from './BiometricLockBody';

// The biometric lock dialog. Normally shows a "Unlock with biometrics" button
// with a "Use recovery passphrase" fallback; when `limited` (macOS Chromium
// installed PWA) it starts on the recovery passphrase with a "Try biometrics
// anyway" escape. The Dialog portals to document.body.
type Outcome = 'success' | 'failure';
type StoryArgs = { limited: boolean; outcome: Outcome };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/BiometricLockBody',
  parameters: { layout: 'fullscreen' },
  args: { limited: false, outcome: 'success' },
  argTypes: {
    limited: {
      control: 'boolean',
      description: 'macOS-Chromium installed-PWA state (recovery-first)',
    },
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
  },
  render: ({ limited, outcome }) => (
    <MockAuthProvider>
      <BiometricLockBody
        limited={limited}
        unlockWithBiometric={async () => {
          await wait(150);
          return outcome === 'success'
            ? { ok: true }
            : { ok: false, message: 'Biometric attempt failed.' };
        }}
        unlockWithRecovery={async () => {
          await wait(150);
          return outcome === 'success'
            ? { ok: true }
            : { ok: false, message: 'Incorrect passphrase.' };
        }}
      />
    </MockAuthProvider>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const MacChromiumLimited: Story = { args: { limited: true } };
