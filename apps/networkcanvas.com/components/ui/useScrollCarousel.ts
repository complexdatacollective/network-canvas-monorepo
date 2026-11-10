'use client';

import { animate, type AnimationPlaybackControls } from 'motion/react';
import { type RefObject, useEffect } from 'react';

import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

// A section whose cards are read one at a time pages like a touch carousel.
// While the page rests on one of its cards, scrolling does not move the page
// freely: a wheel gesture, a swipe or a key press past a small threshold
// carries the page to the next card in one eased move, and the rest of that
// gesture (a trackpad's momentum, a spun wheel) is spent on it. A swipe
// follows the finger and springs back if it is let go too early. Past the
// first or last card the section lets go and the page scrolls on as normal;
// scrolling back into the section lands on its nearest card.
//
// A card is a stop when it carries `data-scroll-snap-stop` and a CSS
// `scroll-snap-align`; where it rests follows the native scroll-snapping
// rules (its `scroll-margin` included), so each breakpoint's alignment lives
// in its classes. Native snapping itself is not used: it still lets momentum
// carry the page past several cards.

const STOP_SELECTOR = '[data-scroll-snap-stop]';
// How close counts as resting on a stop, in px.
const TOLERANCE = 2;
// How far a wheel gesture has to travel before it turns the page.
const WHEEL_THRESHOLD = 60;
// A wheel gesture (and its momentum) ends after this long without events.
const WHEEL_QUIET = 180;
// A swipe turns the page once it has been dragged this share of the
// viewport, or let go faster than this many px/ms.
const SWIPE_DISTANCE = 0.15;
const SWIPE_VELOCITY = 0.4;
// How far a finger moves before the swipe's direction is decided.
const SWIPE_SLOP = 8;
const PAGE_DURATION = 0.7;
const PAGE_EASE = [0.22, 1, 0.36, 1] as const;

/** Whether `position` lies within the carousel's stops. */
export function isEngaged(stops: readonly number[], position: number) {
  const first = stops[0];
  const last = stops.at(-1);
  return (
    first !== undefined &&
    last !== undefined &&
    position >= first - TOLERANCE &&
    position <= last + TOLERANCE
  );
}

/**
 * The index of the next stop beyond `position` in `direction`, or null when
 * there is none (the carousel lets go).
 */
export function nextStop(
  stops: readonly number[],
  position: number,
  direction: 1 | -1,
): number | null {
  if (direction === 1) {
    const index = stops.findIndex((stop) => stop > position + TOLERANCE);
    return index === -1 ? null : index;
  }
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if ((stops[index] ?? 0) < position - TOLERANCE) return index;
  }
  return null;
}

/** The index of the stop nearest `position`, or null without stops. */
export function nearestStop(stops: readonly number[], position: number) {
  let best: number | null = null;
  for (const [index, stop] of stops.entries()) {
    if (
      best === null ||
      Math.abs(stop - position) < Math.abs((stops[best] ?? 0) - position)
    ) {
      best = index;
    }
  }
  return best;
}

/**
 * Whether a swipe let go after `distance` px, moving at `velocity` px/ms,
 * turns the page.
 */
export function swipeTurnsPage(
  distance: number,
  velocity: number,
  viewport: number,
) {
  return (
    Math.abs(distance) > viewport * SWIPE_DISTANCE ||
    (Math.sign(velocity) === Math.sign(distance) &&
      Math.abs(velocity) > SWIPE_VELOCITY)
  );
}

/** A wheel event's vertical travel in px, whatever unit it was given in. */
export function wheelDelta(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

// Where a stop rests, as a window scroll position.
function restingPosition(stop: HTMLElement) {
  const style = getComputedStyle(stop);
  const align = style.scrollSnapAlign.split(' ')[0];
  if (!align || align === 'none') return null;
  const rect = stop.getBoundingClientRect();
  const marginTop = Number.parseFloat(style.scrollMarginTop) || 0;
  const marginBottom = Number.parseFloat(style.scrollMarginBottom) || 0;
  const areaTop = rect.top - marginTop;
  const areaHeight = rect.height + marginTop + marginBottom;
  const viewport = window.innerHeight;
  const restingTop =
    align === 'center'
      ? (viewport - areaHeight) / 2
      : align === 'end'
        ? viewport - areaHeight
        : 0;
  return window.scrollY + areaTop - restingTop;
}

/**
 * The carousel's stops inside `container`, in order, and where each rests as
 * a window scroll position.
 */
export function measureStops(container: ParentNode) {
  const elements: HTMLElement[] = [];
  const stops: number[] = [];
  for (const element of container.querySelectorAll<HTMLElement>(
    STOP_SELECTOR,
  )) {
    const top = restingPosition(element);
    if (top === null) continue;
    elements.push(element);
    stops.push(top);
  }
  return { elements, stops };
}

// Controls that use these keys themselves; the carousel leaves them alone.
const OWNS_KEYS =
  'input, textarea, select, button, [contenteditable], [role="listbox"], [role="menu"], [role="slider"], [role="tablist"], [role="radiogroup"], [role="grid"], [role="tree"]';

function keyDirection(event: KeyboardEvent): 1 | -1 | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  switch (event.key) {
    case 'ArrowDown':
    case 'PageDown':
      return 1;
    case 'ArrowUp':
    case 'PageUp':
      return -1;
    case ' ':
      return event.shiftKey ? -1 : 1;
    default:
      return null;
  }
}

