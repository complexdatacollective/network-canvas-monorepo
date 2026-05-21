import { Play, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Pattern, seedToPatternPalette } from '@codaco/art';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cva } from '@codaco/fresco-ui/utils/cva';
import type { ProtocolWithCounts } from '~/lib/db/types';

// Stable per-protocol layoutIds for the shared-element morph between
// the in-slide DeckCard and NewSessionCardOverlay. Motion pairs each
// pair by its ID and animates the size/position transition
// automatically. Nested IDs (heading, meta) sit inside the outer card
// ID so the title and meta row morph in lock-step with the card itself.
export const deckCardLayoutId = (protocolHash: string): string =>
  `deck-card-${protocolHash}`;

export const deckCardHeadingLayoutId = (protocolHash: string): string =>
  `deck-card-heading-${protocolHash}`;

export const deckCardMetaLayoutId = (protocolHash: string): string =>
  `deck-card-meta-${protocolHash}`;

// Motion-wrapped Heading so we keep the semantic h2 (and Heading's
// variant classes) while motion drives the layout animation via the
// ref Heading forwards to its rendered element. Defined at module
// scope so the same component identity is reused across renders.
export const MotionHeading = motion.create(Heading);

const INACTIVE_SHADOW = '0 20px 40px oklch(0.10 0.05 281 / 0.5)';
const ACTIVE_DROP_SHADOW = '0 30px 60px oklch(0.10 0.05 281 / 0.7)';

export const cardActiveShadow = (accent: string): string =>
  `${ACTIVE_DROP_SHADOW}, 0 0 0 2px ${accent}`;

export const CARD_RADIUS_PX = 28;

const cardBase = cva({
  base: [
    'focus-visible:ring-sea-green focus-visible:ring-4 focus-visible:outline-none',
  ],
});

const importCardClass = cva({
  base: [
    'flex flex-col items-center justify-center gap-3 border-[3px] border-dashed border-outline bg-surface/50 backdrop-blur-md',
    'text-text/80',
  ].join(' '),
});

const protocolCardClass = cva({
  base: [
    'flex flex-col overflow-hidden border-0 bg-surface-1 p-0 text-text',
  ].join(' '),
});

export type DeckEntry =
  | { kind: 'protocol'; protocol: ProtocolWithCounts }
  | { kind: 'import' };

type DeckCardProps = {
  entry: DeckEntry;
  cardWidth: number;
  cardHeight: number;
  isActive: boolean;
  sessionCount: number;
  onActivate: () => void;
  onDelete?: () => void;
};

// Static lookup so Tailwind's scanner sees every possible class name at
// build time — `line-clamp-${n}` constructed dynamically would not get
// generated. Indices 1–10 cover every realistic card height.
const LINE_CLAMP_CLASS: Record<number, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
  7: 'line-clamp-7',
  8: 'line-clamp-8',
  9: 'line-clamp-9',
  10: 'line-clamp-10',
};
const MAX_LINE_CLAMP = 10;

