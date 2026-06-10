import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import type {
  ProtocolWithCounts,
  StoredSession,
  StoredSessionLite,
} from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

import { GLASS_PILL } from '../TopActionBar';
import {
  DeckCarousel,
  type DeckCarouselHandle,
  type DeckCarouselSlide,
} from './DeckCarousel';
import { buildDeck, type DeckEntry, entryKey } from './deckEntries';
import { DeckSlotCard } from './DeckSlotCard';
import { ImportTriggerCard } from './ImportTriggerCard';
import { useDeckKeyboard } from './useDeckKeyboard';

// Cards are square; height is measured from the section, width follows.
const CARD_ASPECT = 1 / 1;
// Top/bottom inset so the deck sits below the header instead of hugging it,
// and so the card's drop shadow has room to render. Scaled with section
// height: short viewports (Electron default 1280×800 leaves ~470px) get a
// smaller padding so the card itself doesn't shrink below readability;
// tall viewports get the original 100px breathing room.
const SECTION_PADDING_RATIO = 0.12;
const MIN_SECTION_PADDING = 24;
const MAX_SECTION_PADDING = 100;

function computeSectionPadding(sectionHeight: number): number {
  return Math.min(
    MAX_SECTION_PADDING,
    Math.max(MIN_SECTION_PADDING, sectionHeight * SECTION_PADDING_RATIO),
  );
}

type ProtocolDeckProps = {
  protocols: ProtocolWithCounts[];
  sessions: StoredSessionLite[];
  initialProtocolHash?: string;
  showSampleCard?: boolean;
  pendingImports?: PendingImport[];
  onImport: () => void;
  onStartInterview: (protocolHash: string) => void;
  onDeleteProtocol: (hash: string) => void;
  onInstallSample?: () => void;
  onDismissSample?: () => void;
  // When set, the matching card is rendered in its "new session" state: the
  // case-ID form replaces the description, metadata, and Start button in the
  // card footer, and swipe/keyboard navigation is locked.
  newSessionProtocolHash?: string | null;
  onCancelNewSession?: () => void;
  onSessionCreated?: (session: StoredSession) => void;
};

// Explicit exit transitions so `AnimatePresence mode="wait"` doesn't
// stall on motion's default unbounded spring before the data view can
// enter. Enter keeps the default spring for the existing feel.
const sectionVariants = {
  hidden: { opacity: 0, y: '10%' },
  visible: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: '10%',
    transition: { duration: 0.3, ease: 'easeIn' },
  },
} as const;

// Chevron row needs both a view-transition cascade (hidden/visible/exit)
// and a "fade out while the new-session form is open" toggle. We model
// the toggle as a `muted` variant and drive `animate` explicitly when it
// applies — outside of `muted`, `animate="visible"` lines up with the
// state that the parent cascade is propagating anyway.
const chevronRowVariants = {
  hidden: { opacity: 0, y: '10%' },
  visible: { opacity: 1, y: 0 },
  muted: { opacity: 0, y: 0 },
  exit: {
    opacity: 0,
    y: '10%',
    transition: { duration: 0.2, ease: 'easeIn' },
  },
} as const;

type DeckSlide = DeckCarouselSlide & { entry: DeckEntry };

