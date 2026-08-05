import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

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
  installed: boolean;
  usage: number;
  version: string;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/StatusRow',
  args: {
    protocolCount: 3,
    interviewCount: 12,
    mode: 'pin',
    persisted: true,
    installed: false,
    usage: 4.2 * 1024 * 1024,
    version: '0.0.0',
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
    installed: {
      control: 'boolean',
      description:
        'Running as an installed/standalone app (isRunningInstalled()). ' +
        'When storage is not persisted, installed swaps the warning for a ' +
        'calm "best effort" state — there is no install action left to take.',
    },
    usage: { control: 'number', description: 'Bytes reported by estimate()' },
    version: {
      control: 'text',
      description: 'Fixed story fixture; production reads the package version',
    },
  },
  render: ({
    protocolCount,
    interviewCount,
    mode,
    persisted,
    installed,
    usage,
    version,
  }) => (
    <StatusRowView
      protocolCount={protocolCount}
      interviewCount={interviewCount}
      mode={mode}
      durability={{ persisted, usage }}
      installed={installed}
      versionSlot={<span>Interviewer {version}</span>}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Interviewer 0.0.0')).toBeVisible();
  },
};

export const NotEncryptedNotPersisted: Story = {
  args: { mode: 'none', persisted: false },
};

// Safari decides persist() from opaque interaction heuristics and may never
// grant it to an installed app (#886) — installed-but-not-persisted is the
// steady state there, presented without warning styling.
export const InstalledBestEffort: Story = {
  args: { persisted: false, installed: true },
};
