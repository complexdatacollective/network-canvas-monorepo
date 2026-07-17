import type { Meta, StoryObj } from '@storybook/react-vite';

import Button from '@codaco/fresco-ui/Button';

import {
  AuthenticationDialog,
  type AuthenticationDialogCopy,
} from './AuthenticationDialog';

const welcomeBackCopy: AuthenticationDialogCopy = {
  title: 'Welcome back',
  pinDescription: 'Enter your PIN to unlock and pick up where you left off.',
  passphraseDescription:
    'Enter your passphrase to unlock and pick up where you left off.',
  biometricDescription:
    'Authenticate to unlock and pick up where you left off.',
  recoveryDescription: 'Enter your recovery passphrase to unlock.',
  limitedRecoveryDescription:
    "Biometric unlock isn't available in the installed app on macOS. Enter your recovery passphrase to unlock.",
};

const confirmIdentityCopy: AuthenticationDialogCopy = {
  title: 'Confirm your identity',
  pinDescription: 'Enter your PIN to continue.',
  passphraseDescription: 'Enter your passphrase to continue.',
  biometricDescription: 'Authenticate to continue.',
  recoveryDescription: 'Enter your recovery passphrase to continue.',
  limitedRecoveryDescription:
    "Biometric unlock isn't available in the installed app on macOS. Enter your recovery passphrase to continue.",
};

const authenticateSuccessfully = async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { ok: true } as const;
};

const meta = {
  title: 'Auth/AuthenticationDialog',
  component: AuthenticationDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
The single authentication dialog used for both the mandatory first-load unlock and cancellable identity checks.

\`\`\`tsx
<AuthenticationDialog
  mode="pin"
  open
  copy={copy}
  authenticateWithPin={verifyWithPin}
  authenticateWithPassphrase={verifyWithPassphrase}
  authenticateBiometric={verifyBiometric}
  authenticateWithRecovery={verifyWithRecovery}
/>
\`\`\`

- \`mode\` selects the PIN, passphrase, or biometric/recovery controls.
- \`copy\` changes only the contextual title and descriptions.
- Supplying \`onCancel\` makes the dialog dismissible; omitting it creates the mandatory lock screen.
- \`secondaryAction\` occupies the fixed left footer slot used for reset or cancellation.
- \`autoAttemptBiometric\` enables the first-load best-effort biometric prompt.
- \`limited\` starts biometric mode on recovery when the installed app cannot reach the enrolled passkey.
        `,
      },
    },
  },
  args: {
    mode: 'pin',
    open: true,
    copy: welcomeBackCopy,
    authenticateWithPin: authenticateSuccessfully,
    authenticateWithPassphrase: authenticateSuccessfully,
    authenticateBiometric: authenticateSuccessfully,
    authenticateWithRecovery: authenticateSuccessfully,
    autoAttemptBiometric: false,
    limited: false,
    secondaryAction: (
      <Button type="button" color="secondary" className="mr-auto">
        Reset app data
      </Button>
    ),
  },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['pin', 'passphrase', 'biometric', 'none'],
    },
    copy: { control: 'object' },
    onCancel: { control: false },
    onAuthenticated: { control: false },
    authenticateWithPin: { control: false },
    authenticateWithPassphrase: { control: false },
    authenticateBiometric: { control: false },
    authenticateWithRecovery: { control: false },
    secondaryAction: { control: false },
  },
  render: (args) => (
    <AuthenticationDialog
      key={`${args.mode}-${String(args.limited)}-${args.copy.title}`}
      {...args}
    />
  ),
} satisfies Meta<typeof AuthenticationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WelcomeBack: Story = {};

export const ConfirmIdentity: Story = {
  args: {
    copy: confirmIdentityCopy,
    onCancel: () => {},
    secondaryAction: (
      <Button type="button" color="secondary" className="mr-auto">
        Cancel
      </Button>
    ),
  },
};

export const Biometric: Story = {
  args: { mode: 'biometric' },
};

export const RecoveryFallback: Story = {
  args: { mode: 'biometric', limited: true },
};

export const LongDescription: Story = {
  args: {
    copy: {
      ...welcomeBackCopy,
      pinDescription:
        'Enter your PIN to unlock this device and return to your work. Your interview data remains stored locally and is not sent anywhere when you authenticate.',
    },
  },
};
