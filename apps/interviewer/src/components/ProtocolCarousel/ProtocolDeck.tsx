import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import { IconButton } from '@codaco/fresco-ui/Button';
import type {
  ProtocolWithCounts,
  StoredSession,
  StoredSessionLite,
} from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

import {
  DeckCarousel,
  type DeckCarouselHandle,
  type DeckCarouselSlide,
} from './DeckCarousel';
import { buildDeck, type DeckEntry, entryKey } from './deckEntries';
import { DeckSlotCard } from './DeckSlotCard';
import { ImportTriggerCard } from './ImportTriggerCard';
import { useDeckKeyboard } from './useDeckKeyboard';

// Cards are square; height is measured from the section while the deck is
// idle, and width follows.
const CARD_ASPECT = 1 / 1;
// Readability floor: below this the card's container-query type becomes too
// small to read, so the deck stops shrinking and lets the section clip
// symmetrically instead. Lives here (not on DeckCard) so the slides and the
// card always agree on size — a card bigger than its slot broke the deck
// geometry and clipped card content (#888).
const MIN_CARD_EDGE_PX = 300;
// Top/bottom inset so the deck sits below the header instead of hugging it,
// and so the card's drop shadow has room to render. Scaled with section
// height: short viewports (Electron default 1280×800 leaves ~470px) get a
// smaller padding so the card itself doesn't shrink below readability;
// tall viewports get the original 100px breathing room.
const SECTION_PADDING_RATIO = 0.12;
const MIN_SECTION_PADDING = 24;
const MAX_SECTION_PADDING = 100;
const NETCANVAS_ACCEPT = { 'application/x-netcanvas': ['.netcanvas'] };

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
  // Dev-only teaser slot for the bundled Development protocol.
  showDevelopmentCard?: boolean;
  pendingImports?: PendingImport[];
  onImportFile: (file: File) => void;
  onStartInterview: (protocolHash: string) => void;
  onDeleteProtocol: (hash: string) => void;
  onInstallSample?: () => void;
  onDismissSample?: () => void;
  onInstallDevelopment?: () => void;
  // When set, swipe/keyboard navigation is locked and the matching protocol
  // card is isolated above a modal backdrop with the case-ID form.
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

