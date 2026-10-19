import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { LegacyProtocolSummary } from '~/lib/db/legacyLibrary';

import {
  chooseImportRoute,
  confirmProtocolUpgrade,
  showHandoffFailed,
  showLegacyProtocolInfo,
} from './legacyProtocolDialogs';

// The dialogs for a protocol made for an older schema. Each story opens one
// through the app's dialog host and shows what it answered.

const protocol: LegacyProtocolSummary = {
  id: 'story-legacy',
  hash: 'story-legacy-hash',
  name: 'Wave One Support Networks',
  description:
    'A study exploring the structure of personal support networks among recent migrants.',
  schemaVersion: 8,
  importedAt: '2025-11-02T10:00:00.000Z',
  lastModified: '2025-10-28T16:30:00.000Z',
  sessionCount: 14,
};

type Which = 'upgrade-library' | 'upgrade-file' | 'import-choice' | 'info';

function DialogStory({
  which,
  fromVersion,
}: {
  which: Which | 'handoff-failed';
  fromVersion: number;
}) {
  const { openDialog } = useDialog();
  const [answer, setAnswer] = useState<string>('');
  const open = async () => {
    switch (which) {
      case 'upgrade-library':
      case 'upgrade-file':
        setAnswer(
          String(
            await confirmProtocolUpgrade(openDialog, {
              fromVersion,
              source: which === 'upgrade-file' ? 'file' : 'legacy-library',
            }),
          ),
        );
        return;
      case 'import-choice':
        setAnswer(
          String(
            await chooseImportRoute(openDialog, { schemaVersion: fromVersion }),
          ),
        );
        return;
      case 'info':
        await showLegacyProtocolInfo(openDialog, protocol);
        return;
      case 'handoff-failed':
        await showHandoffFailed(openDialog);
    }
  };
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-4">
      <Button color="primary" onClick={() => void open()}>
        Open dialog
      </Button>
      <output className="font-monospace text-sm">{answer}</output>
    </div>
  );
}

const meta: Meta<typeof DialogStory> = {
  title: 'Components/LegacyProtocolDialogs',
  component: DialogStory,
  args: { which: 'upgrade-library', fromVersion: 8 },
  argTypes: {
    which: {
      control: 'inline-radio',
      options: [
        'upgrade-library',
        'upgrade-file',
        'import-choice',
        'info',
        'handoff-failed',
      ],
    },
    fromVersion: {
      control: 'inline-radio',
      options: [7, 8],
      description: 'The older protocol’s schema version',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DialogStory>;

/** Upgrade a schema 8 protocol from Interviewer 8's library: the notes. */
export const UpgradeFromLibrary: Story = {};

/** Upgrade an older file being imported: every step's notes from schema 7. */
export const UpgradeFileFromSchema7: Story = {
  args: { which: 'upgrade-file', fromVersion: 7 },
};

/** An older file being imported: keep it on schema 8, or upgrade it. */
export const ImportChoice: Story = {
  args: { which: 'import-choice' },
};

export const ProtocolInfo: Story = {
  args: { which: 'info' },
};

export const HandoffFailed: Story = {
  args: { which: 'handoff-failed' },
};
