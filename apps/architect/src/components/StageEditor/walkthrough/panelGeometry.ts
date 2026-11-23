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

/** Where the panel goes: its top-left corner, width and height. */
export type Placement = Readonly<{
  left: number;
  top: number;
  width: number;
  tall: number;
}>;

/** How wide the panel would like to be, and how narrow it may become. */
export type Fit = Readonly<{ preferred: number; min: number }>;

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

/** `placement`, made to fit and moved as little as needed to lie inside `room`. */
export function keepInside(placement: Placement, room: Box): Placement {
  const width = Math.min(placement.width, Math.floor(room.width));
  const tall = Math.min(placement.tall, Math.floor(room.height));
  return {
    left: clamp(placement.left, room.left, room.left + room.width - width),
    top: clamp(placement.top, room.top, room.top + room.height - tall),
    width,
    tall,
  };
}

/**
 * Where the panel goes across, to sit beside `target` on the side with more
 * room, narrowed to that room down to `fit.min`; nowhere if neither side is
 * that wide.
 */
export function besideColumn(
  target: Box,
  room: Box,
  fit: Fit,
): Readonly<{ left: number; width: number }> | undefined {
  const leftRoom = target.left - room.left - PANEL_GAP;
  const rightRoom =
    room.left + room.width - target.left - target.width - PANEL_GAP;
  const sideRoom = Math.max(leftRoom, rightRoom);
  if (sideRoom < fit.min) return undefined;
  const width = Math.min(fit.preferred, Math.floor(sideRoom));
  return {
    left:
      leftRoom >= rightRoom
        ? target.left - PANEL_GAP - width
        : target.left + target.width + PANEL_GAP,
    width,
  };
}

/**
 * Where the panel goes so that it leaves `target` uncovered, `PANEL_GAP` away
 * from it. Beside it, lined up with its top, on the side with more room,
 * narrowed to that room down to `fit.min`. Failing that, as wide as it likes
 * above or below it, centred, on the side with more room, shortened to that
 * room down to `minTall` (the step's text scrolls). Where neither leaves the
 * target clear, on the side that covers least of it, as wide and tall as it
 * likes; the caller keeps it inside the room, as close as that allows.
 */
export function besideTarget(
  target: Box,
  room: Box,
  fit: Fit,
  tall: number,
  minTall: number,
): Placement {
  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;
  const roomRight = room.left + room.width;
  const roomBottom = room.top + room.height;

  const beside = besideColumn(target, room, fit);
  if (beside !== undefined) return { ...beside, top: target.top, tall };

  const leftRoom = target.left - room.left - PANEL_GAP;
  const rightRoom = roomRight - targetRight - PANEL_GAP;

  const width = Math.min(fit.preferred, Math.floor(room.width));
  const left = target.left + (target.width - width) / 2;
  const aboveRoom = target.top - room.top - PANEL_GAP;
  const belowRoom = roomBottom - targetBottom - PANEL_GAP;
  const endRoom = Math.max(aboveRoom, belowRoom);
  if (endRoom >= Math.min(tall, minTall)) {
    const fitted = Math.min(tall, Math.floor(endRoom));
    return {
      left,
      top:
        aboveRoom >= belowRoom
          ? target.top - PANEL_GAP - fitted
          : targetBottom + PANEL_GAP,
      width,
      tall: fitted,
    };
  }

  const sides = [
    { side: 'left', spare: leftRoom - width },
    { side: 'right', spare: rightRoom - width },
    { side: 'above', spare: aboveRoom - tall },
    { side: 'below', spare: belowRoom - tall },
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
          : left,
    top:
      side === 'above'
        ? target.top - PANEL_GAP - tall
        : side === 'below'
          ? targetBottom + PANEL_GAP
          : target.top,
    width,
    tall,
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

/**
 * The scroll position that puts the top of `target` at the top of `room`,
 * leaving the room below it for the panel; kept within what the scroller can
 * reach (`0` to `maxScroll`).
 */
export function scrollToTop(
  target: Box,
  room: Box,
  scrollTop: number,
  maxScroll: number,
): number {
  return clamp(scrollTop + target.top - room.top, 0, maxScroll);
}
