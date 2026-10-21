import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { showProtocolInfo } from './protocolInfoDialog';

// The details dialog of a stored protocol, opened through the app's dialog
// host.

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

function DialogStory() {
  const { openDialog } = useDialog();
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-4">
      <Button
        color="primary"
        onClick={() => void showProtocolInfo(openDialog, protocol)}
      >
        Open dialog
      </Button>
    </div>
  );
}

const meta: Meta<typeof DialogStory> = {
  title: 'Components/ProtocolInfoDialog',
  component: DialogStory,
};

export default meta;
type Story = StoryObj<typeof DialogStory>;

export const ProtocolInfo: Story = {};
