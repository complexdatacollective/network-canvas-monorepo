import {
  AnimatePresence,
  animate,
  motion,
  type MotionValue,
  type PanInfo,
  useIsPresent,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import {
  DECK_PERSPECTIVE_PX,
  SLOT_TO_CARD_RATIO,
  slidePose,
} from './slidePose';

// One spring for both the deck position and each slide's slot index: when a
// removal shifts both by the same amount in the same frame the two springs
// cancel, so the active card stays visually centred while its neighbours
// close the gap.
const DECK_SPRING = { stiffness: 300, damping: 34, mass: 1 } as const;

// Seconds of velocity projection when picking the snap target after a
// flick — tune by feel on real hardware.
const FLICK_PROJECTION_S = 0.18;

// Wheel: accumulated delta needed to step one card (matching the old
// Swiper thresholdDelta), and a cooldown so trackpad momentum doesn't keep
// stepping after the gesture.
const WHEEL_THRESHOLD = 30;
const WHEEL_COOLDOWN_MS = 250;

// Drag resistance past the first/last card.
const OVERSCROLL_RESIST = 0.25;

// Slide lifecycle poses. A slide animates in once when its slot is added
// and out once when its slot is removed; content changes within a slot
// (sample → installing → protocol) swap without any animation.
const SLIDE_ENTER = { y: -48, opacity: 0, scale: 0.9 };
const SLIDE_REST = { y: 0, opacity: 1, scale: 1 };
const SLIDE_ENTER_SPRING = {
  type: 'spring',
  stiffness: 140,
  damping: 12,
  mass: 1.1,
} as const;
const SLIDE_EXIT = {
  y: 0,
  opacity: 0,
  scale: 0,
  transition: { duration: 0.3, ease: 'easeIn' },
} as const;

export type DeckCarouselSlide = {
  key: string;
  // Primary action when the slide is tapped (or Enter-activated) while
  // active. Undefined = inert (the pending/installing card).
  onActivate?: () => void;
  // Frosted-glass look for the import trigger. The blur must sit on the
  // slide's lifecycle wrapper: applied inside the card it would be scoped
  // by the pose wrapper's stacking context to an empty rect; on the
  // (itself transformed) wrapper it reads through to the blob backdrop.
  backdropBlur?: boolean;
  render: (isActive: boolean, activate: () => void) => ReactNode;
};

export type DeckCarouselHandle = {
  // Snap the deck to an index with no animation (initial deep-link).
  jumpTo: (index: number) => void;
};

type DeckCarouselProps = {
  slides: readonly DeckCarouselSlide[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  disabled: boolean;
  cardWidth: number;
  cardHeight: number;
  ref?: Ref<DeckCarouselHandle>;
};

function clampIndex(value: number, count: number): number {
  return Math.max(0, Math.min(count - 1, value));
}

function rubberBand(raw: number, count: number): number {
  const max = count - 1;
  if (raw < 0) return raw * OVERSCROLL_RESIST;
  if (raw > max) return max + (raw - max) * OVERSCROLL_RESIST;
  return raw;
}

export function DeckCarousel({
  slides,
  activeIndex,
  onActiveIndexChange,
  disabled,
  cardWidth,
  cardHeight,
  ref,
}: DeckCarouselProps) {
  const position = useMotionValue(activeIndex);
  const settleAnimation = useRef<ReturnType<typeof animate> | null>(null);
  // The index the deck is travelling toward; null while a drag is live.
  const settleTarget = useRef<number | null>(activeIndex);
  const dragOrigin = useRef(0);
  const [dragging, setDragging] = useState(false);
  const wheelAccum = useRef(0);
  const wheelLastStep = useRef(0);
  const stride = SLOT_TO_CARD_RATIO * cardWidth;

  const settleTo = useCallback(
    (target: number, velocity = 0) => {
      settleTarget.current = target;
      settleAnimation.current?.stop();
      settleAnimation.current = animate(position, target, {
        type: 'spring',
        ...DECK_SPRING,
        velocity,
      });
    },
    [position],
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpTo: (index: number) => {
        settleAnimation.current?.stop();
        settleTarget.current = index;
        position.jump(index);
      },
    }),
    [position],
  );

  // Travel when the controlled activeIndex departs from the current target
  // (chevrons, dots, keyboard, or slot relocation after a removal).
  useEffect(() => {
    if (dragging) return;
    if (settleTarget.current === activeIndex) return;
    settleTo(activeIndex);
  }, [activeIndex, dragging, settleTo]);

  const handlePanStart = () => {
    if (disabled) return;
    settleAnimation.current?.stop();
    settleTarget.current = null;
    dragOrigin.current = position.get();
    setDragging(true);
  };

  // settleTarget === null is the "drag is live" guard: pan events from a
  // gesture that started while disabled (or before a re-render) are
  // ignored.
  const handlePan = (_event: PointerEvent, info: PanInfo) => {
    if (disabled || settleTarget.current !== null) return;
    const raw = dragOrigin.current - info.offset.x / stride;
    position.set(rubberBand(raw, slides.length));
  };

  const handlePanEnd = (_event: PointerEvent, info: PanInfo) => {
    if (disabled || settleTarget.current !== null) return;
    setDragging(false);
    // Velocity in index units/s; project a little ahead so flicks advance
    // past the halfway point feel right.
    const velocity = -info.velocity.x / stride;
    const projected = position.get() + velocity * FLICK_PROJECTION_S;
    const target = clampIndex(Math.round(projected), slides.length);
    settleTo(target, velocity);
    if (target !== activeIndex) onActiveIndexChange(target);
  };

  // Both axes step the deck (the old config used forceToAxis: false so a
  // plain vertical mouse wheel works); the cooldown suppresses trackpad
  // momentum tails.
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (disabled || dragging) return;
    const now = performance.now();
    if (now - wheelLastStep.current < WHEEL_COOLDOWN_MS) {
      wheelAccum.current = 0;
      return;
    }
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    wheelAccum.current += delta;
    if (Math.abs(wheelAccum.current) < WHEEL_THRESHOLD) return;
    const direction = wheelAccum.current > 0 ? 1 : -1;
    wheelAccum.current = 0;
    wheelLastStep.current = now;
    const next = clampIndex(activeIndex + direction, slides.length);
    if (next !== activeIndex) onActiveIndexChange(next);
  };

  return (
    <motion.div
      onPanStart={handlePanStart}
      onPan={handlePan}
      onPanEnd={handlePanEnd}
      onWheel={handleWheel}
      style={{
        height: cardHeight,
        perspective: DECK_PERSPECTIVE_PX,
        transformStyle: 'preserve-3d',
      }}
      // touch-pan-y: vertical touch gestures stay with the browser;
      // horizontal ones drive the deck.
      className={`relative w-full touch-pan-y ${
        disabled ? '' : dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <AnimatePresence initial={false}>
        {slides.map((slide, index) => (
          <DeckSlide
            key={slide.key}
            slide={slide}
            index={index}
            activeIndex={activeIndex}
            position={position}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            disabled={disabled}
            onSelect={onActiveIndexChange}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

type DeckSlideProps = {
  slide: DeckCarouselSlide;
  index: number;
  activeIndex: number;
  position: MotionValue<number>;
  cardWidth: number;
  cardHeight: number;
  disabled: boolean;
  onSelect: (index: number) => void;
};

function DeckSlide({
  slide,
  index,
  activeIndex,
  position,
  cardWidth,
  cardHeight,
  disabled,
  onSelect,
}: DeckSlideProps) {
  const isPresent = useIsPresent();

  // The slide's own slot index, springed so reindexing after a removal
  // animates in lockstep with the deck position spring (same config).
  const slotIndex = useSpring(index, DECK_SPRING);
  useEffect(() => {
    slotIndex.set(index);
  }, [index, slotIndex]);

  const x = useTransform(
    () => slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight).x,
  );
  const y = useTransform(
    () => slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight).y,
  );
  const z = useTransform(
    () => slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight).z,
  );
  const rotateZ = useTransform(
    () =>
      slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight)
        .rotateZ,
  );
  const opacity = useTransform(
    () =>
      slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight)
        .opacity,
  );

  const isActive = index === activeIndex;
  // Matches the pose's opacity-0 plateau: fully invisible slides must not
  // be reachable by assistive tech or the tab order. Exiting slides
  // likewise.
  const hidden = Math.abs(index - activeIndex) >= 4 || !isPresent;

  const activate = () => {
    if (disabled || !isPresent) return;
    if (!isActive) {
      onSelect(index);
      return;
    }
    slide.onActivate?.();
  };

  const handleTap = (event: PointerEvent | MouseEvent | TouchEvent) => {
    const target = event.target;
    // Interactive descendants (delete button, footer button, links, the
    // case-ID form) own their own activation.
    if (
      target instanceof Element &&
      target.closest(
        'button, a, input, textarea, select, [role="button"], [role="link"]',
      ) !== null
    ) {
      return;
    }
    activate();
  };

  return (
    <motion.div
      style={{
        x,
        y,
        z,
        rotateZ,
        opacity,
        width: cardWidth,
        height: cardHeight,
      }}
      onTap={handleTap}
      aria-hidden={hidden || undefined}
      inert={hidden}
      className="absolute inset-0 m-auto origin-[center_bottom] will-change-transform"
    >
      <motion.div
        initial={SLIDE_ENTER}
        animate={SLIDE_REST}
        exit={SLIDE_EXIT}
        transition={SLIDE_ENTER_SPRING}
        className={`h-full w-full ${slide.backdropBlur ? 'backdrop-blur-md' : ''} ${
          isPresent ? '' : 'pointer-events-none'
        }`}
      >
        {slide.render(isActive, activate)}
      </motion.div>
    </motion.div>
  );
}
