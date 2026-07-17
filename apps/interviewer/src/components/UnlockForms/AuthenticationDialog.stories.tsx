import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import type { AuthMode } from '~/lib/auth/api';
import { MockAuthProvider } from '~/lib/auth/MockAuthProvider';

import { AuthenticationDialog } from './AuthenticationDialog';

const withAuthMode =
  (mode: AuthMode, kind: 'locked' | 'unlocked' = 'locked'): Decorator =>
  (Story) => (
    <MockAuthProvider value={{ kind, mode }}>
      <Story />
    </MockAuthProvider>
  );

const meta = {
  title: 'Auth/AuthenticationDialog',
  component: AuthenticationDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {
        inline: false,
        height: '42rem',
      },
      description: {
        component: `
The shared authentication dialog used for both mandatory app unlocks and cancellable identity checks. It reads the enrolled authentication method and lock state from \`AuthContext\`, so callers provide only contextual copy and recovery/cancellation policy.

\`\`\`tsx
<AuthenticationDialog
  title="Welcome back"
  description="Authenticate to unlock and pick up where you left off."
  allowRecovery
/>
\`\`\`

- \`title\` and \`description\` are the only context-specific copy.
- \`showCancel\` adds an explicit Cancel action and enables all standard dialog dismissal paths.
- \`allowRecovery\` offers passphrase recovery for biometric authentication, or destructive reset recovery for PIN/passphrase authentication.
- \`allowDestructiveRecovery\` can suppress every reset action while preserving biometric passphrase recovery.
- Biometric authentication is attempted automatically when the platform supports it.
        `,
      },
    },
  },
  args: {
    open: true,
    title: 'Welcome back',
    description: 'Authenticate to unlock and pick up where you left off.',
    showCancel: false,
    allowRecovery: true,
    allowDestructiveRecovery: true,
  },
  argTypes: {
    showCancel: {
      description:
        'Show a Cancel action and allow Escape, close-button, and backdrop dismissal.',
      table: { type: { summary: 'boolean' } },
    },
    onCancel: {
      control: false,
      description:
        'Handles every dismissal path. Required when showCancel is true.',
      table: { type: { summary: '() => void' } },
    },
    onAuthenticated: { control: false },
    allowDestructiveRecovery: {
      description:
        'Allow recovery actions that permanently reset app data. Passphrase recovery remains available when false.',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
  },
} satisfies Meta<typeof AuthenticationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WelcomeBack: Story = {
  decorators: [withAuthMode('pin')],
};

export const ConfirmIdentity: Story = {
  args: {
    title: 'Confirm your identity',
    description: 'Authenticate to continue.',
    showCancel: true,
    onCancel: fn(),
  },
  decorators: [withAuthMode('pin', 'unlocked')],
};

export const Passphrase: Story = {
  decorators: [withAuthMode('passphrase')],
};

export const Biometric: Story = {
  decorators: [withAuthMode('biometric')],
};

export const WithoutRecovery: Story = {
  args: {
    allowRecovery: false,
  },
  decorators: [withAuthMode('pin')],
};

export const WithoutDestructiveRecovery: Story = {
  args: {
    allowDestructiveRecovery: false,
  },
  decorators: [withAuthMode('biometric')],
};

export const LongDescription: Story = {
  args: {
    description:
      'Authenticate to unlock this device and return to your work. Your interview data remains stored locally and is not sent anywhere when you authenticate.',
  },
  decorators: [withAuthMode('pin')],
};
