import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Swiper as SwiperClass } from 'swiper';
import { A11y, EffectCreative, Keyboard, Mousewheel } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/effect-creative';

import { IconButton } from '@codaco/fresco-ui/Button';
import type {
  ProtocolWithCounts,
  StoredSession,
  StoredSessionLite,
} from '~/lib/db/types';
import type { ImportPhase } from '~/lib/protocol/importProtocol';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

import { NewSessionForm } from '../NewSessionForm';
import { GLASS_PILL } from '../TopActionBar';
import {
  DeckCard,
  DeckCardFooter,
  DeckCardFooterButton,
  type DeckCardProps,
  DeckCardProgressFooter,
} from './DeckCard';
import { ImportTriggerCard } from './ImportTriggerCard';

// Status line shown on the loading card for each import phase.
const PHASE_LABEL: Record<ImportPhase, string> = {
  fetching: 'Fetching…',
  extracting: 'Extracting…',
  saving: 'Saving…',
};

// Internal union shape that determines which card component to render
// in a slot. ProtocolDeck owns this — each kind maps to a distinct
// extracted card component below.
type DeckEntry =
  | { kind: 'protocol'; protocol: ProtocolWithCounts }
  | { kind: 'sample' }
  | { kind: 'pending'; pending: PendingImport }
  | { kind: 'import' };

// A Geospatial stage renders an online map (tile server), so a protocol that
// contains one can't be administered while offline.
function protocolRequiresInternet(protocol: ProtocolWithCounts): boolean {
  return protocol.protocol.stages.some((stage) => stage.type === 'Geospatial');
}

// High-codepoint sentinel so the import card always sorts last under a
// case-insensitive locale comparison.
const IMPORT_SLOT_KEY = '￿__import__';

function entrySlotKey(entry: DeckEntry): string {
  if (entry.kind === 'protocol') return entry.protocol.name;
  if (entry.kind === 'sample') return SAMPLE_PROTOCOL.name;
  if (entry.kind === 'pending') return entry.pending.label;
  return IMPORT_SLOT_KEY;
}

// Pending wins over sample wins over protocol wins over import when two
// entries collide on the same slot key (e.g. a sample-source pending and
// the sample card, or a freshly-imported protocol overlapping its
// just-cleared pending entry).
function entryPriority(entry: DeckEntry): number {
  if (entry.kind === 'pending') return 4;
  if (entry.kind === 'sample') return 3;
  if (entry.kind === 'protocol') return 2;
  return 1;
}

// Visual proportions of the fanned deck — tuned together. Changing one
// without re-checking the others desyncs the snap distance from the
// painted fan.
const CARD_ASPECT = 1 / 1;
// Slot stride as a fraction of card width. Adjacent cards translate by
// this much per progress step, so 0.7 reproduces the original 30% overlap.
const SLOT_TO_CARD_RATIO = 0.7;
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
// Per-offset depth (px). With perspective 1800px, translateZ(-400)
// projects a card to (1800/2200) ≈ 82% of its size — cards further from
// active naturally appear behind via real 3D depth, not z-index.
const FAN_Z_STEP = 400;
const FAN_ROTATE_DEG = 3;
const FAN_DROP_PCT = 4;
// Translate by a percentage of slide width so the fan stride scales with
// the slide's measured size without re-initialising Swiper on resize.
const SLOT_TRANSLATE_PCT = SLOT_TO_CARD_RATIO * 100;

// Swiper's slide-change duration.
const SLIDE_SPEED_MS = 320;

// Slide lifecycle poses. A slide animates in once when its slot is added and
// out once when its slot is removed; content changes within a slot (sample →
// installing → protocol) swap without any animation.
const SLIDE_ENTER = { y: -48, opacity: 0, scale: 0.9 };
const SLIDE_REST = { y: 0, opacity: 1, scale: 1 };
const SLIDE_EXIT = { y: 0, opacity: 0, scale: 0 };

