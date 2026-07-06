import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { DeckCard, DeckCardFooter, DeckCardFooterButton } from './DeckCard';
import { DeckCarousel, type DeckCarouselSlide } from './DeckCarousel';
import { ImportTriggerCard } from './ImportTriggerCard';

// The drag/wheel-driven fanned deck. Fixed slide content (three protocol
// cards + the import trigger) keeps the story focused on the carousel's
// OWN behaviour — position spring, fan geometry, overscroll rubber-band —
// rather than the slot-merging ProtocolDeck composes on top (see
// ProtocolDeck.stories.tsx for that). No `play` test: the interactions
// this component exists for (pointer drag, trackpad wheel, flick
// velocity) aren't something a scripted test meaningfully exercises —
// verify them by hand with the controls below (chevron buttons stand in
// for drag/wheel, which need a real pointer).

function makeProtocol(name: string, description: string): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description,
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };
  return {
    id: `story-${name}`,
    hash: `hash-${name}`,
    name,
    schemaVersion: 8,
    importedAt: '2026-05-20T10:00:00.000Z',
    description,
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

const PROTOCOLS = [
  makeProtocol('Friendship Ties', 'A quick two-prompt name generator.'),
  makeProtocol(
    'Social Support Networks',
    'A study exploring the structure of personal support networks.',
  ),
  makeProtocol(
    'Community Health Access',
    'Household composition and resource-access mapping.',
  ),
] as const;

function CarouselHarness({
  cardWidth,
  cardHeight,
}: {
  cardWidth: number;
  cardHeight: number;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const slides: DeckCarouselSlide[] = [
    ...PROTOCOLS.map((protocol) => ({
      key: protocol.hash,
      onActivate: () => {},
      render: (isActive: boolean, activate: () => void) => (
        <DeckCard
          protocol={protocol}
          isActive={isActive}
          sessionCount={0}
          onActivate={activate}
          onDelete={() => {}}
          footer={
            isActive ? (
              <DeckCardFooter key="start-interview">
                <DeckCardFooterButton onClick={() => {}}>
                  Start new interview
                </DeckCardFooterButton>
              </DeckCardFooter>
            ) : undefined
          }
        />
      ),
    })),
    {
      key: 'import',
      backdropBlur: true,
      onActivate: () => {},
      render: (_isActive: boolean, activate: () => void) => (
        <ImportTriggerCard onActivate={activate} />
      ),
    },
  ];

  return (
    <div className="flex flex-col items-center gap-6">
      <div style={{ height: cardHeight }} className="w-full">
        <DeckCarousel
          slides={slides}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          disabled={false}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
          className="border-outline rounded border px-3 py-1"
        >
          Previous
        </button>
        <span className="self-center text-sm">
          Card {activeIndex + 1} of {slides.length}
        </span>
        <button
          type="button"
          onClick={() =>
            setActiveIndex(Math.min(slides.length - 1, activeIndex + 1))
          }
          disabled={activeIndex === slides.length - 1}
          className="border-outline rounded border px-3 py-1"
        >
          Next
        </button>
      </div>
    </div>
  );
}

type StoryArgs = {
  cardWidth: number;
  cardHeight: number;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/DeckCarousel',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Drag a card (or scroll/trackpad-wheel over the deck) to travel ' +
          'between slides; the Previous/Next buttons below drive the same ' +
          'controlled `activeIndex` the chevrons in ProtocolDeck use.',
      },
    },
  },
  args: { cardWidth: 260, cardHeight: 260 },
  argTypes: {
    cardWidth: { control: { type: 'range', min: 160, max: 420, step: 4 } },
    cardHeight: { control: { type: 'range', min: 160, max: 420, step: 4 } },
  },
  render: ({ cardWidth, cardHeight }) => (
    <CarouselHarness cardWidth={cardWidth} cardHeight={cardHeight} />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
