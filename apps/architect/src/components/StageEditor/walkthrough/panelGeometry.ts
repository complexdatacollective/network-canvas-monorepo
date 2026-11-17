/**
 * The walkthrough panel's geometry, as pure functions of boxes on screen, so
 * it can be tested without a DOM.
 */

/** A box on screen, in viewport pixels. `DOMRect` is one. */
export type Box = Readonly<{
  top: number;
  left: number;
  width: number;
  height: number;
}>;

/** Where the panel goes: its top-left corner and height. */
export type Placement = Readonly<{ left: number; top: number; tall: number }>;

/** The space kept between the panel and the section it sits beside. */
export const PANEL_GAP = 24;

/** How far the highlight ring sits outside what it rings. */
const RING_INSET = 8;

/** `value`, kept between `min` and `max`; `min` wins if they cross. */
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** The highlight ring around `box`. */
export const ringAround = (box: Box): Box => ({
  top: box.top - RING_INSET,
  left: box.left - RING_INSET,
  width: box.width + RING_INSET * 2,
  height: box.height + RING_INSET * 2,
});

/** `placement`, moved as little as needed to lie inside `room`. */
export function keepInside(
  placement: Placement,
  room: Box,
  width: number,
): Placement {
  const tall = Math.min(placement.tall, Math.floor(room.height));
  return {
    left: clamp(placement.left, room.left, room.left + room.width - width),
    top: clamp(placement.top, room.top, room.top + room.height - tall),
    tall,
  };
}

/**
 * Where a panel `width` wide and `tall` high goes beside `target`,
 * `PANEL_GAP` away from it, on whichever side leaves the most room: lined up
 * with its top beside it, or with its middle above or below it. Where no side
 * has room for the whole panel, the caller keeps it inside the room, as close
 * as that allows.
 */
export function besideTarget(
  target: Box,
  room: Box,
  width: number,
  tall: number,
): Readonly<{ left: number; top: number }> {
  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;
  const sides = [
    { side: 'left', spare: target.left - room.left - width },
    { side: 'right', spare: room.left + room.width - targetRight - width },
    { side: 'above', spare: target.top - room.top - tall },
    { side: 'below', spare: room.top + room.height - targetBottom - tall },
  ] as const;
  const { side } = sides.reduce((best, next) =>
    next.spare > best.spare ? next : best,
  );
  return {
    left:
      side === 'left'
        ? target.left - PANEL_GAP - width
        : side === 'right'
          ? targetRight + PANEL_GAP
          : target.left + (target.width - width) / 2,
    top:
      side === 'above'
        ? target.top - PANEL_GAP - tall
        : side === 'below'
          ? targetBottom + PANEL_GAP
          : target.top,
  };
}

/**
 * The scroll position that brings `target` into the middle of `room`, or, for
 * a target taller than the room, puts its top at the top of the room; kept
 * within what the scroller can reach (`0` to `maxScroll`).
 */
export function scrollToCentre(
  target: Box,
  room: Box,
  scrollTop: number,
  maxScroll: number,
): number {
  const want =
    target.height > room.height
      ? room.top
      : room.top + (room.height - target.height) / 2;
  return clamp(scrollTop + target.top - want, 0, maxScroll);
}
