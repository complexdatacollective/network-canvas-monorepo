import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

import { DeckCard, type DeckEntry, SLOT_TO_CARD_RATIO } from './DeckCard';
import { GLASS_PILL } from './TopActionBar';

const EASE = [0.22, 1, 0.36, 1] as const;

// ScrollTimeline isn't yet in TypeScript's lib.dom. Declared narrowly here.
type ScrollTimelineCtor = new (options: {
  source: Element;
  axis?: 'block' | 'inline' | 'x' | 'y';
}) => AnimationTimeline;
const getScrollTimelineCtor = (): ScrollTimelineCtor | undefined => {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as unknown as { ScrollTimeline?: ScrollTimelineCtor })
    .ScrollTimeline;
};

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
  const sectionRef = useRef<HTMLElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const CARD_HEIGHT_PCT = 0.88;
  const CARD_ASPECT = 36 / 47;
  // Small top inset so the deck sits below the header instead of hugging it.
  const SECTION_PADDING = 24;
  const [sectionSize, setSectionSize] = useState({ width: 0, height: 0 });
  // Card height = CARD_HEIGHT_PCT of section's available block-size (border
  // box minus our padding-top). Card width = height × aspect. Slot width =
  // SLOT_TO_CARD_RATIO × card width — the fan spacing dial.
  const innerHeight = Math.max(0, sectionSize.height - SECTION_PADDING * 2);
  const cardHeight = Math.round(innerHeight * CARD_HEIGHT_PCT);
  const cardWidth = Math.round(cardHeight * CARD_ASPECT);
  const slotWidth = Math.round(cardWidth * SLOT_TO_CARD_RATIO);
  const paddingInline = Math.max(0, (sectionSize.width - slotWidth) / 2);

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

  // Observe the section so slotWidth and paddingInline track its size. Read
  // borderBoxSize — contentRect excludes our own paddingInline and would feed
  // back into the calculation.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const width = box?.inlineSize ?? entry.target.clientWidth;
      const height = box?.blockSize ?? entry.target.clientHeight;
      setSectionSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Native scroll is the source of truth for which card is active. `Math.round`
  // matches the browser's snap commit, so the CTA jumps to the next card the
  // moment scroll-snap has decided.
  //
  // Trackpad scroll events on macOS fire at ~120Hz; without rAF coalescing
  // each one queues a React state update, which dominates the frame budget.
  // The ref-guard avoids dispatching setActiveIdx when the rounded index
  // hasn't actually changed.
  const activeIdxRef = useRef(0);
  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || slotWidth === 0) return;
    let rafId = 0;
    const sync = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const idx = Math.round(el.scrollLeft / slotWidth);
        const clamped = Math.max(0, Math.min(deck.length - 1, idx));
        if (clamped !== activeIdxRef.current) {
          activeIdxRef.current = clamped;
          setActiveIdx(clamped);
        }
      });
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    return () => {
      el.removeEventListener('scroll', sync);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [slotWidth, deck.length]);

  const scrollToIndex = useCallback((idx: number) => {
    const el = cardRefs.current[idx];
    el?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, []);

  // Translate vertical mouse-wheel strokes into discrete card advances, so
  // wheel scrolling animates the same as the chevron buttons. Trackpad
  // horizontal pans emit deltaX and pass through to native scroll-snap
  // untouched; this only intercepts deltaY-dominant input.
  //
  // We accumulate deltaY between events, advance one card once it crosses
  // the threshold, then enforce a cooldown so a hard wheel spin doesn't skip
  // the deck. The accumulator resets if the user pauses, so a slow wheel
  // doesn't summon a stale advance later.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ADVANCE_THRESHOLD = 30;
    const COOLDOWN_MS = 320;
    const IDLE_RESET_MS = 120;
    let accumulator = 0;
    let cooldownUntil = 0;
    let lastEventAt = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastEventAt > IDLE_RESET_MS) accumulator = 0;
      lastEventAt = now;
      if (now < cooldownUntil) return;
      accumulator += event.deltaY;
      if (Math.abs(accumulator) < ADVANCE_THRESHOLD) return;
      const direction = accumulator > 0 ? 1 : -1;
      const next = Math.max(
        0,
        Math.min(deck.length - 1, activeIdxRef.current + direction),
      );
      accumulator = 0;
      cooldownUntil = now + COOLDOWN_MS;
      if (next !== activeIdxRef.current) scrollToIndex(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [deck.length, scrollToIndex]);

  // Slide the wrapper's perspective-origin so it tracks the scroll viewport's
  // centre. Without this, perspective is anchored to the wrapper's middle (the
  // middle of all scroll content) and cards near either end look distorted.
  // ScrollTimeline drives this in the same compositor cycle as scroll input —
  // no JS per frame.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const section = sectionRef.current;
    if (!wrapper || !section) return;
    if (sectionSize.width === 0) return;
    const Ctor = getScrollTimelineCtor();
    if (!Ctor) return;
    const wrapperWidth = wrapper.scrollWidth;
    const halfViewport = sectionSize.width / 2;
    const timeline = new Ctor({ source: section, axis: 'inline' });
    const animation = wrapper.animate(
      [
        { perspectiveOrigin: `${halfViewport}px 50%` },
        { perspectiveOrigin: `${wrapperWidth - halfViewport}px 50%` },
      ],
      { timeline, fill: 'both' },
    );
    return () => animation.cancel();
  }, [sectionSize.width, slotWidth, deck.length]);

  // Land on the last-used protocol on first paint. We wait for slotWidth so
  // layout has settled before scrolling, and only run once (didInitialScroll
  // gates re-runs caused by setActiveIdx via the scroll listener).
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (!initialProtocolHash || slotWidth === 0) return;
    const idx = protocols.findIndex((p) => p.hash === initialProtocolHash);
    if (idx < 0) return;
    didInitialScroll.current = true;
    const el = cardRefs.current[idx];
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [initialProtocolHash, slotWidth, protocols]);

  // If the deck shrinks under our feet, scroll the now-out-of-range index back
  // into bounds. setActiveIdx happens via the scroll listener.
  useEffect(() => {
    if (deck.length === 0) return;
    if (activeIdx > deck.length - 1) {
      scrollToIndex(deck.length - 1);
    }
  }, [deck.length, activeIdx, scrollToIndex]);

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

  // Global ←/→/Enter cycle the deck — the deck is the primary affordance on
  // Home, so page-wide keys feel natural. The NewSessionDialog (lifted to Home)
  // mounts a focus-trapped surface above and swallows keys while open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isEditableTarget) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollToIndex(Math.max(0, activeIdx - 1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollToIndex(Math.min(deck.length - 1, activeIdx + 1));
        return;
      }
      // Enter must not double-fire when focus is on an interactive control
      // (TopActionBar buttons, chevrons, dot navs, the active card itself) —
      // the control already activates on Enter via its own handler.
      if (event.key === 'Enter') {
        if (target instanceof HTMLElement) {
          if (target.tagName === 'BUTTON' || target.tagName === 'A') return;
          if (
            target.closest('button, a, [role="button"], [role="link"]') !== null
          )
            return;
        }
        event.preventDefault();
        handleActivate(activeIdx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, deck.length, scrollToIndex, handleActivate]);

  const atStart = activeIdx === 0;
  const atEnd = activeIdx === deck.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 36, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, delay: 0.65, ease: EASE }}
      className="flex min-h-0 w-full flex-1 flex-col perspective-[1800px] transform-3d"
    >
      <section
        ref={sectionRef}
        aria-label="Protocol deck"
        // The section is the SCROLLER. It can't host perspective itself
        // because `overflow-x: auto` forces `transform-style: flat` per the
        // CSS spec, breaking the 3D chain.
        style={{ paddingBlock: SECTION_PADDING }}
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
      </section>

      {deck.length > 1 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 1.05, ease: EASE }}
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
