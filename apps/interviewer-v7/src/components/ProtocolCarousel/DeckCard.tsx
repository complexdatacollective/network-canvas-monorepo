import { Play, Trash2 } from 'lucide-react';
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
import type { ProtocolWithCounts } from '~/lib/db/types';

import { CARD_RADIUS_PX, cardBase, protocolCardClass } from './cardStyles';

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

type DeckCardProps = {
  protocol: ProtocolWithCounts;
  isActive: boolean;
  sessionCount: number;
  onActivate: () => void;
  onDelete: () => void;
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
  protocol,
  isActive,
  sessionCount,
  onActivate,
  onDelete,
}: DeckCardProps) {
  const palette = seedToPatternPalette(protocol.name);
  // Theme-driven shadow tokens, identical to NewSessionCardOverlay so the
  // shared-element morph doesn't jitter between the two endpoints. The
  // active accent ring stays inline because its color is per-protocol.
  const boxShadow = isActive
    ? `var(--shadow-2xl-base), 0 0 0 2px ${palette.backgroundTop}`
    : 'var(--shadow-xl-base)';

  const onCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <motion.div
      layoutId={deckCardLayoutId(protocol.hash)}
      // Lock re-measurement to the protocol identity so Swiper's
      // post-commit fan transforms and ResizeObserver-driven slot
      // re-renders don't read as layout changes and animate the cards
      // into position on first paint. The morph still works because
      // motion snapshots the rect at the moment of unmount.
      layoutDependency={protocol.hash}
      tabIndex={0}
      onKeyDown={onCardKeyDown}
      style={{
        borderRadius: CARD_RADIUS_PX,
        boxShadow,
      }}
      className={`${cardBase()} ${protocolCardClass()} @container h-full w-full`}
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
          layoutDependency={protocol.hash}
          level="h2"
          margin="none"
          className="relative text-lg leading-tight font-black tracking-tighter text-balance @min-[320px]:text-2xl @min-[380px]:text-3xl @min-3xs:text-xl @min-2xs:mt-2"
        >
          {protocol.name}
        </MotionHeading>
        <motion.div
          layoutId={deckCardMetaLayoutId(protocol.hash)}
          layoutDependency={protocol.hash}
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
        <div className="mx-3 mb-3 flex flex-col gap-2 @min-[300px]:flex-row @min-[300px]:items-center @min-[320px]:mx-5 @min-[320px]:mb-5 @min-[380px]:mx-6 @min-[380px]:mb-6 @min-3xs:mx-4 @min-3xs:mb-4">
          {/* Inner @container so the Start button's text, icon, padding,
              gap, and tracking scale with the Button's own width — not
              the card's. The wrapper's height stays card-driven so the
              Button's vertical scale tracks the card; horizontal content
              adapts to whatever space the IconButton leaves. The text
              span carries min-w-0 + truncate as a safety net for the
              cases where uppercase+tracking text outgrows the available
              width even at the smallest tier. At narrow widths the row
              stacks vertically; the Trash button appears below the Start
              button via the default column order. */}
          <div className="@container h-9 min-w-0 flex-1 @min-[320px]:h-13 @min-[380px]:h-14 @min-3xs:h-11">
            <Button
              icon={
                <Play
                  className="size-3 shrink-0 stroke-[3px]! @min-[240px]:size-4 @min-[300px]:size-5"
                  aria-hidden
                />
              }
              color="primary"
              className="flex h-full w-full items-center justify-center gap-1.5 rounded-xl px-3 font-black tracking-[0.04em] uppercase @min-[240px]:gap-2 @min-[240px]:rounded-2xl @min-[240px]:px-4 @min-[240px]:tracking-[0.06em] @min-[300px]:gap-2.5 @min-[300px]:px-5 @min-[300px]:tracking-[0.07em] @min-[360px]:gap-3 @min-[360px]:px-6 @min-[360px]:tracking-[0.08em]"
              onClick={() => {
                onActivate();
              }}
            >
              <span className="min-w-0 truncate text-[10px] @min-[240px]:text-xs @min-[300px]:text-sm @min-[360px]:text-base">
                Start new interview
              </span>
            </Button>
          </div>
          <IconButton
            variant="text"
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
            className="hover:bg-destructive! hover:text-destructive-contrast! h-9 shrink-0 @min-[320px]:h-13 @min-[380px]:h-14 @min-3xs:h-11"
          />
        </div>
      )}
    </motion.div>
  );
}
