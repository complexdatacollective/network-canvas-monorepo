import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { ProtocolWithCounts } from '~/lib/db/types';

import {
  chooseImportRoute,
  confirmProtocolUpgrade,
  showLegacyProtocolInfo,
} from './legacyProtocolDialogs';

// The dialogs for a protocol made for an older schema. Each story opens one
// through the app's dialog host and shows what it answered.

const protocol: ProtocolWithCounts = {
  id: 'story-legacy',
  hash: 'story-legacy-hash',
  name: 'Wave One Support Networks',
  description:
    'A study exploring the structure of personal support networks among recent migrants.',
  schemaVersion: 8,
  importedAt: '2025-11-02T10:00:00.000Z',
  lastModified: '2025-10-28T16:30:00.000Z',
  codebook: {},
  protocol: {
    name: 'Wave One Support Networks',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  },
  sessionCount: 14,
};

type Which = 'upgrade-file' | 'import-choice' | 'info';

function DialogStory({
  which,
  fromVersion,
  legacyInterviewerBundled,
}: {
  which: Which;
  fromVersion: number;
  legacyInterviewerBundled: boolean;
}) {
  const { openDialog } = useDialog();
  const [answer, setAnswer] = useState<string>('');
  const open = async () => {
    switch (which) {
      case 'upgrade-file':
        setAnswer(
          String(
            await confirmProtocolUpgrade(openDialog, {
              fromVersion,
              legacyInterviewerBundled,
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
  args: {
    which: 'upgrade-file',
    fromVersion: 8,
    legacyInterviewerBundled: true,
  },
  argTypes: {
    which: {
      control: 'inline-radio',
      options: ['upgrade-file', 'import-choice', 'info'],
    },
    fromVersion: {
      control: 'inline-radio',
      options: [7, 8],
      description: 'The older protocol’s schema version',
    },
    legacyInterviewerBundled: {
      control: 'boolean',
      description: 'Whether this build includes Interviewer 8',
    },
  },
};

export default meta;
type Story = StoryObj<typeof DialogStory>;

/**
 * Upgrade a schema 8 file being imported, after the import choice: that it
 * imports a copy and leaves the file unchanged, and the notes.
 */
export const UpgradeFile: Story = {};

/** Upgrade an older file being imported: every step's notes from schema 7. */
export const UpgradeFileFromSchema7: Story = {
  args: { fromVersion: 7 },
};

/**
 * A build without Interviewer 8: a file skips the import choice, so this
 * dialog gives the schema intro and the caution itself.
 */
export const UpgradeFileWithoutInterviewer8: Story = {
  args: { legacyInterviewerBundled: false },
};

/** An older file being imported: keep it on schema 8, or upgrade it. */
export const ImportChoice: Story = {
  args: { which: 'import-choice' },
};

export const ProtocolInfo: Story = {
  args: { which: 'info' },
};
