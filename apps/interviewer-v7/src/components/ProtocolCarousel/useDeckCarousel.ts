import {
  type MutableRefObject,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SLOT_TO_CARD_RATIO } from './DeckCard';
import { getScrollTimelineCtor } from './scrollTimeline';

// Visual proportions of the fanned deck. Tuned alongside DeckCard's keyframes
// — changing one without the other will desync the snap distance from the
// painted fan.
const CARD_HEIGHT_PCT = 0.88;
const CARD_ASPECT = 36 / 47;
// Small top/bottom inset so the deck sits below the header instead of hugging
// it. Exposed back to the consumer for `paddingBlock`.
const SECTION_PADDING = 24;

// Vertical mouse-wheel strokes are translated into discrete card advances.
// Trackpad horizontal pans (deltaX-dominant) pass through to native snap.
const WHEEL_ADVANCE_THRESHOLD = 30;
const WHEEL_COOLDOWN_MS = 320;
const WHEEL_IDLE_RESET_MS = 120;

type DeckCarouselOptions = {
  itemCount: number;
  // Index to land on first paint, after layout has settled. Pass `null` to
  // accept the default (index 0).
  initialIndex?: number | null;
};

type DeckCarouselResult = {
  sectionRef: RefObject<HTMLElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  cardRefs: MutableRefObject<(HTMLDivElement | null)[]>;
  activeIdx: number;
  scrollToIndex: (idx: number) => void;
  sectionPadding: number;
  paddingInline: number;
  slotWidth: number;
  cardWidth: number;
  cardHeight: number;
};

export function useDeckCarousel({
  itemCount,
  initialIndex,
}: DeckCarouselOptions): DeckCarouselResult {
  const sectionRef = useRef<HTMLElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [sectionSize, setSectionSize] = useState({ width: 0, height: 0 });

  // Card height = CARD_HEIGHT_PCT of section's available block-size (border
  // box minus our padding-top/bottom). Card width = height × aspect. Slot
  // width = SLOT_TO_CARD_RATIO × card width — the fan spacing dial.
  const { cardHeight, cardWidth, slotWidth, paddingInline } = useMemo(() => {
    const innerHeight = Math.max(0, sectionSize.height - SECTION_PADDING * 2);
    const ch = Math.round(innerHeight * CARD_HEIGHT_PCT);
    const cw = Math.round(ch * CARD_ASPECT);
    const sw = Math.round(cw * SLOT_TO_CARD_RATIO);
    return {
      cardHeight: ch,
      cardWidth: cw,
      slotWidth: sw,
      paddingInline: Math.max(0, (sectionSize.width - sw) / 2),
    };
  }, [sectionSize.width, sectionSize.height]);

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

  // Mirror activeIdx into a ref so long-lived listeners (scroll/wheel/key)
  // can read the latest value without re-subscribing on every state tick.
  const activeIdxRef = useRef(0);
  useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  // Native scroll is the source of truth for which card is active. `Math.round`
  // matches the browser's snap commit, so the CTA jumps to the next card the
  // moment scroll-snap has decided. Trackpad scroll events on macOS fire at
  // ~120Hz; rAF coalescing keeps the React update budget under control.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || slotWidth === 0) return;
    let rafId = 0;
    const sync = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const idx = Math.round(el.scrollLeft / slotWidth);
        const clamped = Math.max(0, Math.min(itemCount - 1, idx));
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
  }, [slotWidth, itemCount]);

  const scrollToIndex = useCallback((idx: number) => {
    cardRefs.current[idx]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, []);

  // Translate vertical wheel deltas into discrete card advances, so wheel
  // scrolling animates the same as the chevron buttons. Accumulate deltaY
  // between events, advance once it crosses the threshold, then cool down so
  // a hard spin doesn't skip the deck. The accumulator resets if the user
  // pauses, so a slow wheel doesn't summon a stale advance later.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    let accumulator = 0;
    let cooldownUntil = 0;
    let lastEventAt = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastEventAt > WHEEL_IDLE_RESET_MS) accumulator = 0;
      lastEventAt = now;
      if (now < cooldownUntil) return;
      accumulator += event.deltaY;
      if (Math.abs(accumulator) < WHEEL_ADVANCE_THRESHOLD) return;
      const direction = accumulator > 0 ? 1 : -1;
      const next = Math.max(
        0,
        Math.min(itemCount - 1, activeIdxRef.current + direction),
      );
      accumulator = 0;
      cooldownUntil = now + WHEEL_COOLDOWN_MS;
      if (next !== activeIdxRef.current) scrollToIndex(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [itemCount, scrollToIndex]);

  // Slide the wrapper's perspective-origin so it tracks the scroll viewport's
  // centre. Without this, perspective is anchored to the wrapper's middle (the
  // middle of all scroll content) and cards near either end look distorted.
  // ScrollTimeline drives this in the same compositor cycle as scroll input.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const section = sectionRef.current;
    if (!wrapper || !section || sectionSize.width === 0) return;
    const Ctor = getScrollTimelineCtor();
    if (!Ctor) return;
    const halfViewport = sectionSize.width / 2;
    const wrapperWidth = wrapper.scrollWidth;
    const timeline = new Ctor({ source: section, axis: 'inline' });
    const animation = wrapper.animate(
      [
        { perspectiveOrigin: `${halfViewport}px 50%` },
        { perspectiveOrigin: `${wrapperWidth - halfViewport}px 50%` },
      ],
      { timeline, fill: 'both' },
    );
    return () => animation.cancel();
  }, [sectionSize.width, slotWidth, itemCount]);

  // Land on the requested index on first paint. Wait for slotWidth so layout
  // has settled before scrolling, and only run once — the scroll listener
  // updates activeIdx as a side effect, which would otherwise re-trigger us.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (initialIndex == null || initialIndex < 0) return;
    if (slotWidth === 0) return;
    didInitialScroll.current = true;
    cardRefs.current[initialIndex]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
    });
  }, [initialIndex, slotWidth]);

  // If the deck shrinks under our feet, scroll the now-out-of-range index back
  // into bounds. setActiveIdx happens via the scroll listener.
  useEffect(() => {
    if (itemCount === 0) return;
    if (activeIdx > itemCount - 1) scrollToIndex(itemCount - 1);
  }, [itemCount, activeIdx, scrollToIndex]);

  // Global ←/→ cycle the deck — it is the primary affordance on Home, so
  // page-wide keys feel natural. Skip when focus is in an editable target.
  // Enter (activate) is a consumer concern and lives in the component.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isEditable) return;
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const next = Math.max(
        0,
        Math.min(itemCount - 1, activeIdxRef.current + delta),
      );
      scrollToIndex(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [itemCount, scrollToIndex]);

  return {
    sectionRef,
    wrapperRef,
    cardRefs,
    activeIdx,
    scrollToIndex,
    sectionPadding: SECTION_PADDING,
    paddingInline,
    slotWidth,
    cardWidth,
    cardHeight,
  };
}
