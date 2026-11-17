import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { expect, fireEvent, waitFor, within } from 'storybook/test';

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
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {},
    stages: [],
  };
  return {
    id: `story-${name}`,
    hash: `hash-${name}`,
    name,
    schemaVersion: 9,
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
  const {
    getRootProps: getImportRootProps,
    getInputProps: getImportInputProps,
    isDragActive: isImportDragActive,
    open: openImportDialog,
  } = useDropzone({
    onDrop: () => {},
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

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
      onActivate: openImportDialog,
      render: (_isActive: boolean, activate: () => void) => (
        <ImportTriggerCard
          onActivate={activate}
          getRootProps={getImportRootProps}
          getInputProps={getImportInputProps}
          isDragActive={isImportDragActive}
        />
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

const centreOf = (element: Element) => {
  const { left, width } = element.getBoundingClientRect();
  return left + width / 2;
};

/** One frame, which is how often a drag is read. */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

/**
 * Drags a pointer across the deck: `distance` pixels to the right, or to the
 * left when negative. The pointer is held still before it is let go, so this
 * is a drag and not a flick: a flick carries the deck on past where it was
 * dragged to, by an amount that depends on how fast the frames came. With
 * `flick` it is let go while still moving.
 */
async function dragDeck(
  deck: HTMLElement,
  distance: number,
  { flick = false }: { flick?: boolean } = {},
) {
  const { left, top, width, height } = deck.getBoundingClientRect();
  const from = { x: left + width / 2, y: top + height / 2 };
  const pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true };
  await fireEvent.pointerDown(deck, {
    ...pointer,
    button: 0,
    buttons: 1,
    clientX: from.x,
    clientY: from.y,
  });
  const steps = 8;
  for (let step = 1; step <= steps; step++) {
    await fireEvent.pointerMove(window, {
      ...pointer,
      buttons: 1,
      clientX: from.x + (distance * step) / steps,
      clientY: from.y,
    });
    await nextFrame();
  }
  const framesHeld = flick ? 0 : 12;
  for (let held = 0; held < framesHeld; held++) {
    await fireEvent.pointerMove(window, {
      ...pointer,
      buttons: 1,
      clientX: from.x + distance,
      clientY: from.y,
    });
    await nextFrame();
  }
  await fireEvent.pointerUp(window, {
    ...pointer,
    button: 0,
    clientX: from.x + distance,
    clientY: from.y,
  });
}

/**
 * In a right-to-left language the deck is the mirror image of itself: the
 * card after the one in front is to its left, and a drag or a sideways
 * scroll moves along the deck the same way round.
 */
export const RightToLeft: Story = {
  globals: { appDirection: 'rtl' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.ownerDocument.documentElement.dir).toBe('rtl');
    const first = await canvas.findByText('Friendship Ties');
    const second = canvas.getByText('Social Support Networks');
    await canvas.findByText('Card 1 of 4');

    await waitFor(() =>
      expect(centreOf(second)).toBeLessThan(centreOf(first) - 100),
    );

    // The deck is the cards' own positioned parent.
    const deck = first.closest<HTMLElement>('.touch-pan-y');
    if (!deck) throw new Error('The cards are not in a deck');

    // Dragged to the right, the deck brings on the card from the left: the
    // next one.
    await dragDeck(deck, 200);
    await canvas.findByText('Card 2 of 4');

    // A scroll to the right goes back along it.
    await fireEvent.wheel(deck, { deltaX: 60, deltaY: 0 });
    await canvas.findByText('Card 1 of 4');

    // A flick to the right, too short to reach the next card as a drag,
    // carries the deck on to it or past it.
    await dragDeck(deck, 60, { flick: true });
    await waitFor(() =>
      expect(canvas.queryByText('Card 1 of 4')).not.toBeInTheDocument(),
    );
  },
};
