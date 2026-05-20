import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

import { GLASS_PILL } from '../TopActionBar';
import { DeckCard, type DeckEntry } from './DeckCard';
import { useDeckCarousel } from './useDeckCarousel';

type ProtocolDeckProps = {
  protocols: ProtocolWithCounts[];
  sessions: StoredSession[];
  initialProtocolHash?: string;
  onImport: () => void;
  onStartInterview: (protocolHash: string) => void;
};

export function ProtocolDeck({
  protocols,
  sessions,
  initialProtocolHash,
  onImport,
  onStartInterview,
}: ProtocolDeckProps) {
  const deck = useMemo<DeckEntry[]>(() => {
    const entries: DeckEntry[] = protocols.map((p) => ({
      kind: 'protocol',
      protocol: p,
    }));
    entries.push({ kind: 'import' });
    return entries;
  }, [protocols]);

  // Per-protocol session count, hoisted here so DeckCard doesn't take the
  // whole sessions array (which would break memo when other sessions change).
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      counts.set(s.protocolHash, (counts.get(s.protocolHash) ?? 0) + 1);
    }
    return counts;
  }, [sessions]);

  const initialIndex = useMemo(() => {
    if (!initialProtocolHash) return null;
    const idx = protocols.findIndex((p) => p.hash === initialProtocolHash);
    return idx < 0 ? null : idx;
  }, [initialProtocolHash, protocols]);

  // The hook owns every imperative bit of the carousel: sizing, scroll→active
  // tracking, wheel-to-snap, ScrollTimeline perspective, initial scroll,
  // out-of-range clamping, and arrow-key navigation.
  const {
    sectionRef,
    wrapperRef,
    cardRefs,
    activeIdx,
    scrollToIndex,
    sectionPadding,
    paddingInline,
    slotWidth,
    cardWidth,
    cardHeight,
  } = useDeckCarousel({ itemCount: deck.length, initialIndex });

  const handleActivate = useCallback(
    (idx: number) => {
      if (idx !== activeIdx) {
        scrollToIndex(idx);
        return;
      }
      const entry = deck[idx];
      if (!entry) return;
      if (entry.kind === 'import') {
        onImport();
        return;
      }
      onStartInterview(entry.protocol.hash);
    },
    [activeIdx, deck, scrollToIndex, onImport, onStartInterview],
  );

  // Enter activates the current card. Skip when focus is on another
  // interactive control (chevrons, dot navs, the card itself) or in an
  // editable target — those handle Enter themselves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        )
          return;
        if (target.tagName === 'BUTTON' || target.tagName === 'A') return;
        if (
          target.closest('button, a, [role="button"], [role="link"]') !== null
        )
          return;
      }
      event.preventDefault();
      handleActivate(activeIdx);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, handleActivate]);

  const atStart = activeIdx === 0;
  const atEnd = activeIdx === deck.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 36, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, delay: 0.65, type: 'spring' }}
      className="flex min-h-0 w-full flex-1 flex-col perspective-[1800px] transform-3d"
    >
      <motion.section
        layoutScroll
        ref={sectionRef}
        aria-label="Protocol deck"
        // The section is the SCROLLER. It can't host perspective itself
        // because `overflow-x: auto` forces `transform-style: flat` per the
        // CSS spec, breaking the 3D chain.
        style={{ paddingBlock: sectionPadding }}
        className="relative min-h-0 w-full flex-1 touch-pan-x snap-x snap-proximity scrollbar-none overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
      >
        {/* 3D wrapper — single shared perspective context for every card,
            so 3D depth (translateZ in keyframes) is what stacks the fan,
            not z-index or DOM order. `inline-flex` lets the wrapper grow to
            the width of its slots so the section scrolls horizontally. */}
        <div
          ref={wrapperRef}
          className="inline-flex h-full items-stretch perspective-[1800px] transform-3d"
          style={{ paddingInline }}
        >
          {deck.map((entry, i) => (
            <DeckCard
              key={entry.kind === 'import' ? 'import' : entry.protocol.hash}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              entry={entry}
              index={i}
              totalCards={deck.length}
              sectionRef={sectionRef}
              slotWidth={slotWidth}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              isActive={i === activeIdx}
              sessionCount={
                entry.kind === 'protocol'
                  ? (sessionCounts.get(entry.protocol.hash) ?? 0)
                  : 0
              }
              onActivate={handleActivate}
            />
          ))}
        </div>
      </motion.section>

      {deck.length > 1 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 1.05, type: 'spring' }}
          className="z-6 flex shrink-0 items-center justify-center gap-7"
        >
          <motion.span
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.2 }}
            className="inline-flex"
          >
            <IconButton
              size="xl"
              variant="text"
              icon={<ChevronLeft strokeWidth={2.8} aria-hidden />}
              aria-label="Previous protocol"
              onClick={() => scrollToIndex(Math.max(0, activeIdx - 1))}
              disabled={atStart}
              className={GLASS_PILL}
            />
          </motion.span>
          <div className="flex items-center gap-2.5">
            {deck.map((entry, i) => (
              <button
                key={entry.kind === 'import' ? 'import' : entry.protocol.hash}
                type="button"
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to card ${i + 1}`}
                aria-current={i === activeIdx ? 'true' : undefined}
                className={`h-3 cursor-pointer rounded-full border-0 p-0 transition-all duration-200 ${
                  i === activeIdx ? 'bg-sea-green w-9' : 'bg-outline w-3'
                }`}
              />
            ))}
          </div>
          <motion.span
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.2 }}
            className="inline-flex"
          >
            <IconButton
              size="xl"
              variant="text"
              icon={<ChevronRight strokeWidth={2.8} aria-hidden />}
              aria-label="Next protocol"
              onClick={() =>
                scrollToIndex(Math.min(deck.length - 1, activeIdx + 1))
              }
              disabled={atEnd}
              className={GLASS_PILL}
            />
          </motion.span>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
