import { Play, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { Pattern, seedToPatternPalette } from '@codaco/art';
import Button from '@codaco/fresco-ui/Button';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cva } from '@codaco/fresco-ui/utils/cva';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { getScrollTimelineCtor } from './scrollTimeline';

// Slot width = SLOT_TO_CARD_RATIO × card width. This sets both the scroll
// distance per snap AND the visual gap between adjacent cards. 0.66 reproduces
// the original fan spacing.
export const SLOT_TO_CARD_RATIO = 0.7;
const FAN_DROP_PCT = 4;
const FAN_ROTATE = 3;
// Per-offset depth (in px). With the parent's `perspective-[1800px]`,
// translateZ(-N) projects a card to (1800/(1800+N)) of its size. Cards
// further from active naturally appear behind, with no CSS scaling — the
// apparent top/bottom edges stay closer to the active card's because they
// scale toward the perspective-origin, not toward the card's own bottom.
const FAN_Z_STEP = 400;
const INACTIVE_SHADOW = '0 20px 40px oklch(0.10 0.05 281 / 0.5)';
const ACTIVE_DROP_SHADOW = '0 30px 60px oklch(0.10 0.05 281 / 0.7)';

export const cardActiveShadow = (accent: string): string =>
  `${ACTIVE_DROP_SHADOW}, 0 0 0 2px ${accent}`;

// The card's `rounded-[3rem]` resolves to 48px. Setting the same value via
// `style` (instead of just className) on the layoutId-morphing element gives
// motion a stable inline value to interpolate against — otherwise it briefly
// clears the radius to 0 at the start of the layout animation.
export const CARD_RADIUS_PX = 48;

// Subtle weighty spring — slower than motion's default, low bounce so it
// doesn't oscillate. Applied to the layout animation only so opacity fades
// (enter/exit) still feel snappy.
export const MORPH_TRANSITION = {
  layout: {
    type: 'spring',
    stiffness: 220,
    damping: 28,
    mass: 1.15,
  },
} as const;

// `shrink-0` keeps the card at its explicit pixel size; the slot is narrower
// than the card so adjacent cards visually overlap. Dimensions come in as
// inline styles from the parent — we avoid `h-[%]` + `aspect-ratio` here
// because the two together start fighting under a flex parent and collapse
// the percentage cascade.
const CARD_INNER_CLASS = 'shrink-0 origin-[center_bottom]';

// Perspective lives on a wrapper INSIDE the section (see ProtocolDeck) so
// every card shares one 3D rendering context — that's what makes
// closer-to-active cards stack in front of further-back ones via real
// 3D depth instead of DOM order. The slot itself just needs preserve-3d so
// it doesn't flatten the card's translateZ.
const SLOT_CLASS =
  'flex shrink-0 snap-center items-center justify-center transform-3d';

const cardBase = cva({
  base: [
    'cursor-pointer rounded-[3rem] text-left',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sea-green',
  ].join(' '),
});

const importCardClass = cva({
  base: [
    'flex flex-col items-center justify-center gap-3 border-[3px] border-dashed border-outline bg-surface/50 backdrop-blur-md',
    CARD_INNER_CLASS,
    'text-text/80',
  ].join(' '),
});

const protocolCardClass = cva({
  base: [
    CARD_INNER_CLASS,
    'flex flex-col overflow-hidden border-0 bg-surface-1 p-0 text-text',
  ].join(' '),
});

export type DeckEntry =
  | { kind: 'protocol'; protocol: ProtocolWithCounts }
  | { kind: 'import' };

// Builds the per-card keyframes. Keyframe k corresponds to "card k centred in
// the deck", at which point this card has integer offset (index - k). Linear
// timing between keyframes gives piecewise-linear interpolation of every
// property as the user scrolls between adjacent card centres.
function buildKeyframes(index: number, totalCards: number): Keyframe[] {
  const N = Math.max(totalCards, 1);
  return Array.from({ length: N }, (_, k) => {
    const offset = index - k;
    const absO = Math.abs(offset);
    const time = N > 1 ? k / (N - 1) : 0;
    const rotate = offset * FAN_ROTATE;
    const tz = -absO * FAN_Z_STEP;
    const y = absO * FAN_DROP_PCT;
    const opacity = absO <= 2 ? 1 : absO >= 4 ? 0 : 1 - (absO - 2) / 2;
    return {
      offset: time,
      transform: `translateY(${y}%) rotate(${rotate}deg) translateZ(${tz}px)`,
      opacity: String(opacity),
    };
  });
}

type DeckCardProps = {
  entry: DeckEntry;
  index: number;
  totalCards: number;
  sectionRef: RefObject<HTMLElement | null>;
  slotWidth: number;
  cardWidth: number;
  cardHeight: number;
  isActive: boolean;
  sessionCount: number;
  onActivate: (idx: number) => void;
};