export function ProtocolDeck({
  protocols,
  sessions,
  initialProtocolHash,
  showSampleCard = false,
  pendingImports = [],
  onImport,
  onStartInterview,
  onDeleteProtocol,
  onInstallSample = () => {},
  onDismissSample = () => {},
  newSessionProtocolHash,
  onCancelNewSession,
  onSessionCreated,
}: ProtocolDeckProps) {
  const newSessionActive = Boolean(newSessionProtocolHash);
  const sectionRef = useRef<HTMLElement | null>(null);
  const carouselRef = useRef<DeckCarouselHandle | null>(null);
  const didInitialScroll = useRef(false);
  const [sectionHeight, setSectionHeight] = useState(0);

  const deck = useMemo(
    () => buildDeck({ protocols, showSampleCard, pendingImports }),
    [protocols, showSampleCard, pendingImports],
  );

  // Per-protocol session count, hoisted here so DeckCard doesn't take the
  // whole sessions array (which would break memo when other sessions
  // change).
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      counts.set(s.protocolHash, (counts.get(s.protocolHash) ?? 0) + 1);
    }
    return counts;
  }, [sessions]);

  const slides = useMemo<DeckSlide[]>(
    () =>
      deck.map((entry) => {
        if (entry.kind === 'import') {
          return {
            key: entryKey(entry),
            entry,
            backdropBlur: true,
            onActivate: onImport,
            render: (_isActive: boolean, activate: () => void) => (
              <ImportTriggerCard onActivate={activate} />
            ),
          };
        }
        const newSession =
          entry.kind === 'protocol' &&
          newSessionProtocolHash != null &&
          entry.protocol.hash === newSessionProtocolHash &&
          onCancelNewSession &&
          onSessionCreated
            ? { onCancel: onCancelNewSession, onCreated: onSessionCreated }
            : undefined;
        return {
          key: entryKey(entry),
          entry,
          onActivate:
            entry.kind === 'protocol'
              ? () => onStartInterview(entry.protocol.hash)
              : entry.kind === 'sample'
                ? onInstallSample
                : undefined,
          render: (isActive: boolean, activate: () => void) => (
            <DeckSlotCard
              entry={entry}
              isActive={isActive}
              activate={activate}
              sessionCount={
                entry.kind === 'protocol'
                  ? (sessionCounts.get(entry.protocol.hash) ?? 0)
                  : 0
              }
              onDeleteProtocol={onDeleteProtocol}
              onDismissSample={onDismissSample}
              onInstallSample={onInstallSample}
              newSession={newSession}
            />
          ),
        };
      }),
    [
      deck,
      sessionCounts,
      newSessionProtocolHash,
      onImport,
      onStartInterview,
      onInstallSample,
      onDismissSample,
      onDeleteProtocol,
      onCancelNewSession,
      onSessionCreated,
    ],
  );

  const [activeIndex, setActiveIndexState] = useState(0);
  // The slot key the user last chose, so the active card stays the same
  // card (not the same index) when entries are added/removed and indexes
  // shift.
  const activeSlotKeyRef = useRef<string | null>(null);

  // All user navigation flows through here so activeSlotKeyRef tracks the
  // user's choice.
  const setActiveIndex = useCallback(
    (index: number) => {
      setActiveIndexState(index);
      activeSlotKeyRef.current = slides[index]?.key ?? null;
    },
    [slides],
  );

  useEffect(() => {
    // One-time deep link once the requested protocol is in the deck
    // (protocols load async). jumpTo is a no-op before the carousel mounts;
    // in that case the carousel initialises its position at activeIndex.
    if (!didInitialScroll.current && initialProtocolHash) {
      const idx = slides.findIndex(
        (s) =>
          s.entry.kind === 'protocol' &&
          s.entry.protocol.hash === initialProtocolHash,
      );
      if (idx >= 0) {
        didInitialScroll.current = true;
        carouselRef.current?.jumpTo(idx);
        setActiveIndexState(idx);
        activeSlotKeyRef.current = slides[idx]?.key ?? null;
        return;
      }
    }
    // Keep the active card stable across slot changes; if the active slot
    // itself vanished, the right neighbour inherits its index (clamped for
    // removal of the last slot). The travel animates via the carousel's
    // position spring, in lockstep with the slides' index springs.
    setActiveIndexState((current) => {
      const key = activeSlotKeyRef.current;
      const located =
        key === null ? -1 : slides.findIndex((s) => s.key === key);
      const next =
        located >= 0
          ? located
          : Math.max(0, Math.min(current, slides.length - 1));
      activeSlotKeyRef.current = slides[next]?.key ?? null;
      return next;
    });
  }, [slides, initialProtocolHash]);

  // Observe the section (not the outer container) so cardHeight tracks the
  // space actually available to the carousel. The outer container also
  // holds the chevron+dots row. Read borderBoxSize; contentRect excludes
  // our own padding and would feed back into the calculation.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const height = box?.blockSize ?? entry.target.clientHeight;
      setSectionHeight(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cardWidth, cardHeight } = useMemo(() => {
    const padding = computeSectionPadding(sectionHeight);
    const innerHeight = Math.max(0, sectionHeight - padding * 2);
    const ch = Math.round(innerHeight);
    const cw = Math.round(ch * CARD_ASPECT);
    return { cardHeight: ch, cardWidth: cw };
  }, [sectionHeight]);

  useDeckKeyboard({
    enabled: !newSessionActive,
    onStep: useCallback(
      (direction: -1 | 1) => {
        setActiveIndex(
          Math.max(0, Math.min(slides.length - 1, activeIndex + direction)),
        );
      },
      [activeIndex, slides.length, setActiveIndex],
    ),
    onActivate: useCallback(() => {
      slides[activeIndex]?.onActivate?.();
    }, [slides, activeIndex]),
  });

  // Esc cancels the new-session form. Listen at the window so it works
  // regardless of which form control currently has focus.
  useEffect(() => {
    if (!newSessionActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelNewSession?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newSessionActive, onCancelNewSession]);

  const atStart = activeIndex === 0;
  const atEnd = activeIndex === slides.length - 1;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
      <motion.section
        ref={sectionRef}
        variants={sectionVariants}
        aria-label="Protocol deck"
        className="flex max-h-[45rem] min-h-0 w-full flex-1 items-center justify-center"
      >
        {cardHeight > 0 ? (
          <DeckCarousel
            ref={carouselRef}
            slides={slides}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            disabled={newSessionActive}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
          />
        ) : null}
      </motion.section>

      {slides.length > 1 && (
        <motion.div
          variants={chevronRowVariants}
          initial="hidden"
          animate={newSessionActive ? 'muted' : 'visible'}
          exit="exit"
          // Hide the row from assistive tech and pointer/keyboard events
          // while the form is open so it can't be tabbed into behind the
          // backdrop.
          aria-hidden={newSessionActive || undefined}
          inert={newSessionActive}
          className="z-6 flex shrink-0 items-center justify-center gap-7"
        >
          <IconButton
            size="xl"
            variant="text"
            icon={<ChevronLeft strokeWidth={2.8} aria-hidden />}
            aria-label="Previous protocol"
            onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            disabled={atStart}
            className={GLASS_PILL}
          />
          <div className="flex items-center gap-2.5">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`Go to card ${i + 1}`}
                aria-current={i === activeIndex ? 'true' : undefined}
                className={`h-3 cursor-pointer rounded-full border-0 p-0 transition-all duration-200 ${
                  i === activeIndex ? 'bg-sea-green w-9' : 'bg-outline w-3'
                }`}
              />
            ))}
          </div>
          <IconButton
            size="xl"
            variant="text"
            icon={<ChevronRight strokeWidth={2.8} aria-hidden />}
            aria-label="Next protocol"
            onClick={() =>
              setActiveIndex(Math.min(slides.length - 1, activeIndex + 1))
            }
            disabled={atEnd}
            className={GLASS_PILL}
          />
        </motion.div>
      )}
    </div>
  );
}