// A rendered carousel slot: a live deck entry, or a removed entry retained
// while its exit choreography plays (scale out, carousel travel, unmount).
type RenderSlot = { key: string; entry: DeckEntry; exiting: boolean };

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
  const swiperRef = useRef<SwiperClass | null>(null);
  const didInitialScroll = useRef(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [sectionHeight, setSectionHeight] = useState(0);

  const deck = useMemo<DeckEntry[]>(() => {
    const candidates: DeckEntry[] = protocols.map((p) => ({
      kind: 'protocol',
      protocol: p,
    }));
    if (showSampleCard) candidates.push({ kind: 'sample' });
    for (const pending of pendingImports)
      candidates.push({ kind: 'pending', pending });
    candidates.push({ kind: 'import' });

    // Group by slotKey, pick the highest-priority entry per slot.
    // Array order is preserved as the tiebreaker within a kind because
    // we walk candidates in insertion order and only replace when the
    // contender strictly beats the current pick.
    const bySlot = new Map<string, DeckEntry>();
    for (const candidate of candidates) {
      const key = entrySlotKey(candidate);
      const existing = bySlot.get(key);
      if (!existing || entryPriority(candidate) > entryPriority(existing)) {
        bySlot.set(key, candidate);
      }
    }

    return Array.from(bySlot.entries())
      .toSorted(([a], [b]) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      )
      .map(([, entry]) => entry);
  }, [protocols, showSampleCard, pendingImports]);

  // Slots whose deck entry vanished but whose exit choreography is still
  // playing. Derived during render (the setState-during-render "adjust state
  // from props" pattern) so a removed slide never unmounts for a frame
  // before the exit starts.
  const [prevDeck, setPrevDeck] = useState<DeckEntry[]>(deck);
  const [exiting, setExiting] = useState<ReadonlyMap<string, DeckEntry>>(
    new Map(),
  );
  if (prevDeck !== deck) {
    setPrevDeck(deck);
    const currentKeys = new Set(deck.map(entrySlotKey));
    const next = new Map(exiting);
    let changed = false;
    for (const entry of prevDeck) {
      const key = entrySlotKey(entry);
      if (!currentKeys.has(key) && !next.has(key)) {
        next.set(key, entry);
        changed = true;
      }
    }
    // A slot that comes back while its exit is still playing is live again.
    for (const key of next.keys()) {
      if (currentKeys.has(key)) {
        next.delete(key);
        changed = true;
      }
    }
    if (changed) setExiting(next);
  }

  // The rendered slide list: live entries plus exiting holdovers, in stable
  // slot order so list indexes always match Swiper's slide indexes.
  const renderDeck = useMemo<RenderSlot[]>(() => {
    const slots: RenderSlot[] = deck.map((entry) => ({
      key: entrySlotKey(entry),
      entry,
      exiting: false,
    }));
    for (const [key, entry] of exiting) {
      slots.push({ key, entry, exiting: true });
    }
    return slots.toSorted((a, b) =>
      a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }),
    );
  }, [deck, exiting]);

  const renderDeckRef = useRef(renderDeck);
  useEffect(() => {
    renderDeckRef.current = renderDeck;
  }, [renderDeck]);

  // Slot keys present in the last committed render. A slide whose key is not
  // here mounts with the drop-in pose; slides in the very first commit mount
  // settled (the section-level cascade animates the deck in as a whole).
  const committedKeysRef = useRef<ReadonlySet<string> | null>(null);
  const committedKeys = committedKeysRef.current;
  useEffect(() => {
    committedKeysRef.current = new Set(renderDeck.map((s) => s.key));
  }, [renderDeck]);

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
    if (!initialProtocolHash) return 0;
    const idx = renderDeck.findIndex(
      (s) =>
        s.entry.kind === 'protocol' &&
        s.entry.protocol.hash === initialProtocolHash,
    );
    return idx < 0 ? 0 : idx;
  }, [initialProtocolHash, renderDeck]);

  // Observe the section (not the outer container) so cardHeight tracks the
  // space actually available to Swiper. The outer container also holds the
  // chevron+dots row, and subtracting only the padding would size cards by
  // ~80px more than the section can hold — they'd overflow vertically.
  // Read borderBoxSize; contentRect excludes our own padding and would feed
  // back into the calculation.
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

  const handleActivate = useCallback(
    (idx: number) => {
      if (idx !== activeIdx) {
        swiperRef.current?.slideTo(idx);
        return;
      }
      const slot = renderDeck[idx];
      if (!slot || slot.exiting) return;
      const entry = slot.entry;
      if (entry.kind === 'import') {
        onImport();
        return;
      }
      if (entry.kind === 'sample') {
        onInstallSample();
        return;
      }
      if (entry.kind === 'pending') {
        return;
      }
      onStartInterview(entry.protocol.hash);
    },
    [activeIdx, renderDeck, onImport, onInstallSample, onStartInterview],
  );

  // Protocols load async, so the first render typically has an empty deck
  // and Swiper's `initialSlide` is applied at index 0. Once the requested
  // index is reachable, jump (no animation) — but only the first time, so
  // we don't fight the user's scrolling later.
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (initialIndex <= 0) return;
    if (initialIndex >= renderDeck.length) return;
    const swiper = swiperRef.current;
    if (!swiper) return;
    didInitialScroll.current = true;
    swiper.slideTo(initialIndex, 0);
  }, [initialIndex, renderDeck.length]);

  useEffect(() => {
    if (activeIdx < renderDeck.length) return;
    swiperRef.current?.slideTo(Math.max(0, renderDeck.length - 1), 0);
  }, [renderDeck.length, activeIdx]);

  const finishExit = useCallback((key: string) => {
    setExiting((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Applied (speed 0, before paint) after an exited slot unmounts, so the
  // slide the carousel travelled to stays visually centred when the removal
  // shifts indexes left.
  const indexFixRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const fix = indexFixRef.current;
    if (fix === null) return;
    indexFixRef.current = null;
    swiperRef.current?.slideTo(fix, 0);
  }, [renderDeck]);

  // While the carousel travels away from an emptied slot, re-renders must
  // not be triggered: the Swiper React wrapper responds to any children
  // change with swiper.update(), which snaps the translate and kills the
  // slide animation. activeIdx sync is the one render trigger during the
  // travel, so it's suppressed until the transition completes.
  const suppressActiveSyncRef = useRef(false);

  // A removed slide finished scaling out. The emptied slot is held in the
  // DOM while the carousel animates to the next available slide; only after
  // that travel completes is the slot dropped (with an invisible index
  // rebind when the removal shifts indexes).
  const handleScaleOutComplete = useCallback(
    (key: string) => {
      const swiper = swiperRef.current;
      const slots = renderDeckRef.current;
      const idx = slots.findIndex((s) => s.key === key);
      if (!swiper || idx < 0) {
        finishExit(key);
        return;
      }

      const active = swiper.activeIndex;
      if (idx !== active) {
        // Off-centre removal: no travel; just keep the centred slide put.
        if (idx < active) indexFixRef.current = active - 1;
        finishExit(key);
        return;
      }

      // Next available slide: prefer the right neighbour, fall back left.
      let target = -1;
      for (let j = idx + 1; j < slots.length; j += 1) {
        if (!slots[j]?.exiting) {
          target = j;
          break;
        }
      }
      if (target === -1) {
        for (let j = idx - 1; j >= 0; j -= 1) {
          if (!slots[j]?.exiting) {
            target = j;
            break;
          }
        }
      }
      if (target === -1) {
        finishExit(key);
        return;
      }

      let done = false;
      const complete = () => {
        if (done) return;
        done = true;
        suppressActiveSyncRef.current = false;
        const sw = swiperRef.current;
        if (sw) {
          setActiveIdx(sw.activeIndex);
          // Dropping a slot left of the travelled-to slide shifts indexes
          // down by one; rebind before paint so nothing visibly moves.
          if (idx < sw.activeIndex) indexFixRef.current = sw.activeIndex - 1;
        }
        finishExit(key);
      };

      suppressActiveSyncRef.current = true;
      swiper.once('transitionEnd', complete);
      swiper.slideTo(target, SLIDE_SPEED_MS);
      // Fallback in case transitionEnd never fires (e.g. reduced motion).
      window.setTimeout(complete, SLIDE_SPEED_MS + 120);
    },
    [finishExit],
  );

  // Enter activates the current card. Skip when focus is on another
  // interactive control (chevrons, dot navs, the card itself) or in an
  // editable target — those handle Enter themselves. Suppressed entirely
  // while the new-session form is open: that form owns the Enter key.
  useEffect(() => {
    if (newSessionActive) return;
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
  }, [activeIdx, handleActivate, newSessionActive]);

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

  // Swiper's creative-effect opacity is linear; the original deck plateaus
  // at 1 for slides ≤ 2 away and fades to 0 by 4. Reapply our curve every
  // time Swiper retranslates so the opacity tracks scroll position in the
  // same frame as the fan transform. Swiper attaches `progress` to each
  // slide at runtime but the typing is `HTMLElement[]`, so narrow via `in`.
  // Non-active slides stay visible while the new-session form is open —
  // the carousel should remain underneath the backdrop, not vanish.
  const applyOpacityCurve = useCallback((swiper: SwiperClass) => {
    for (const slide of swiper.slides) {
      if (!('progress' in slide)) continue;
      const progress = slide.progress;
      if (typeof progress !== 'number') continue;
      const abs = Math.abs(progress);
      const opacity = abs <= 2 ? 1 : abs >= 4 ? 0 : 1 - (abs - 2) / 2;
      slide.style.opacity = String(opacity);
    }
  }, []);

  // Gate Swiper user input imperatively. The React wrapper does not
  // reliably re-apply prop changes to `mousewheel` / `keyboard` /
  // `allowTouchMove` on already-mounted instances, so toggling props
  // alone leaves the wheel and keyboard live while the new-session form
  // is open. `disable()` blocks every input pathway (touch, mouse drag,
  // wheel, keyboard) but keeps the imperative `slideTo` API working.
  useEffect(() => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    if (newSessionActive) {
      swiper.disable();
    } else {
      swiper.enable();
    }
  }, [newSessionActive]);

  const creativeEffectConfig = useMemo(
    () => ({
      // Clamp at the largest possible offset so far-away cards still get
      // their full transform — opacity 0 from applyOpacityCurve does the
      // hiding, not clamping.
      limitProgress: Math.max(renderDeck.length, 2),
      progressMultiplier: 1,
      perspective: true,
      prev: {
        // Mutable arrays — Swiper's CreativeEffectOptions type rejects
        // `readonly` tuples, so don't tighten with `as const` here.
        translate: [`-${SLOT_TRANSLATE_PCT}%`, `${FAN_DROP_PCT}%`, -FAN_Z_STEP],
        rotate: [0, 0, -FAN_ROTATE_DEG],
        opacity: 1,
        // Rotation pivots around the card's bottom edge — matches the
        // original `origin-[center_bottom]` on the inner card.
        origin: 'center bottom',
      },
      next: {
        translate: [`${SLOT_TRANSLATE_PCT}%`, `${FAN_DROP_PCT}%`, -FAN_Z_STEP],
        rotate: [0, 0, FAN_ROTATE_DEG],
        opacity: 1,
        origin: 'center bottom',
      },
    }),
    [renderDeck.length],
  );

  const atStart = activeIdx === 0;
  const atEnd = activeIdx === renderDeck.length - 1;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
      <motion.section
        ref={sectionRef}
        variants={sectionVariants}
        aria-label="Protocol deck"
        // overflow-visible lets the card's drop shadow extend into the
        // section's padding zone without clipping. Swiper sets
        // `overflow: hidden` on itself; we override below so shadows can
        // paint outside the slide rectangle.
        className="flex max-h-[45rem] min-h-0 w-full flex-1 items-center justify-center"
      >
        {cardHeight > 0 ? (
          <Swiper
            modules={[EffectCreative, Mousewheel, Keyboard, A11y]}
            effect="creative"
            creativeEffect={creativeEffectConfig}
            slidesPerView="auto"
            centeredSlides
            grabCursor={!newSessionActive}
            allowTouchMove={!newSessionActive}
            speed={SLIDE_SPEED_MS}
            initialSlide={initialIndex}
            style={{ perspective: '1800px' }}
            keyboard={{
              enabled: !newSessionActive,
              onlyInViewport: false,
            }}
            // `forceToAxis: false` lets a vertical scroll wheel advance
            // the deck, not just trackpad swipes — the mouse-wheel was
            // the one input mode the original deck supported that Swiper
            // ignores by default. Disabled while the new-session form is
            // open so wheel scrolling can't desync the active card.
            mousewheel={
              newSessionActive
                ? false
                : {
                    forceToAxis: false,
                    thresholdDelta: 30,
                    releaseOnEdges: true,
                    sensitivity: 1,
                  }
            }
            onSwiper={(s) => {
              swiperRef.current = s;
              applyOpacityCurve(s);
            }}
            onSlideChange={(s) => {
              if (suppressActiveSyncRef.current) return;
              setActiveIdx(s.activeIndex);
            }}
            onSetTranslate={applyOpacityCurve}
            // !overflow-visible overrides Swiper's bundled
            // `.swiper { overflow: hidden }` so card drop shadows can
            // paint beyond the swiper rect into the section padding.
            className="protocol-deck-swiper w-full !overflow-visible"
          >
            {renderDeck.map((slot, i) => {
              const { entry, exiting: isExiting } = slot;
              // A slot absent from the last committed render is newly added:
              // it mounts with the drop-in pose. Content changes within a
              // slot (sample → installing → protocol) swap with no animation.
              const isNewSlide =
                committedKeys !== null && !committedKeys.has(slot.key);

              // All card kinds render through ONE DeckCard element at a
              // stable position, so the component instance — and with it the
              // LayoutGroup driving the in-card `layout` animations —
              // survives kind changes within a slot. Separate conditional
              // elements would remount the card and snap content into place.
              const cardProps = ((): DeckCardProps | null => {
                if (entry.kind === 'protocol') {
                  // The case-ID form takes over the footer (and the space
                  // the description occupied) while a new session is being
                  // started for this protocol.
                  const isNewSession =
                    newSessionActive &&
                    entry.protocol.hash === newSessionProtocolHash &&
                    onCancelNewSession !== undefined &&
                    onSessionCreated !== undefined;
                  return {
                    protocol: entry.protocol,
                    isActive: i === activeIdx,
                    sessionCount: sessionCounts.get(entry.protocol.hash) ?? 0,
                    requiresInternetConnection: protocolRequiresInternet(
                      entry.protocol,
                    ),
                    onActivate: () => handleActivate(i),
                    // The delete control clears out with the rest of the
                    // card chrome while the case-ID form is open.
                    onDelete: isNewSession
                      ? undefined
                      : () => onDeleteProtocol(entry.protocol.hash),
                    footer: isNewSession ? (
                      <DeckCardFooter key="new-session">
                        <NewSessionForm
                          protocol={entry.protocol}
                          onCancel={onCancelNewSession}
                          onCreated={onSessionCreated}
                        />
                      </DeckCardFooter>
                    ) : i === activeIdx ? (
                      <DeckCardFooter key="start-interview">
                        <DeckCardFooterButton onClick={() => handleActivate(i)}>
                          Start new interview
                        </DeckCardFooterButton>
                      </DeckCardFooter>
                    ) : undefined,
                  };
                }
                if (entry.kind === 'sample') {
                  return {
                    loading: true,
                    protocol: {
                      name: SAMPLE_PROTOCOL.name,
                      description: SAMPLE_PROTOCOL.description,
                    },
                    isActive: i === activeIdx,
                    hideMetadata: true,
                    onActivate: () => handleActivate(i),
                    onDelete: onDismissSample,
                    deleteLabel: 'Dismiss the sample protocol',
                    footer:
                      i === activeIdx ? (
                        <DeckCardFooter key="install-sample">
                          <DeckCardFooterButton
                            color="primary"
                            icon={
                              <Download
                                aria-hidden
                                className="size-[max(14px,3.5cqi)] shrink-0"
                              />
                            }
                            onClick={onInstallSample}
                          >
                            Install sample protocol
                          </DeckCardFooterButton>
                        </DeckCardFooter>
                      ) : undefined,
                  };
                }
                if (entry.kind === 'pending') {
                  return {
                    loading: true,
                    protocol: {
                      name: entry.pending.label || undefined,
                      description: undefined,
                    },
                    footer: (
                      <DeckCardFooter key="import-progress">
                        <DeckCardProgressFooter
                          progress={entry.pending.progress}
                          message={PHASE_LABEL[entry.pending.phase]}
                        />
                      </DeckCardFooter>
                    ),
                  };
                }
                return null;
              })();
              // The "ghost" import card wants a frosted-glass look.
              // backdrop-blur applied INSIDE the card is a no-op — Swiper's
              // per-slide transforms create a stacking context that scopes the
              // filter to an empty rect. Applied here on the slide's direct
              // child it reads through to the blob backdrop behind the deck.
              // Opaque variants (including the sample card, now a solid
              // DeckCard preview) skip it so the GPU doesn't pay for an
              // invisible filter pass.
              const wantsBackdropBlur = entry.kind === 'import';
              return (
                <SwiperSlide
                  key={slot.key}
                  style={{ width: cardWidth, height: cardHeight }}
                  // `!overflow-visible` overrides Swiper's bundled
                  // `.swiper-slide { overflow: hidden }` so the card's
                  // drop shadow paints beyond the slide rect. The
                  // `@container` query root used to live here; it now
                  // sits on the card itself so the overlay's expanded
                  // width drives the queries instead of the frozen
                  // slide width.
                  className="!flex origin-[center_bottom] items-center justify-center !overflow-visible will-change-transform"
                >
                  <motion.div
                    initial={isNewSlide ? SLIDE_ENTER : false}
                    animate={isExiting ? SLIDE_EXIT : SLIDE_REST}
                    transition={
                      isExiting
                        ? { duration: 0.3, ease: 'easeIn' }
                        : {
                            type: 'spring',
                            stiffness: 140,
                            damping: 12,
                            mass: 1.1,
                          }
                    }
                    onAnimationComplete={() => {
                      if (isExiting) handleScaleOutComplete(slot.key);
                    }}
                    aria-hidden={isExiting || undefined}
                    className={`h-full w-full ${wantsBackdropBlur ? 'backdrop-blur-md' : ''} ${isExiting ? 'pointer-events-none' : ''}`}
                  >
                    {cardProps ? (
                      <DeckCard {...cardProps} />
                    ) : (
                      <ImportTriggerCard onActivate={() => handleActivate(i)} />
                    )}
                  </motion.div>
                </SwiperSlide>
              );
            })}
          </Swiper>
        ) : null}
      </motion.section>

      {renderDeck.length > 1 && (
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
            onClick={() => swiperRef.current?.slidePrev()}
            disabled={atStart}
            className={GLASS_PILL}
          />
          <div className="flex items-center gap-2.5">
            {renderDeck.map((slot, i) => (
              <button
                key={slot.key}
                type="button"
                onClick={() => swiperRef.current?.slideTo(i)}
                aria-label={`Go to card ${i + 1}`}
                aria-current={i === activeIdx ? 'true' : undefined}
                className={`h-3 cursor-pointer rounded-full border-0 p-0 transition-all duration-200 ${
                  i === activeIdx ? 'bg-sea-green w-9' : 'bg-outline w-3'
                }`}
              />
            ))}
          </div>
          <IconButton
            size="xl"
            variant="text"
            icon={<ChevronRight strokeWidth={2.8} aria-hidden />}
            aria-label="Next protocol"
            onClick={() => swiperRef.current?.slideNext()}
            disabled={atEnd}
            className={GLASS_PILL}
          />
        </motion.div>
      )}
    </div>
  );
}
