import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';
import type { LegacyInterviewerOffline } from '~/lib/pwa/legacyInterviewerOffline';

import type { DeckEntry } from './deckEntries';
import { DeckSlotCard, type Schema8CardActions } from './DeckSlotCard';

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
  geospatial?: boolean;
};

function makeProtocol({
  name = 'Social Support Networks',
  description = 'A study exploring the structure of personal support networks among recent migrants.',
  hash = 'story-protocol-hash',
  importedAt = '2026-05-20T10:00:00.000Z',
  geospatial = false,
}: ProtocolOverrides = {}): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description,
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {},
    // Only its type matters here: a Geospatial stage needs the internet.
    stages: geospatial
      ? [{ id: 'map', type: 'Geospatial' } as CurrentProtocol['stages'][number]]
      : [],
  };

  return {
    id: 'story-protocol',
    hash,
    name,
    schemaVersion: 9,
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
  kind: 'protocol' | 'schema8' | 'sample' | 'development' | 'pending';
  isActive: boolean;
  sessionCount: number;
  size: number;
  progress: number;
  // kind="schema8" only: a schema 8 protocol, whose interviews run in the
  // bundled Interviewer 8.
  legacyBundled: boolean;
  legacyOffline: Exclude<LegacyInterviewerOffline, 'not-bundled'>;
  // kind="protocol" or "schema8": the protocol has a stage that needs the
  // internet.
  geospatial: boolean;
};

const schema8Actions = (
  bundled: boolean,
  offline: StoryArgs['legacyOffline'],
): Schema8CardActions => ({
  interviewer: bundled ? { version: '8.5.0', path: '/v8/' } : null,
  offline: bundled ? offline : 'not-bundled',
  onShowInfo: () => {},
});

function entryForKind(
  kind: StoryArgs['kind'],
  progress: number,
  sessionCount: number,
  geospatial: boolean,
): Exclude<DeckEntry, { kind: 'import' }> {
  switch (kind) {
    case 'protocol':
      return { kind: 'protocol', protocol: makeProtocol({ geospatial }) };
    case 'schema8': {
      const { id, hash, name, description, importedAt } = makeProtocol({
        name: 'Wave One Support Networks',
      });
      return {
        kind: 'protocol',
        protocol: {
          id,
          hash,
          name,
          description,
          importedAt,
          schemaVersion: 8,
          codebook: {},
          protocol: {
            name,
            schemaVersion: 8,
            codebook: {},
            stages: geospatial
              ? [{ id: 'map', type: 'Geospatial', label: 'Map' }]
              : [],
          },
          sessionCount,
        },
      };
    }
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
    legacyBundled: true,
    legacyOffline: 'ready',
    geospatial: false,
  },
  argTypes: {
    kind: {
      control: 'inline-radio',
      options: ['protocol', 'schema8', 'sample', 'development', 'pending'],
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
    legacyBundled: {
      control: 'boolean',
      description: 'Whether this build bundles Interviewer 8 (kind="schema8")',
    },
    legacyOffline: {
      control: 'inline-radio',
      options: ['checking', 'ready', 'not-ready'],
      description: 'Interviewer 8 offline readiness (kind="schema8")',
    },
  },
  render: ({
    kind,
    isActive,
    sessionCount,
    size,
    progress,
    legacyBundled,
    legacyOffline,
    geospatial,
  }) => (
    <ResizableFrame size={size}>
      <DeckSlotCard
        entry={entryForKind(kind, progress, sessionCount, geospatial)}
        isActive={isActive}
        activate={() => {}}
        sessionCount={sessionCount}
        onDeleteProtocol={() => {}}
        onDismissSample={() => {}}
        onInstallSample={() => {}}
        onInstallDevelopment={() => {}}
        schema8={schema8Actions(legacyBundled, legacyOffline)}
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

/** A protocol with a stage that always needs the internet. */
export const RequiresInternet: Story = {
  args: { geospatial: true },
};

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

/**
 * A schema 8 protocol: a protocol card like any other, with its schema badge
 * and a menu (Info, Delete) in place of Delete. Start
 * opens the normal new-interview form; the interview runs in Interviewer 8.
 */
export const SchemaEightProtocol: Story = {
  args: { kind: 'schema8' },
};

/**
 * Interviewer 8 is not yet saved for offline use, so the protocol cannot be
 * used offline yet: a status icon in the schema badge says so.
 */
export const SchemaEightNotReadyOffline: Story = {
  args: { kind: 'schema8', legacyOffline: 'not-ready' },
};

/** The same, for a protocol that needs the internet for its own stages too. */
export const SchemaEightGeospatialNotReadyOffline: Story = {
  args: { kind: 'schema8', legacyOffline: 'not-ready', geospatial: true },
};

/** This build has no Interviewer 8: no interview can be started. */
export const SchemaEightUnavailable: Story = {
  args: { kind: 'schema8', legacyBundled: false },
};
