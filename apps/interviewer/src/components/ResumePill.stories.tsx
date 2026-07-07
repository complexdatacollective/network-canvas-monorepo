import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StoredSessionLite } from '~/lib/db/types';

import { ResumePillView } from './ResumePill';

// The "resume last interview" pill overlaid on Home's header. The default
// export (ResumePill) picks the most-recently-updated in-progress session
// out of `sessions` and wires navigation + lastActiveSessionId persistence;
// ResumePillView is the pure presentation for that one session.

const SAMPLE_SESSION: StoredSessionLite = {
  id: 'session-1',
  protocolHash: 'hash-1',
  protocolName: 'Community Ties',
  caseId: 'P-104',
  startedAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
  finishedAt: null,
  exportedAt: null,
  currentStep: 3,
  statusKind: 'in-progress',
  progressPercent: 40,
};

type StoryArgs = {
  protocolName: string;
  caseId: string;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/ResumePill',
  args: {
    protocolName: SAMPLE_SESSION.protocolName,
    caseId: SAMPLE_SESSION.caseId,
  },
  render: ({ protocolName, caseId }) => (
    <ResumePillView
      session={{ ...SAMPLE_SESSION, protocolName, caseId }}
      onResume={() => {}}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

export const UntitledCase: Story = {
  args: { caseId: '' },
};
