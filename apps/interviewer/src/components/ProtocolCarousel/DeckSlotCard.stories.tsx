import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';

import type { DeckEntry } from './deckEntries';
import { DeckSlotCard } from './DeckSlotCard';

// DeckSlotCard is the single entry point every carousel slot renders
// through, regardless of the entry's kind (protocol / sample / pending
// import) — see the component's own doc comment for why. This story
// exercises each kind by switching a `kind` control, which produces a
// distinct `DeckEntry` for the render function below. The `newSession`
// state (case-ID form takes over the footer) is covered on
// DeckCard.stories.tsx's `CaseIdFormLayout` instead, since it needs the same
// stand-in footer there (NewSessionForm requires app providers this story
// can't host).

type ProtocolOverrides = {
  name?: string;
  description?: string;
  hash?: string;
  importedAt?: string;
};

function makeProtocol({
  name = 'Social Support Networks',
  description = 'A study exploring the structure of personal support networks among recent migrants.',
  hash = 'story-protocol-hash',
  importedAt = '2026-05-20T10:00:00.000Z',
}: ProtocolOverrides = {}): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description,
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };

  return {
    id: 'story-protocol',
    hash,
    name,
    schemaVersion: 8,
    importedAt,
    description,
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

// Resizable frame matching DeckCard.stories.tsx: the deck renders every
// slot at a 1/1 aspect ratio, and the card's `@container` layout responds
// to the frame's content-box width.
function ResizableFrame({
  size = 480,
  children,
}: {
  size?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="ring-outline/40 resize overflow-hidden ring-2"
      style={{ width: size, height: size, minWidth: 140, minHeight: 140 }}
    >
      {children}
    </div>
  );
}

type StoryArgs = {
  kind: 'protocol' | 'sample' | 'development' | 'pending';
  isActive: boolean;
  sessionCount: number;
  size: number;
  progress: number;
};

function entryForKind(
  kind: StoryArgs['kind'],
  progress: number,
): Exclude<DeckEntry, { kind: 'import' }> {
  switch (kind) {
    case 'protocol':
      return { kind: 'protocol', protocol: makeProtocol() };
    case 'sample':
      return { kind: 'sample' };
    case 'development':
      return { kind: 'development' };
    case 'pending':
      return {
        kind: 'pending',
        pending: {
          id: 'story-pending',
          label: 'Imported Protocol',
          source: 'file',
          phase: 'extracting',
          progress,
        },
      };
  }
}

const meta: Meta<StoryArgs> = {
  title: 'Components/DeckSlotCard',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The dispatcher every carousel slot renders through. Switch `kind` ' +
          'to see the protocol, sample-teaser, and pending-import presentations.',
      },
    },
  },
  args: {
    kind: 'protocol',
    isActive: true,
    sessionCount: 3,
    size: 480,
    progress: 0.5,
  },
  argTypes: {
    kind: {
      control: 'inline-radio',
      options: ['protocol', 'sample', 'development', 'pending'],
      description: 'Which DeckEntry kind fills this slot',
    },
    isActive: {
      control: 'boolean',
      description: 'Active slots show the accent ring + footer action',
    },
    sessionCount: { control: { type: 'number', min: 0 } },
    size: { control: { type: 'range', min: 140, max: 720, step: 4 } },
    progress: {
      control: { type: 'range', min: 0, max: 1, step: 0.05 },
      description: 'Pending-import progress fraction (kind="pending" only)',
    },
  },
  render: ({ kind, isActive, sessionCount, size, progress }) => (
    <ResizableFrame size={size}>
      <DeckSlotCard
        entry={entryForKind(kind, progress)}
        isActive={isActive}
        activate={() => {}}
        sessionCount={sessionCount}
        onDeleteProtocol={() => {}}
        onDismissSample={() => {}}
        onInstallSample={() => {}}
        onInstallDevelopment={() => {}}
      />
    </ResizableFrame>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

/**
 * Switch `kind` in the controls panel to move between the protocol slot's
 * Start-interview footer, the sample teaser's Install footer, and the
 * pending-import progress footer.
 */
export const Default: Story = {};

export const SampleTeaser: Story = {
  args: { kind: 'sample' },
};

/**
 * The dev-only Development-protocol teaser: same ghost presentation as the
 * sample card (loading style, install footer) but with no dismiss control —
 * it only ever renders in development builds.
 */
export const DevelopmentTeaser: Story = {
  args: { kind: 'development' },
};

export const PendingImport: Story = {
  args: { kind: 'pending', progress: 0.65 },
};
