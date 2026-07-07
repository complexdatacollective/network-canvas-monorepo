import type { Meta, StoryObj } from '@storybook/react-vite';

import type { AuthMode } from '~/lib/auth/api';

import { StatusRowView } from './StatusRow';

// The dashboard's bottom-of-screen footer: protocol/interview counts, the
// enrolled security mode, storage-persistence durability, and the app
// version. The default export (StatusRow) reads the mode from useAuth and
// polls storage.ts on mount/focus; StatusRowView is the pure presentation.

type StoryArgs = {
  protocolCount: number;
  interviewCount: number;
  mode: AuthMode;
  persisted: boolean;
  usage: number;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/StatusRow',
  args: {
    protocolCount: 3,
    interviewCount: 12,
    mode: 'pin',
    persisted: true,
    usage: 4.2 * 1024 * 1024,
  },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['none', 'pin', 'passphrase', 'biometric'],
    },
    persisted: {
      control: 'boolean',
      description: 'navigator.storage.persisted(), polled by the container',
    },
    usage: { control: 'number', description: 'Bytes reported by estimate()' },
  },
  render: ({ protocolCount, interviewCount, mode, persisted, usage }) => (
    <StatusRowView
      protocolCount={protocolCount}
      interviewCount={interviewCount}
      mode={mode}
      durability={{ persisted, usage }}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

export const NotEncryptedNotPersisted: Story = {
  args: { mode: 'none', persisted: false },
};
