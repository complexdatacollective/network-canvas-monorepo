import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { DeckCard } from './DeckCard';

// DeckCard is "the protocol card" — the card the user sees for each imported
// protocol in the deck. Its entire internal layout (heading size, meta row,
// description line-clamp, Start/Delete button row) is driven by `@container`
// queries against the card's OWN width, so these stories deliberately size the
// card via a resizable frame rather than the viewport. Drag the bottom-right
// corner of the frame (or use the BreakpointMatrix story) to exercise every
// container breakpoint.

// A minimal but type-correct protocol. DeckCard only reads `name`, `hash`,
// `description`, and `importedAt`, but `ProtocolWithCounts` requires the full
// shape — so we build a valid (empty) v8 protocol to satisfy the types without
// any `as` casts.
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

// Resizable frame so the card's container queries can be exercised by dragging
// the native bottom-right resize handle. The card is `h-full w-full`, so the
// frame's content box is exactly the card's container width.
function ResizableFrame({
  width = 360,
  height = 520,
  children,
}: {
  width?: number;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="ring-outline/40 resize overflow-hidden rounded-[28px] ring-2"
      style={{ width, height, minWidth: 140, minHeight: 220 }}
    >
      {children}
    </div>
  );
}

type StoryArgs = {
  name: string;
  description: string;
  importedAt: string;
  isActive: boolean;
  sessionCount: number;
  width: number;
  height: number;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/ProtocolCard',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The protocol card (`DeckCard`) shown for each imported protocol in ' +
          'the deck. Layout is driven entirely by `@container` queries against ' +
          'the card width — resize the frame to see the responsive tiers.',
      },
    },
  },
  args: {
    name: 'Social Support Networks',
    description:
      'A study exploring the structure of personal support networks among recent migrants.',
    importedAt: '2026-05-20T10:00:00.000Z',
    isActive: true,
    sessionCount: 3,
    width: 360,
    height: 520,
  },
  argTypes: {
    name: { control: 'text', description: 'Protocol name (heading + seed)' },
    description: { control: 'text', description: 'Protocol description' },
    importedAt: {
      control: 'text',
      description: 'ISO import timestamp (rendered via TimeAgo)',
    },
    isActive: {
      control: 'boolean',
      description: 'Active cards show the accent ring + Start/Delete row',
    },
    sessionCount: { control: { type: 'number', min: 0 } },
    width: { control: { type: 'range', min: 140, max: 720, step: 4 } },
    height: { control: { type: 'range', min: 220, max: 720, step: 4 } },
  },
  render: ({
    name,
    description,
    importedAt,
    isActive,
    sessionCount,
    width,
    height,
  }) => (
    <ResizableFrame width={width} height={height}>
      <DeckCard
        protocol={makeProtocol({ name, description, importedAt })}
        isActive={isActive}
        sessionCount={sessionCount}
        onActivate={() => {}}
        onDelete={() => {}}
      />
    </ResizableFrame>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

/**
 * Drag the bottom-right corner of the framed card to resize it and watch the
 * `@container` breakpoints respond — heading scale, meta row visibility,
 * description line-clamp, and the Start/Delete button row layout all adapt.
 */
export const Playground: Story = {};

export const Active: Story = {
  args: { isActive: true },
};

export const Inactive: Story = {
  args: { isActive: false },
};

export const ShortDescription: Story = {
  args: {
    name: 'Friendship Ties',
    description: 'A quick two-prompt name generator.',
  },
};

export const LongDescription: Story = {
  args: {
    name: 'Community Health & Resource Access',
    description:
      'A comprehensive multi-stage protocol covering household composition, ' +
      'social support, health-service access, and community resource mapping. ' +
      'The description intentionally runs long to exercise the dynamic ' +
      'line-clamp that fits the text to whatever vertical space the card has.',
  },
};

// A fixed matrix of card widths so every container tier is visible at once —
// the quickest way to eyeball responsiveness without dragging. Heights are
// generous so the description and (when active) the button row have room.
const MATRIX_WIDTHS = [180, 240, 300, 360, 480] as const;

export const BreakpointMatrix: Story = {
  parameters: { layout: 'padded' },
  render: ({ name, description, importedAt, isActive, sessionCount }) => (
    <div className="flex flex-wrap items-start gap-6">
      {MATRIX_WIDTHS.map((w) => (
        <div key={w} className="flex flex-col items-center gap-2">
          <span className="font-monospace text-text/70 text-xs">{w}px</span>
          <div
            className="overflow-hidden rounded-[28px]"
            style={{ width: w, height: 480 }}
          >
            <DeckCard
              protocol={makeProtocol({
                name,
                description,
                importedAt,
                // Unique per card: DeckCard derives its Framer Motion
                // layoutIds from protocol.hash, so a shared hash across the
                // matrix would collide in one React tree.
                hash: `story-protocol-${w}`,
              })}
              isActive={isActive}
              sessionCount={sessionCount}
              onActivate={() => {}}
              onDelete={() => {}}
            />
          </div>
        </div>
      ))}
    </div>
  ),
};
