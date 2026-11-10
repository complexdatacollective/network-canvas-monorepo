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
//
// Every card can be read in full. A card taller than the area it rests in
// (a short screen, enlarged text) rests on a span rather than a point, from
// its top at the top of that area to its bottom at the bottom of the screen.
// Within the span the page scrolls as normal, a gesture stops at its edge,
// and the next gesture from there turns the page; going down a card is read
// from its top, going back from its bottom.

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
// How far an arrow key moves the page within a tall card, in px, and how
// much of the screen a page key or the space bar moves it.
const ARROW_STEP = 40;
const PAGE_STEP = 0.85;
// How far a let-go swipe carries on within a tall card: its speed (px/ms)
// times this many ms.
const SWIPE_GLIDE = 300;

/**
 * Where the page rests on a card, as window scroll positions: one position
 * (`start` and `end` equal) for a card that fits its area, or the span it is
 * read through for one that does not.
 */
export type Stop = { start: number; end: number };

const clampTo = (stop: Stop, position: number) =>
  Math.min(stop.end, Math.max(stop.start, position));

/** Whether `position` lies within the carousel's stops. */
export function isEngaged(stops: readonly Stop[], position: number) {
  const first = stops[0];
  const last = stops.at(-1);
  return (
    first !== undefined &&
    last !== undefined &&
    position >= first.start - TOLERANCE &&
    position <= last.end + TOLERANCE
  );
}

/**
 * The index of the next stop beyond `position` in `direction`, or null when
 * there is none (the carousel lets go).
 */
export function nextStop(
  stops: readonly Stop[],
  position: number,
  direction: 1 | -1,
): number | null {
  if (direction === 1) {
    const index = stops.findIndex((stop) => stop.start > position + TOLERANCE);
    return index === -1 ? null : index;
  }
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    const stop = stops[index];
    if (stop && stop.end < position - TOLERANCE) return index;
  }
  return null;
}

/**
 * Where the page lands on `stop` arriving in `direction`: a tall card is
 * read from its top going down and from its bottom going back.
 */
export const arrival = (stop: Stop, direction: 1 | -1) =>
  direction === 1 ? stop.start : stop.end;

/** The index of the stop nearest `position`, or null without stops. */
export function nearestStop(stops: readonly Stop[], position: number) {
  const distance = (stop: Stop) =>
    Math.max(0, stop.start - position, position - stop.end);
  let best: number | null = null;
  for (const [index, stop] of stops.entries()) {
    const current = best === null ? undefined : stops[best];
    if (current === undefined || distance(stop) < distance(current)) {
      best = index;
    }
  }
  return best;
}

/** Where the page comes to rest on `stop` from `position`: as near as it can. */
export const restOn = (stop: Stop, position: number) => clampTo(stop, position);

/**
 * The tall card the page is being read through, when there is more of it to
 * read in `direction` from `position`; null when the next move turns the page.
 */
export function readingRoom(
  stops: readonly Stop[],
  position: number,
  direction: 1 | -1,
): Stop | null {
  const stop = stops.find(
    (candidate) =>
      position >= candidate.start - TOLERANCE &&
      position <= candidate.end + TOLERANCE,
  );
  if (!stop) return null;
  const room = direction === 1 ? stop.end - position : position - stop.start;
  return room > TOLERANCE ? stop : null;
}

/**
 * The stop a scroll from `previous` to `now` carries the page onto from
 * outside the carousel: the first card coming down, the last going back.
 * Null when the scroll did not cross into the carousel, or jumped clean
 * across it (End or Home, a link): the page stays where it was sent.
 */