const chevronRowVariants = {
  hidden: { opacity: 0, y: '10%' },
  visible: { opacity: 1, y: 0 },
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
  showDevelopmentCard = false,
  pendingImports = [],
  onImportFile,
  onStartInterview,
  onDeleteProtocol,
  onInstallSample = () => {},
  onDismissSample = () => {},
  onInstallDevelopment = () => {},
  newSessionProtocolHash,
  onCancelNewSession,
  onSessionCreated,
}: ProtocolDeckProps) {
  const newSessionActive = Boolean(newSessionProtocolHash);
  const sectionRef = useRef<HTMLElement | null>(null);
  const carouselRef = useRef<DeckCarouselHandle | null>(null);
  const didInitialScroll = useRef(false);
  const [sectionHeight, setSectionHeight] = useState(0);
  const handleDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file) onImportFile(file);
    },
    [onImportFile],
  );
  const {
    getRootProps: getImportRootProps,
    getInputProps: getImportInputProps,
    isDragActive: isImportDragActive,
    open: openImportDialog,
  } = useDropzone({
    onDrop: handleDrop,
    accept: NETCANVAS_ACCEPT,
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  const deck = useMemo(
    () =>
      buildDeck({
        protocols,
        showSampleCard,
        showDevelopmentCard,
        pendingImports,
      }),
    [protocols, showSampleCard, showDevelopmentCard, pendingImports],
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
            onActivate: openImportDialog,
            render: (_isActive: boolean, activate: () => void) => (
              <ImportTriggerCard
                onActivate={activate}
                getRootProps={getImportRootProps}
                getInputProps={getImportInputProps}
                isDragActive={isImportDragActive}
              />
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
                : entry.kind === 'development'
                  ? onInstallDevelopment
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
              onInstallDevelopment={onInstallDevelopment}
              newSession={newSession}
            />
          ),
        };
      }),
    [
      deck,
      sessionCounts,
      newSessionProtocolHash,
      getImportRootProps,
      getImportInputProps,
      isImportDragActive,
      openImportDialog,
      onStartInterview,
      onInstallSample,
      onDismissSample,
      onInstallDevelopment,
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

  // Slot keys that were pending in the last committed deck, so a slot that
  // just TURNED pending (a user-started import) can be detected below.
  const prevPendingKeysRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const prevPendingKeys = prevPendingKeysRef.current;
    prevPendingKeysRef.current = new Set(
      slides.filter((s) => s.entry.kind === 'pending').map((s) => s.key),
    );
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
    // A slot that just turned pending is a user-started import: travel to
    // its card. The import hook holds the heavy work back long enough
    // (IMPORT_START_DELAY_MS) for this travel to play out jank-free. For
    // the sample card (installable only while active) the slot is already
    // centred, so this is a no-op.
    let newPendingIndex = -1;
    slides.forEach((slide, index) => {
      if (slide.entry.kind === 'pending' && !prevPendingKeys.has(slide.key)) {
        newPendingIndex = index;
      }
    });
    if (newPendingIndex >= 0) {
      setActiveIndexState(newPendingIndex);
      activeSlotKeyRef.current = slides[newPendingIndex]?.key ?? null;
      return;
    }
    // Keep the active card stable across slot changes; if the active slot
    // itself vanished, the right neighbour inherits its index (clamped for
    // removal of the last slot). The travel animates via the carousel's
    // position spring, in lockstep with the slides' index springs.
    setActiveIndexState((current) => {
      const key = activeSlotKeyRef.current;
      let located = key === null ? -1 : slides.findIndex((s) => s.key === key);
      // A pending import (keyed `slot:<label>`) that just completed is replaced
      // by its installed protocol, keyed `hash:<hash>` — a different key. Match
      // that protocol by name so the freshly-installed card stays centred
      // instead of the deck jumping to a neighbour. Same-name/different-hash
      // protocols are supported, so prefer the most recently imported match —
      // the one the just-completed import produced.
      if (located < 0 && key?.startsWith('slot:')) {
        const name = key.slice('slot:'.length);
        let newestImportedAt = '';
        slides.forEach((s, index) => {
          if (s.entry.kind === 'protocol' && s.entry.protocol.name === name) {
            if (located < 0 || s.entry.protocol.importedAt > newestImportedAt) {
              located = index;
              newestImportedAt = s.entry.protocol.importedAt;
            }
          }
        });
      }
      const next =
        located >= 0
          ? located
          : Math.max(0, Math.min(current, slides.length - 1));
      activeSlotKeyRef.current = slides[next]?.key ?? null;
      return next;
    });
  }, [slides, initialProtocolHash]);

  // Observe the section (not the outer container) so cardHeight tracks the
  // space actually available to the carousel. Freeze the last resting size
  // while the case-ID form is active: the software keyboard can shrink the
  // app's visual-viewport frame, but must not reflow the card around its
  // focused input. Read borderBoxSize; contentRect excludes our own padding
  // and would feed back into the calculation.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      if (newSessionActive) return;
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const height = box?.blockSize ?? entry.target.clientHeight;
      setSectionHeight(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [newSessionActive]);

  const { cardWidth, cardHeight } = useMemo(() => {
    const padding = computeSectionPadding(sectionHeight);
    const innerHeight = Math.max(0, sectionHeight - padding * 2);
    // The floor applies only once the section has been measured at all —
    // cardHeight 0 still means "don't render the carousel yet".
    const ch =
      innerHeight > 0 ? Math.round(Math.max(innerHeight, MIN_CARD_EDGE_PX)) : 0;
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

  // The manually orchestrated backdrop does not own keyboard dismissal like
  // Base UI's full Modal component would, so keep Escape available from any
  // focused form control.
  useEffect(() => {
    if (!newSessionActive) return undefined;
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
      <AnimatePresence>
        {newSessionActive ? (
          <motion.button
            key="new-session-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="Cancel starting interview"
            data-testid="new-session-backdrop"
            className="bg-overlay publish-colors fixed inset-0 z-40 cursor-default border-0 p-0 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.25 } }}
            exit={{ opacity: 0 }}
            onClick={onCancelNewSession}
          />
        ) : null}
      </AnimatePresence>

      <motion.section
        ref={sectionRef}
        variants={sectionVariants}
        aria-label="Protocol deck"
        className={`flex max-h-[45rem] min-h-0 w-full flex-1 items-center justify-center ${newSessionActive ? 'pointer-events-none relative z-50' : ''}`}
      >
        {cardHeight > 0 ? (
          <DeckCarousel
            ref={carouselRef}
            slides={slides}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            disabled={newSessionActive}
            isolateActiveSlide={newSessionActive}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
          />
        ) : null}
      </motion.section>

      {slides.length > 1 && (
        <motion.div
          variants={chevronRowVariants}
          initial="hidden"
          animate="visible"
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
            variant="glass"
            icon={<ChevronLeft strokeWidth={2.8} aria-hidden />}
            aria-label="Previous protocol"
            onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            disabled={atStart}
            className="border-outline"
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
            variant="glass"
            icon={<ChevronRight strokeWidth={2.8} aria-hidden />}
            aria-label="Next protocol"
            onClick={() =>
              setActiveIndex(Math.min(slides.length - 1, activeIndex + 1))
            }
            disabled={atEnd}
            className="border-outline"
          />
        </motion.div>
      )}
    </div>
  );
}
