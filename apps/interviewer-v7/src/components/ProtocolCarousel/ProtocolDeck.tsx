import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

import { NewSessionCardOverlay } from '../NewSessionCardOverlay';
import { GLASS_PILL } from '../TopActionBar';
import { DeckCard, type DeckEntry } from './DeckCard';

// Visual proportions of the fanned deck — tuned together. Changing one
// without re-checking the others desyncs the snap distance from the
// painted fan.
const CARD_ASPECT = 36 / 47;
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

type ProtocolDeckProps = {
  protocols: ProtocolWithCounts[];
  sessions: StoredSessionLite[];
  initialProtocolHash?: string;
  onImport: () => void;
  onStartInterview: (protocolHash: string) => void;
  onDeleteProtocol: (hash: string) => void;
  // When set, the matching card is rendered in its expanded "new session"
  // state: scaled up, case-ID form swapped in for the description + Start
  // button, swipe/keyboard navigation locked, and sibling slides faded out.
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
  onImport,
  onStartInterview,
  onDeleteProtocol,
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
    if (!initialProtocolHash) return 0;
    const idx = protocols.findIndex((p) => p.hash === initialProtocolHash);
    return idx < 0 ? 0 : idx;
  }, [initialProtocolHash, protocols]);

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

  const { cardWidth, cardHeight, sectionPadding } = useMemo(() => {
    const padding = computeSectionPadding(sectionHeight);
    const innerHeight = Math.max(0, sectionHeight - padding * 2);
    const ch = Math.round(innerHeight);
    const cw = Math.round(ch * CARD_ASPECT);
    return { cardHeight: ch, cardWidth: cw, sectionPadding: padding };
  }, [sectionHeight]);

  const handleActivate = useCallback(
    (idx: number) => {
      if (idx !== activeIdx) {
        swiperRef.current?.slideTo(idx);
        return;
      }
      const entry = deck[idx];
      if (!entry) return;
      if (entry.kind === 'import') {
        onImport();
        return;
      }
      if (entry.kind !== 'protocol') return;
      onStartInterview(entry.protocol.hash);
    },
    [activeIdx, deck, onImport, onStartInterview],
  );

  // Protocols load async, so the first render typically has an empty deck
  // and Swiper's `initialSlide` is applied at index 0. Once the requested
  // index is reachable, jump (no animation) — but only the first time, so
  // we don't fight the user's scrolling later.
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (initialIndex <= 0) return;
    if (initialIndex >= deck.length) return;
    const swiper = swiperRef.current;
    if (!swiper) return;
    didInitialScroll.current = true;
    swiper.slideTo(initialIndex, 0);
  }, [initialIndex, deck.length]);

  useEffect(() => {
    if (activeIdx < deck.length) return;
    swiperRef.current?.slideTo(Math.max(0, deck.length - 1), 0);
  }, [deck.length, activeIdx]);

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

  const pendingProtocol = useMemo(() => {
    if (!newSessionProtocolHash) return undefined;
    return protocols.find((p) => p.hash === newSessionProtocolHash);
  }, [newSessionProtocolHash, protocols]);

  const creativeEffectConfig = useMemo(
    () => ({
      // Clamp at the largest possible offset so far-away cards still get
      // their full transform — opacity 0 from applyOpacityCurve does the
      // hiding, not clamping.
      limitProgress: Math.max(deck.length, 2),
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
    [deck.length],
  );

  const atStart = activeIdx === 0;
  const atEnd = activeIdx === deck.length - 1;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <motion.section
        ref={sectionRef}
        variants={sectionVariants}
        aria-label="Protocol deck"
        // Section stays in its default stacking context so the backdrop
        // (z-40 in Home) sits on top of the carousel. Non-active cards
        // remain visible but read as "behind glass" through the
        // backdrop's blur/dim, while the overlay (portal, z-60) sits
        // above everything.
        style={{ paddingBlock: sectionPadding }}
        // overflow-visible lets the card's drop shadow extend into the
        // section's padding zone without clipping. Swiper sets
        // `overflow: hidden` on itself; we override below so shadows can
        // paint outside the slide rectangle.
        className="relative min-h-0 w-full flex-1"
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
            speed={320}
            initialSlide={initialIndex}
            // Deeper perspective than Swiper's default 1200px to match the
            // original — set inline so it wins against `.swiper-3d`.
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
            onSlideChange={(s) => setActiveIdx(s.activeIndex)}
            onSetTranslate={applyOpacityCurve}
            // !overflow-visible overrides Swiper's bundled
            // `.swiper { overflow: hidden }` so card drop shadows can
            // paint beyond the swiper rect into the section padding.
            className="protocol-deck-swiper h-full w-full !overflow-visible"
          >
            {deck.map((entry, i) => {
              // Unmount the DeckCard whose protocol is being promoted to
              // the overlay so motion sees a single `layoutId` per render
              // — that's what triggers the shared-element morph. The
              // SwiperSlide itself stays mounted so Swiper's slide
              // geometry doesn't shift while the overlay is open.
              const isMorphingOut =
                entry.kind === 'protocol' &&
                entry.protocol.hash === newSessionProtocolHash;
              return (
                <SwiperSlide
                  key={
                    entry.kind === 'protocol' ? entry.protocol.hash : entry.kind
                  }
                  style={{ width: cardWidth, height: cardHeight }}
                  // `!overflow-visible` overrides Swiper's bundled
                  // `.swiper-slide { overflow: hidden }` so the card's
                  // drop shadow paints beyond the slide rect. The
                  // `@container` query root used to live here; it now
                  // sits on the DeckCard itself so the overlay's
                  // expanded width drives the queries instead of the
                  // frozen `cardWidth`.
                  className="!flex origin-[center_bottom] items-center justify-center !overflow-visible will-change-transform"
                >
                  {!isMorphingOut && (
                    <DeckCard
                      entry={entry}
                      cardWidth={cardWidth}
                      cardHeight={cardHeight}
                      isActive={i === activeIdx}
                      sessionCount={
                        entry.kind === 'protocol'
                          ? (sessionCounts.get(entry.protocol.hash) ?? 0)
                          : 0
                      }
                      onActivate={() => handleActivate(i)}
                      onDelete={
                        entry.kind === 'protocol'
                          ? () => onDeleteProtocol(entry.protocol.hash)
                          : undefined
                      }
                    />
                  )}
                </SwiperSlide>
              );
            })}
          </Swiper>
        ) : null}
      </motion.section>

      {deck.length > 1 && (
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
            {deck.map((entry, i) => (
              <button
                key={
                  entry.kind === 'protocol' ? entry.protocol.hash : entry.kind
                }
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

      {/* Portal the overlay to document.body so it escapes Swiper's
          perspective stacking context. Motion's `layoutId` does the
          morph in both directions automatically: when this mounts,
          motion animates it from the (just-unmounted) in-slide
          DeckCard's last rect; when it unmounts, motion animates the
          re-mounting DeckCard from this overlay's last rect. */}
      {createPortal(
        <AnimatePresence>
          {newSessionActive &&
            pendingProtocol &&
            onCancelNewSession &&
            onSessionCreated && (
              <NewSessionCardOverlay
                key="new-session-overlay"
                protocol={pendingProtocol}
                sessionCount={sessionCounts.get(pendingProtocol.hash) ?? 0}
                onCancel={onCancelNewSession}
                onCreated={onSessionCreated}
              />
            )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