export function enteredAt(
  stops: readonly Stop[],
  previous: number,
  now: number,
): number | null {
  const first = stops[0];
  const last = stops.at(-1);
  if (!first || !last || !isEngaged(stops, now)) return null;
  if (previous < first.start - TOLERANCE) return first.start;
  if (previous > last.end + TOLERANCE) return last.end;
  return null;
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

// Where a stop rests, as window scroll positions.
function restingPosition(stop: HTMLElement): Stop | null {
  const style = getComputedStyle(stop);
  const align = style.scrollSnapAlign.split(' ')[0];
  if (!align || align === 'none') return null;
  const rect = stop.getBoundingClientRect();
  const marginTop = Number.parseFloat(style.scrollMarginTop) || 0;
  const marginBottom = Number.parseFloat(style.scrollMarginBottom) || 0;
  const areaTop = window.scrollY + rect.top - marginTop;
  const areaHeight = rect.height + marginTop + marginBottom;
  const viewport = window.innerHeight;
  // Too tall to rest in one place: read through, from the area's top at the
  // top of the screen to its bottom at the bottom, whatever the alignment.
  if (areaHeight > viewport) {
    return { start: areaTop, end: areaTop + areaHeight - viewport };
  }
  const restingTop =
    align === 'center'
      ? (viewport - areaHeight) / 2
      : align === 'end'
        ? viewport - areaHeight
        : 0;
  const position = areaTop - restingTop;
  return { start: position, end: position };
}

/**
 * The carousel's stops inside `container`, in order, and where each rests as
 * a window scroll position.
 */
export function measureStops(container: ParentNode) {
  const elements: HTMLElement[] = [];
  const stops: Stop[] = [];
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
  // next one in the swipe's direction, or the tall card being read through.
  min: number;
  max: number;
  // Reading through a tall card rather than turning the page.
  reading: boolean;
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
    // The current wheel gesture has been scrolling through a tall card.
    let wheelReading = false;
    let swipe: Swipe | null = null;
    let pointerDown = false;
    // A let-go swipe's momentum is carrying the page.
    let flinging = false;
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
      flinging = false;
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
        wheelReading = false;
      }

      const { stops } = measure();
      const from = position();
      const direction = delta > 0 ? 1 : -1;
      const room = readingRoom(stops, from, direction);
      if (room) {
        // Reading through a tall card: the page scrolls as normal up to the
        // card's edge, where the rest of the gesture is spent.
        wheelReading = true;
        if (animation) {
          event.preventDefault();
          return;
        }
        const edge = arrival(room, direction === 1 ? -1 : 1);
        const to = from + delta;
        if (direction === 1 ? to < edge : to > edge) return;
        event.preventDefault();
        scrollInstantly(edge);
        wheelSpent = true;
        return;
      }
      // A gesture that has read to a card's edge does not go on to turn the
      // page; the next one does.
      if (wheelReading) {
        event.preventDefault();
        wheelSpent = true;
        return;
      }
      const target = nextStop(stops, from, direction);
      const stop = target === null ? undefined : stops[target];
      if (!stop) return;
      const landing = arrival(stop, direction);
      const engaged = isEngaged(stops, from);
      // Scrolling in from outside lands on the first card it reaches.
      const entering =
        !engaged &&
        (direction === 1 ? from + delta >= landing : from + delta <= landing);
      if (!engaged && !entering) return;

      event.preventDefault();
      wheelTravel += delta;
      if (entering || Math.abs(wheelTravel) >= WHEEL_THRESHOLD) {
        wheelSpent = true;
        pageTo(landing);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      flinging = false;
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
      const room = readingRoom(stops, from, direction);
      if (room) {
        // Reading through a tall card: the key scrolls it, as far as its edge.
        event.preventDefault();
        if (animation) return;
        const step = event.key.startsWith('Arrow')
          ? ARROW_STEP
          : window.innerHeight * PAGE_STEP;
        window.scrollTo({
          top: clampTo(room, from + direction * step),
          behavior: prefersReducedMotion === false ? 'smooth' : 'instant',
        });
        return;
      }
      const target = nextStop(stops, from, direction);
      const stop = target === null ? undefined : stops[target];
      if (!stop) return;
      event.preventDefault();
      pageTo(arrival(stop, direction));
    };

    const onTouchStart = (event: TouchEvent) => {
      flinging = false;
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
        reading: false,
        samples: [{ y: touch.clientY, time: event.timeStamp }],
      };
      // A finger on the glass catches the page mid-move, as a carousel does.
      if (animation) {
        stopAnimation();
        swipe.capturing = true;
        const { stops } = measure();
        const above = nextStop(stops, window.scrollY, -1);
        const below = nextStop(stops, window.scrollY, 1);
        const aboveStop = above === null ? undefined : stops[above];
        const belowStop = below === null ? undefined : stops[below];
        swipe.min = aboveStop ? arrival(aboveStop, -1) : window.scrollY;
        swipe.max = belowStop ? arrival(belowStop, 1) : window.scrollY;
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
        const direction = travel > 0 ? 1 : -1;
        const vertical =
          Math.abs(travel) > sideways && isEngaged(stops, swipe.startPosition);
        const room = readingRoom(stops, swipe.startPosition, direction);
        const target = nextStop(stops, swipe.startPosition, direction);
        const ahead = target === null ? undefined : stops[target];
        const back = nearestStop(stops, swipe.startPosition);
        const backStop = back === null ? undefined : stops[back];
        if (vertical && room) {
          // Reading through a tall card: the page follows the finger within it.
          swipe.capturing = true;
          swipe.reading = true;
          swipe.min = room.start;
          swipe.max = room.end;
        } else if (vertical && ahead) {
          swipe.capturing = true;
          const ends = [
            arrival(ahead, direction),
            backStop
              ? restOn(backStop, swipe.startPosition)
              : swipe.startPosition,
          ];
          swipe.min = Math.min(...ends);
          swipe.max = Math.max(...ends);
        } else {
          swipe.capturing = false;
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
      if (!current?.capturing) {
        // The swipe and its momentum are one movement: one that started
        // outside the section and is carried into it lands on the first
        // card it reaches, even when the finger had already crossed in.
        if (current) lastPosition = current.startPosition;
        flinging = true;
        return;
      }
      const { stops } = measure();
      const travel = window.scrollY - current.startPosition;
      const first = current.samples[0];
      const last = current.samples.at(-1);
      const velocity =
        first && last && last.time > first.time
          ? (first.y - last.y) / (last.time - first.time)
          : 0;
      if (current.reading) {
        // Let go within a tall card: it glides on a little, up to its edge.
        pageTo(
          Math.min(
            current.max,
            Math.max(current.min, window.scrollY + velocity * SWIPE_GLIDE),
          ),
        );
        return;
      }
      const direction = travel > 0 ? 1 : -1;
      const back = nearestStop(stops, current.startPosition);
      const backStop = back === null ? undefined : stops[back];
      const target = nextStop(stops, current.startPosition, direction);
      const ahead = target === null ? undefined : stops[target];
      if (ahead && swipeTurnsPage(travel, velocity, window.innerHeight)) {
        pageTo(arrival(ahead, direction));
      } else if (backStop) {
        pageTo(restOn(backStop, current.startPosition));
      }
    };

    // A touch fling that carries the page into the section lands it on the
    // first card it reaches, rather than flying on through the cards. A
    // scroll the browser was sent on (End, Home, a link, find in page) is
    // left to arrive where it was sent; if that is between two cards, it is
    // brought to rest on the nearest once it stops, as anything else is that
    // leaves it there (the scrollbar, a native key scroll).
    const onScroll = () => {
      const now = window.scrollY;
      const previous = lastPosition;
      lastPosition = now;
      if (!flinging || animation || swipe || pointerDown) return;
      const landing = enteredAt(measure().stops, previous, now);
      if (landing === null) return;
      flinging = false;
      pageTo(landing);
    };
    const onScrollEnd = () => {
      flinging = false;
      if (animation || swipe || pointerDown) return;
      const { stops } = measure();
      const now = window.scrollY;
      if (!isEngaged(stops, now)) return;
      const index = nearestStop(stops, now);
      const stop = index === null ? undefined : stops[index];
      if (stop) pageTo(restOn(stop, now));
    };
    const onMouseDown = () => {
      flinging = false;
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
      const resting = stops[index];
      if (resting) pageTo(restOn(resting, window.scrollY));
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