const DeckCardInner = forwardRef<HTMLDivElement, DeckCardProps>(
  function DeckCardInner(
    {
      entry,
      index,
      totalCards,
      sectionRef,
      slotWidth,
      cardWidth,
      cardHeight,
      isActive,
      sessionCount,
      onActivate,
    },
    forwardedRef,
  ) {
    const onTap = useCallback(() => onActivate(index), [onActivate, index]);
    const slotRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLElement | null>(null);
    useImperativeHandle(forwardedRef, () => slotRef.current as HTMLDivElement);

    // The card's fan transform is driven by the browser's ScrollTimeline,
    // bound to the section's inline scroll. No JS runs per frame; the
    // animation progresses in the same composite cycle as the scroll, so the
    // visual stays in lockstep with trackpad/wheel input.
    useEffect(() => {
      const cardEl = cardRef.current;
      const sectionEl = sectionRef.current;
      if (!cardEl || !sectionEl) return;
      const Ctor = getScrollTimelineCtor();
      if (!Ctor) return;
      const timeline = new Ctor({ source: sectionEl, axis: 'inline' });
      const animation = cardEl.animate(buildKeyframes(index, totalCards), {
        timeline,
        fill: 'both',
      });
      return () => animation.cancel();
    }, [index, totalCards, sectionRef]);

    if (entry.kind === 'import') {
      return (
        <div ref={slotRef} className={SLOT_CLASS} style={{ width: slotWidth }}>
          <button
            ref={(el) => {
              cardRef.current = el;
            }}
            type="button"
            onClick={onTap}
            // Match the protocol card's shadow so the visual footprint
            // (and therefore perceived size) is identical.
            style={{
              width: cardWidth,
              height: cardHeight,
              boxShadow: INACTIVE_SHADOW,
            }}
            className={`${cardBase()} ${importCardClass()} will-change-transform`}
            aria-label="Import a protocol"
          >
            <div className="bg-surface text-sea-green inline-flex h-[84px] w-[84px] items-center justify-center rounded-full">
              <Plus size={36} strokeWidth={2.5} aria-hidden />
            </div>
            <Heading level="h2" margin="none" className="text-text font-black">
              Import a protocol
            </Heading>
            <div className="px-8 text-center text-sm">
              Add a <span className="font-monospace text-text">.netcanvas</span>{' '}
              file
            </div>
          </button>
        </div>
      );
    }

    const protocol = entry.protocol;
    const palette = seedToPatternPalette(protocol.name);
    const boxShadow = isActive
      ? cardActiveShadow(palette.backgroundTop)
      : INACTIVE_SHADOW;
    const onCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onTap();
      }
    };

    return (
      <div ref={slotRef} className={SLOT_CLASS} style={{ width: slotWidth }}>
        {/* WAAPI writes transform + opacity here for the fan effect; it sits
            above inline styles in the CSS cascade, which is why motion's
            layoutId styles cannot live on the same element. */}
        <div
          ref={(el) => {
            cardRef.current = el;
          }}
          style={{ width: cardWidth, height: cardHeight }}
          className="will-change-transform"
        >
          <motion.div
            layoutId={`active-protocol-card-${protocol.hash}`}
            role="button"
            tabIndex={0}
            onClick={onTap}
            onKeyDown={onCardKeyDown}
            style={{
              width: '100%',
              height: '100%',
              borderRadius: CARD_RADIUS_PX,
              boxShadow,
            }}
            className={`${cardBase()} ${protocolCardClass()}`}
            aria-label={`${protocol.name}${isActive ? ' (active)' : ''}`}
          >
            {/* Cover — 200/470 of original card height */}
            <div className="relative h-[42.5%] w-full overflow-hidden p-6">
              <Pattern
                seed={protocol.name}
                className="absolute inset-0 size-full"
              />
              <motion.div className="relative">
                <Heading
                  level="h2"
                  margin="none"
                  className="mt-2 max-w-[90%] leading-[0.98] font-black tracking-tight text-white"
                >
                  {protocol.name}
                </Heading>
                <div className="font-monospace mt-2.5 text-xs text-white/85">
                  Schema v{protocol.schemaVersion}
                </div>
              </motion.div>
            </div>

            {/* Meta row */}
            <div className="font-monospace flex items-center justify-between px-6 pt-4 text-xs">
              <span className="text-text/60">
                Imported <TimeAgo date={protocol.importedAt} />
              </span>
              <span className="text-text/60">
                {sessionCount} {sessionCount === 1 ? 'interview' : 'interviews'}
              </span>
            </div>

            {/* Description */}
            <div className="px-6 pt-3.5 pb-[18px]">
              <p className="text-text/80 line-clamp-3 text-sm leading-[1.45]">
                {protocol.description ?? 'No description provided.'}
              </p>
            </div>

            {/* CTA pinned to bottom, centred. `mt-auto` consumes the free space
              between the description block and the card's lower edge. */}
            {isActive ? (
              <div className="mt-auto flex justify-center pb-6">
                <Button
                  icon={<Play className="stroke-[3px]!" aria-hidden />}
                  className="bg-sea-green text-primary-contrast border-b-sea-green-dark border-b-8 text-base font-black tracking-[0.08em] uppercase"
                  size="lg"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTap();
                  }}
                >
                  Start new interview
                </Button>
              </div>
            ) : null}
          </motion.div>
        </div>
      </div>
    );
  },
);

export const DeckCard = memo(DeckCardInner);