function DescriptionBlock({ text }: { text: string }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pRef = useRef<HTMLParagraphElement | null>(null);
  const [lineClamp, setLineClamp] = useState(2);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const p = pRef.current;
    if (!wrapper || !p) return;
    const recompute = () => {
      const lineHeightPx = parseFloat(getComputedStyle(p).lineHeight);
      if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return;
      const available = wrapper.clientHeight;
      const lines = Math.min(
        MAX_LINE_CLAMP,
        Math.max(1, Math.floor(available / lineHeightPx)),
      );
      setLineClamp((prev) => (prev === lines ? prev : lines));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // Tailwind's `line-clamp-N` sets `display`, `-webkit-box-orient`,
  // `overflow`, and `-webkit-line-clamp` together in one declaration —
  // applying them via inline `style` instead leaves the browser free to
  // promote the element to a `flow-root` BFC and silently drop the
  // clamp, so go through the utility class.
  const clampClass =
    LINE_CLAMP_CLASS[lineClamp] ?? `line-clamp-${MAX_LINE_CLAMP}`;

  return (
    <div
      ref={wrapperRef}
      className="min-h-0 flex-1 px-3 pt-2 @min-2xs:px-6 @min-2xs:pt-3.5"
    >
      <span
        ref={pRef}
        className={`text-text/80 ${clampClass} text-xs @min-2xs:text-sm @min-xs:text-base @min-md:text-lg`}
      >
        {text}
      </span>
    </div>
  );
}

export function DeckCard({
  entry,
  cardWidth,
  cardHeight,
  isActive,
  sessionCount,
  onActivate,
  onDelete,
}: DeckCardProps) {
  if (entry.kind === 'import') {
    return (
      <button
        type="button"
        onClick={onActivate}
        // Match the protocol card's shadow so the visual footprint
        // (and therefore perceived size) is identical.
        style={{
          width: cardWidth,
          height: cardHeight,
          boxShadow: INACTIVE_SHADOW,
          borderRadius: CARD_RADIUS_PX,
        }}
        className={`${cardBase()} ${importCardClass()} @container`}
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
      onActivate();
    }
  };

  return (
    <motion.div
      // Paired with NewSessionCardOverlay's motion.div by the same
      // layoutId — motion auto-morphs between in-slide and overlay when
      // one unmounts and the other mounts.
      layoutId={deckCardLayoutId(protocol.hash)}
      tabIndex={0}
      onKeyDown={onCardKeyDown}
      style={{
        width: cardWidth,
        height: cardHeight,
        borderRadius: CARD_RADIUS_PX,
        boxShadow,
      }}
      className={`${cardBase()} ${protocolCardClass()} @container`}
      aria-label={`${protocol.name}${isActive ? ' (active)' : ''}`}
    >
      <div className="relative flex w-full flex-col justify-between gap-4 overflow-hidden p-4 @min-3xs:min-h-[40%] @min-2xs:p-6">
        <Pattern seed={protocol.name} className="absolute inset-0 size-full" />
        {/* `layout="position"` is what makes the morph work despite the
            responsive text-size changes between the in-slide card and
            the wider overlay: motion only interpolates position, so the
            size flip at the edges doesn't fight a competing size tween.
            `relative` keeps the heading above the absolutely-positioned
            Pattern. */}
        <MotionHeading
          layout="position"
          layoutId={deckCardHeadingLayoutId(protocol.hash)}
          level="h2"
          margin="none"
          className="relative text-lg leading-tight font-black tracking-tighter text-balance @min-[320px]:text-2xl @min-[380px]:text-3xl @min-3xs:text-xl @min-2xs:mt-2"
        >
          {protocol.name}
        </MotionHeading>
        <motion.div
          layoutId={deckCardMetaLayoutId(protocol.hash)}
          className="font-monospace relative hidden items-center justify-between gap-2 text-[12px] @min-3xs:flex @min-xs:text-xs @min-sm:text-sm"
        >
          <span>
            Imported <TimeAgo date={protocol.importedAt} />
          </span>
          <span>
            {sessionCount} {sessionCount === 1 ? 'interview' : 'interviews'}
          </span>
        </motion.div>
      </div>

      <DescriptionBlock
        text={protocol.description ?? 'No description provided.'}
      />

      {isActive && (
        <div className="mx-3 mb-3 flex items-center gap-2 @min-[320px]:mx-5 @min-[320px]:mb-5 @min-[380px]:mx-6 @min-[380px]:mb-6 @min-3xs:mx-4 @min-3xs:mb-4">
          <Button
            icon={
              <Play
                className="size-3 stroke-[3px]! @min-[320px]:size-5 @min-3xs:size-4"
                aria-hidden
              />
            }
            color="primary"
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-[10px] font-black tracking-[0.04em] uppercase @min-[320px]:h-13 @min-[320px]:gap-2.5 @min-[320px]:px-5 @min-[320px]:text-sm @min-[320px]:tracking-[0.07em] @min-[380px]:h-14 @min-[380px]:gap-3 @min-[380px]:px-6 @min-[380px]:text-base @min-[380px]:tracking-[0.08em] @min-3xs:h-11 @min-3xs:gap-2 @min-3xs:rounded-2xl @min-3xs:px-4 @min-3xs:text-xs @min-3xs:tracking-[0.06em]"
            onClick={() => {
              onActivate();
            }}
          >
            Start new interview
          </Button>
          {onDelete && (
            <IconButton
              color="destructive"
              icon={
                <Trash2
                  className="size-3 @min-[320px]:size-5 @min-3xs:size-4"
                  aria-hidden
                />
              }
              aria-label={`Delete ${protocol.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="h-9 @min-[320px]:h-13 @min-[380px]:h-14 @min-3xs:h-11"
            />
          )}
        </div>
      )}
    </motion.div>
  );
}