function scrollInstantly(top: number) {
  window.scrollTo({ top, behavior: 'instant' });
}

type Swipe = {
  startY: number;
  startX: number;
  startPosition: number;
  // null until the finger has moved far enough to tell.
  capturing: boolean | null;
  // How far the page may follow the finger: the card it started on and the
  // next one in the swipe's direction.
  min: number;
  max: number;
  samples: { y: number; time: number }[];
};

/**
 * Makes the stops inside `containerRef` page like a carousel; see above.
 * `onDestination` hears where the page is being carried as each move starts
 * (a window scroll position), and null once it has arrived or been stopped,
 * so what follows the cards can set off with the page rather than after it.
 */
export function useScrollCarousel(
  containerRef: RefObject<HTMLElement | null>,
  onDestination?: (top: number | null) => void,
) {
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let animation: AnimationPlaybackControls | null = null;
    // The stop the page is being carried to, while it is.
    let destination: number | null = null;
    let wheelTravel = 0;
    let lastWheelAt = 0;
    let wheelSpent = false;
    let swipe: Swipe | null = null;
    let pointerDown = false;
    let lastPosition = window.scrollY;

    const measure = () => measureStops(container);

    // Where the page is, or is headed: a second key press while the page is
    // moving turns on from the card it is moving to.
    const position = () => destination ?? window.scrollY;

    const stopAnimation = () => {
      animation?.stop();
      animation = null;
      if (destination !== null) {
        destination = null;
        onDestination?.(null);
      }
    };

    const pageTo = (top: number) => {
      stopAnimation();
      if (Math.abs(top - window.scrollY) < 1) return;
      if (prefersReducedMotion !== false) {
        scrollInstantly(top);
        return;
      }
      destination = top;
      onDestination?.(top);
      animation = animate(window.scrollY, top, {
        duration: PAGE_DURATION,
        ease: PAGE_EASE,
        onUpdate: scrollInstantly,
        onComplete: () => {
          animation = null;
          destination = null;
          onDestination?.(null);
        },
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return;
      }
      const delta = wheelDelta(event);
      if (delta === 0) return;
      const now = performance.now();
      const continuing = now - lastWheelAt < WHEEL_QUIET;
      lastWheelAt = now;
      // The rest of a gesture that has already turned the page: it stays
      // spent until the page has arrived and the wheel has gone quiet.
      if (wheelSpent && (continuing || animation)) {
        event.preventDefault();
        return;
      }
      if (!continuing) {
        wheelTravel = 0;
        wheelSpent = false;
      }

      const { stops } = measure();
      const from = position();
      const direction = delta > 0 ? 1 : -1;
      const target = nextStop(stops, from, direction);
      if (target === null) return;
      const stop = stops[target] ?? 0;
      const engaged = isEngaged(stops, from);
      // Scrolling in from outside lands on the first card it reaches.
      const entering =
        !engaged &&
        (direction === 1 ? from + delta >= stop : from + delta <= stop);
      if (!engaged && !entering) return;

      event.preventDefault();
      wheelTravel += delta;
      if (entering || Math.abs(wheelTravel) >= WHEEL_THRESHOLD) {
        wheelSpent = true;
        pageTo(stop);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest(OWNS_KEYS) !== null
      ) {
        return;
      }
      const direction = keyDirection(event);
      if (direction === null) return;
      const { stops } = measure();
      const from = position();
      if (!isEngaged(stops, from)) return;
      const target = nextStop(stops, from, direction);
      if (target === null) return;
      event.preventDefault();
      pageTo(stops[target] ?? 0);
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) {
        swipe = null;
        return;
      }
      swipe = {
        startY: touch.clientY,
        startX: touch.clientX,
        startPosition: window.scrollY,
        capturing: null,
        min: window.scrollY,
        max: window.scrollY,
        samples: [{ y: touch.clientY, time: event.timeStamp }],
      };
      // A finger on the glass catches the page mid-move, as a carousel does.
      if (animation) {
        stopAnimation();
        swipe.capturing = true;
        const { stops } = measure();
        const above = nextStop(stops, window.scrollY, -1);
        const below = nextStop(stops, window.scrollY, 1);
        swipe.min = above === null ? window.scrollY : (stops[above] ?? 0);
        swipe.max = below === null ? window.scrollY : (stops[below] ?? 0);
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!swipe || !touch) return;
      const travel = swipe.startY - touch.clientY;
      if (swipe.capturing === null) {
        const sideways = Math.abs(touch.clientX - swipe.startX);
        if (Math.abs(travel) < SWIPE_SLOP && sideways < SWIPE_SLOP) return;
        const { stops } = measure();
        const target = nextStop(
          stops,
          swipe.startPosition,
          travel > 0 ? 1 : -1,
        );
        const back = nearestStop(stops, swipe.startPosition);
        swipe.capturing =
          Math.abs(travel) > sideways &&
          isEngaged(stops, swipe.startPosition) &&
          target !== null;
        if (swipe.capturing && target !== null) {
          const ends = [stops[target] ?? 0, stops[back ?? target] ?? 0];
          swipe.min = Math.min(...ends);
          swipe.max = Math.max(...ends);
        }
      }
      if (!swipe.capturing) return;
      event.preventDefault();
      swipe.samples.push({ y: touch.clientY, time: event.timeStamp });
      if (swipe.samples.length > 6) swipe.samples.shift();
      scrollInstantly(
        Math.min(swipe.max, Math.max(swipe.min, swipe.startPosition + travel)),
      );
    };

    const onTouchEnd = () => {
      const current = swipe;
      swipe = null;
      if (!current?.capturing) return;
      const { stops } = measure();
      const travel = window.scrollY - current.startPosition;
      const first = current.samples[0];
      const last = current.samples.at(-1);
      const velocity =
        first && last && last.time > first.time
          ? (first.y - last.y) / (last.time - first.time)
          : 0;
      const back = nearestStop(stops, current.startPosition);
      const ahead = nextStop(stops, current.startPosition, travel > 0 ? 1 : -1);
      const target =
        ahead !== null && swipeTurnsPage(travel, velocity, window.innerHeight)
          ? ahead
          : back;
      if (target !== null) pageTo(stops[target] ?? window.scrollY);
    };

    // Anything else that carries the page into the section (a touch fling,
    // the browser's own scrolling) lands it on the first card it reaches,
    // and anything that leaves it between cards (the scrollbar, find in
    // page) is brought to rest on the nearest.
    const onScroll = () => {
      const now = window.scrollY;
      const previous = lastPosition;
      lastPosition = now;
      if (animation || swipe || pointerDown) return;
      const { stops } = measure();
      const first = stops[0];
      const last = stops.at(-1);
      if (first === undefined || last === undefined) return;
      if (previous < first - TOLERANCE && now >= first - TOLERANCE) {
        pageTo(first);
      } else if (previous > last + TOLERANCE && now <= last + TOLERANCE) {
        pageTo(last);
      }
    };
    const onScrollEnd = () => {
      if (animation || swipe || pointerDown) return;
      const { stops } = measure();
      const now = window.scrollY;
      if (!isEngaged(stops, now)) return;
      const index = nearestStop(stops, now);
      if (index !== null) pageTo(stops[index] ?? now);
    };
    const onMouseDown = () => {
      pointerDown = true;
    };
    const onMouseUp = () => {
      pointerDown = false;
      onScrollEnd();
    };

    // A card reached from the keyboard is brought to rest.
    const onFocusIn = (event: FocusEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.matches(':focus-visible')
      ) {
        return;
      }
      const stop = event.target.closest(STOP_SELECTOR);
      const { elements, stops } = measure();
      const index = stop instanceof HTMLElement ? elements.indexOf(stop) : -1;
      const top = stops[index];
      if (top !== undefined) pageTo(top);
    };

    const active = { passive: false } as const;
    const passive = { passive: true } as const;
    window.addEventListener('wheel', onWheel, active);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchstart', onTouchStart, passive);
    window.addEventListener('touchmove', onTouchMove, active);
    window.addEventListener('touchend', onTouchEnd, passive);
    window.addEventListener('touchcancel', onTouchEnd, passive);
    window.addEventListener('scroll', onScroll, passive);
    document.addEventListener('scrollend', onScrollEnd);
    window.addEventListener('mousedown', onMouseDown, passive);
    window.addEventListener('mouseup', onMouseUp, passive);
    container.addEventListener('focusin', onFocusIn);
    return () => {
      stopAnimation();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scrollend', onScrollEnd);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('focusin', onFocusIn);
    };
  }, [containerRef, onDestination, prefersReducedMotion]);
}
