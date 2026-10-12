'use client';

import { useGesture } from '@use-gesture/react';
import {
  animate,
  type AnimationPlaybackControls,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from 'motion/react';
import { type RefObject, useCallback, useMemo, useRef, useState } from 'react';

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
// How much of the family stays on screen, at least, however far it is
// dragged away.
const KEEP_VISIBLE = 120;
// A press that moves less than this is a click, not a drag.
const DRAG_THRESHOLD = 5;

const SPRING = { type: 'spring', stiffness: 260, damping: 32 } as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * The zoom a wheel event asks for, as a power of two. Browsers and devices
 * report wheel movement very differently: a Windows mouse notch is 100 pixels,
 * Firefox counts lines, and a macOS trackpad sends many small deltas, with a
 * pinch arriving as a wheel event with the control key held. These are the
 * weights d3-zoom uses, which make each of them feel alike: a notch is about
 * an eighth, a trackpad swipe a steady glide, a pinch tracks the fingers.
 */
function wheelZoom(event: WheelEvent) {
  const perUnit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 0.05
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 1
        : 0.002;
  // A single event never zooms by more than half or double, whatever a
  // device's momentum reports.
  return clamp(-event.deltaY * perUnit * (event.ctrlKey ? 10 : 1), -1, 1);
}

/** Where the content sits: its offset in the viewport, and its scale. */
export type View = { x: number; y: number; scale: number };

/** How far in from each edge of the viewport something covers it. */
export type Insets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** A rectangle, in the content's own (unscaled) units or in viewport pixels. */
export type Box = { left: number; top: number; right: number; bottom: number };

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
// How far in from the viewport's edges something is brought into view, when
// nothing covers them.
const MARGIN: Insets = { top: 24, right: 24, bottom: 24, left: 24 };

/**
 * How far around something a ring of controls reaches, on every side: so
 * many content units, scaled with the zoom, but never less than so many
 * pixels on screen (for controls that keep a minimum size when zoomed out).
 */
export type Reach = { content: number; screen: number };

/**
 * Keeps someone in the family on screen, whatever offset is asked for: the
 * offset nearest to it at which at least `keep` pixels (or all, if they are
 * smaller) of one of `people` (boxes in the content, unscaled) lie inside the
 * part of the viewport the insets leave clear. Empty space in the family's
 * box, and the padding around it, do not count.
 */
export function clampPanToKeep(
  next: View,
  people: readonly Box[],
  viewport: { width: number; height: number },
  insets: Insets = NO_INSETS,
  keep = KEEP_VISIBLE,
): { x: number; y: number } {
  const axis = (
    offset: number,
    start: number,
    end: number,
    size: number,
    before: number,
    after: number,
  ) => {
    const keepHere = Math.min(keep, (end - start) * next.scale);
    // The far edge at least `keep` past the clear area's start, and the near
    // edge at least `keep` short of its end.
    const min = before + keepHere - end * next.scale;
    const max = size - after - keepHere - start * next.scale;
    return min > max ? (min + max) / 2 : clamp(offset, min, max);
  };
  let best: { x: number; y: number; distance: number } | undefined;
  for (const box of people) {
    const x = axis(
      next.x,
      box.left,
      box.right,
      viewport.width,
      insets.left,
      insets.right,
    );
    const y = axis(
      next.y,
      box.top,
      box.bottom,
      viewport.height,
      insets.top,
      insets.bottom,
    );
    const distance = Math.hypot(x - next.x, y - next.y);
    if (!best || distance < best.distance) best = { x, y, distance };
    if (distance === 0) break;
  }
  return best ? { x: best.x, y: best.y } : { x: next.x, y: next.y };
}

/**
 * The view that keeps everything in `keep` (boxes in the content, unscaled)
 * inside `area` (viewport pixels), changing `view` as little as it can: it
 * zooms out, no further than the zoom allows, holding `pivot` (a content
 * point) where it is on screen, and then moves just far enough. When even
 * the furthest zoom cannot fit everything, `required` alone is kept in.
 */
export function viewKeepingInArea({
  view,
  required,
  keep,
  area,
  pivot,
}: {
  view: View;
  required: Box;
  keep: readonly Box[];
  area: Box;
  pivot: { x: number; y: number };
}): View {
  const all = [required, ...keep].reduce((union, box) => ({
    left: Math.min(union.left, box.left),
    top: Math.min(union.top, box.top),
    right: Math.max(union.right, box.right),
    bottom: Math.max(union.bottom, box.bottom),
  }));
  const areaWidth = area.right - area.left;
  const areaHeight = area.bottom - area.top;
  const scale = clamp(
    Math.min(
      view.scale,
      areaWidth / Math.max(all.right - all.left, 1),
      areaHeight / Math.max(all.bottom - all.top, 1),
    ),
    Math.min(MIN_SCALE, view.scale),
    view.scale,
  );
  // Zoomed about the pivot, so it stays where it was on screen.
  let x = view.x + pivot.x * view.scale - pivot.x * scale;
  let y = view.y + pivot.y * view.scale - pivot.y * scale;
  const shift = (
    offset: number,
    start: number,
    end: number,
    areaStart: number,
    areaEnd: number,
  ) => {
    const from = offset + start * scale;
    const to = offset + end * scale;
    if (from < areaStart) return areaStart - from;
    if (to > areaEnd) return areaEnd - to;
    return 0;
  };
  const fitsAcross = (all.right - all.left) * scale <= areaWidth + 0.5;
  const fitsDown = (all.bottom - all.top) * scale <= areaHeight + 0.5;
  const across = fitsAcross ? all : required;
  const down = fitsDown ? all : required;
  x += shift(x, across.left, across.right, area.left, area.right);
  y += shift(y, down.top, down.bottom, area.top, area.bottom);
  return { x, y, scale };
}

const unionOf = (boxes: readonly Box[]): Box =>
  boxes.reduce((union, box) => ({
    left: Math.min(union.left, box.left),
    top: Math.min(union.top, box.top),
    right: Math.max(union.right, box.right),
    bottom: Math.max(union.bottom, box.bottom),
  }));

/**
 * How far to move the view, in viewport pixels, to bring `targets` (boxes
 * in viewport pixels) inside `area`: all of them when they fit, or else the
 * first. Never so far that what is kept (boxes in viewport pixels) leaves
 * the area: `keep` lists what to keep, most wanted first (say, someone with
 * room for their menu, then the person alone), and along each axis the
 * first the area can hold is kept. What was placed in view on purpose is not
 * undone by bringing something else into view.
 */
export function shiftIntoArea({
  targets,
  keep = [],
  area,
}: {
  targets: readonly Box[];
  keep?: readonly (readonly Box[])[];
  area: Box;
}): { x: number; y: number } {
  const [first] = targets;
  if (!first) return { x: 0, y: 0 };
  const all = unionOf(targets);
  const axis = (
    start: number,
    end: number,
    firstStart: number,
    firstEnd: number,
    areaStart: number,
    areaEnd: number,
    kept: readonly (readonly (readonly [number, number])[])[],
  ) => {
    // Everything, when it fits; otherwise the focused element.
    const [from, to] =
      end - start <= areaEnd - areaStart
        ? [start, end]
        : [firstStart, firstEnd];
    const wanted =
      from < areaStart ? areaStart - from : to > areaEnd ? areaEnd - to : 0;
    // The shifts that leave everything kept inside the area.
    for (const boxes of kept) {
      let least = Number.NEGATIVE_INFINITY;
      let most = Number.POSITIVE_INFINITY;
      for (const [keptStart, keptEnd] of boxes) {
        least = Math.max(least, areaStart - keptStart);
        most = Math.min(most, areaEnd - keptEnd);
      }
      if (least <= most) return clamp(wanted, least, most);
    }
    return wanted;
  };
  return {
    x: axis(
      all.left,
      all.right,
      first.left,
      first.right,
      area.left,
      area.right,
      keep.map((boxes) => boxes.map((box) => [box.left, box.right] as const)),
    ),
    y: axis(
      all.top,
      all.bottom,
      first.top,
      first.bottom,
      area.top,
      area.bottom,
      keep.map((boxes) => boxes.map((box) => [box.top, box.bottom] as const)),
    ),
  };
}

/**
 * The view that puts the middle of `boxes` (in the content, unscaled) at the
 * middle of `area` (viewport pixels), at the zoom of `view`, or zoomed out,
 * no further than the zoom allows, when they do not all fit in the area.
 */
export function viewCentredOn({
  view,
  boxes,
  area,
}: {
  view: View;
  boxes: readonly Box[];
  area: Box;
}): View {
  if (boxes.length === 0) return view;
  const all = unionOf(boxes);
  const areaWidth = area.right - area.left;
  const areaHeight = area.bottom - area.top;
  const scale = clamp(
    Math.min(
      view.scale,
      areaWidth / Math.max(all.right - all.left, 1),
      areaHeight / Math.max(all.bottom - all.top, 1),
    ),
    Math.min(MIN_SCALE, view.scale),
    view.scale,
  );
  return {
    x: (area.left + area.right) / 2 - ((all.left + all.right) / 2) * scale,
    y: (area.top + area.bottom) / 2 - ((all.top + all.bottom) / 2) * scale,
    scale,
  };
}

export type PanZoom = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  /** Moves the middle of elements to the middle of the viewport, or of the
   * part of it from its left edge to `visibleRight` (a client x), inside
   * the given insets; zoomed out, if it has to be, so they all fit. */
  centreOn: (
    elements: HTMLElement | HTMLElement[],
    options?: { visibleRight?: number; animated?: boolean; insets?: Insets },
  ) => void;
  /** Pans just enough to bring elements fully into view, inside the given
   * insets (24 pixels from each edge, without them): all of them when they
   * fit, or else the first; but not so far that the elements in `keep`, with
   * `around` pixels on screen about each if it can, leave that area. Measured where
   * the view is headed, so it follows on from a move already under way. */
  bringIntoView: (
    elements: HTMLElement | HTMLElement[],
    insets?: Insets,
    keep?: { elements: HTMLElement[]; around?: number },
  ) => void;
  /** Zooms by a power of two about the viewport's centre; or, given elements
   * in focus, about the first of them, bringing them all into view. */
  zoomBy: (exponent: number, focus?: ZoomFocus) => void;
  /** Fits an element of the content in the viewport, inside the given
   * insets, at no more than its natural size, with room for controls that
   * reach out around it. Given `least`, it zooms out no further than
   * `least.scale`: when the element would need to, it is shown at that
   * zoom with `least.around` in the middle instead. */
  fitToView: (
    element: HTMLElement,
    insets: Insets,
    options?: {
      animated?: boolean;
      reach?: Reach;
      least?: { scale: number; around: HTMLElement };
    },
  ) => void;
  /** Keeps an element where it is on screen across a change of layout,
   * given where it was in the content before the change. */
  holdInPlace: (
    element: HTMLElement,
    previous: { x: number; y: number },
  ) => void;
  /** Where an element's centre sits in the content, unscaled. */
  contentPositionOf: (element: HTMLElement) => { x: number; y: number };
  /** The view as it stands. */
  view: () => View;
  /** Glides to a view. */
  goTo: (view: View) => void;
};

/** What a zoom from the keyboard keeps in view: the focused element (zoomed
 * about) and anything shown with it, clear of the given insets. */
export type ZoomFocus = { elements: HTMLElement[]; insets?: Insets };

/**
 * Drag to pan, wheel or pinch to zoom, for a content layer inside a clipped
 * viewport. The content is moved with a transform from its top-left corner;
 * the transform lives in motion values, so panning re-renders nothing.
 *
 * The family is the content layer's first child; the layer's padding around
 * it does not count as family when keeping some of it on screen. Some of it
 * always stays inside the part of the viewport `clearInsets` leave
 * uncovered.
 *
 * A drag that starts on a person still pans, and the click that ends it is
 * swallowed, so the person is not selected.
 */
export function usePanZoom({
  viewportRef,
  contentRef,
  clearInsets,
}: {
  viewportRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  /** How far in from each edge of the viewport overlays cover it. */
  clearInsets?: () => Insets;
}): PanZoom {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const reduceMotion = useReducedMotion();
  const animations = useRef<AnimationPlaybackControls[]>([]);
  // Where an animated move is headed, while it is under way.
  const destination = useRef<View | null>(null);
  const dragged = useRef(false);

  const stopAnimating = useCallback(() => {
    for (const animation of animations.current) animation.stop();
    animations.current = [];
    destination.current = null;
  }, []);

  // Keeps some of the family on screen, clear of the overlays, so it cannot
  // be lost off an edge.
  const clampPan = useCallback(
    (nextX: number, nextY: number, nextScale: number) => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return { x: nextX, y: nextY };
      // The family is the content's first child, and its people are its own
      // children; without them, the content as a whole is kept in view.
      const family = content.firstElementChild;
      const people =
        family instanceof HTMLElement
          ? [...family.children]
              .filter((child) => child instanceof HTMLElement)
              .map((person) => {
                const left = family.offsetLeft + person.offsetLeft;
                const top = family.offsetTop + person.offsetTop;
                return {
                  left,
                  top,
                  right: left + person.offsetWidth,
                  bottom: top + person.offsetHeight,
                };
              })
          : [];
      return clampPanToKeep(
        { x: nextX, y: nextY, scale: nextScale },
        people.length > 0
          ? people
          : [
              {
                left: 0,
                top: 0,
                right: content.offsetWidth,
                bottom: content.offsetHeight,
              },
            ],
        { width: viewport.clientWidth, height: viewport.clientHeight },
        clearInsets?.(),
      );
    },
    [viewportRef, contentRef, clearInsets],
  );

  const moveTo = useCallback(
    (nextX: number, nextY: number, nextScale: number, animated: boolean) => {
      stopAnimating();
      const target = clampPan(nextX, nextY, nextScale);
      if (!animated || reduceMotion) {
        x.set(target.x);
        y.set(target.y);
        scale.set(nextScale);
        return;
      }
      destination.current = { ...target, scale: nextScale };
      animations.current = [
        animate(x, target.x, SPRING),
        animate(y, target.y, SPRING),
        animate(scale, nextScale, SPRING),
      ];
    },
    [stopAnimating, clampPan, reduceMotion, x, y, scale],
  );

  // Zooms so the content point under (clientX, clientY) stays under it.
  const zoomAt = useCallback(
    (nextScale: number, clientX: number, clientY: number, animated = false) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const bounded = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const box = viewport.getBoundingClientRect();
      const pointX = clientX - box.left;
      const pointY = clientY - box.top;
      const ratio = bounded / scale.get();
      moveTo(
        pointX - (pointX - x.get()) * ratio,
        pointY - (pointY - y.get()) * ratio,
        bounded,
        animated,
      );
    },
    [viewportRef, moveTo, x, y, scale],
  );

  useGesture(
    {
      onDragStart: () => stopAnimating(),
      // The drag's whole movement, from where it started, is kept in view,
      // rather than each step of it from where the last left off: a step
      // clamped on its own falls back into the gap between two generations
      // (when a row is further from the next than the canvas is tall), so a
      // slow drag could never cross it, while a quick one jumped it.
      onDrag: ({ movement: [mx, my], pinching, tap, last, memo }) => {
        if (pinching || tap) return undefined;
        const origin: { x: number; y: number } = memo ?? {
          x: x.get() - mx,
          y: y.get() - my,
        };
        dragged.current = true;
        const viewport = viewportRef.current;
        if (viewport) viewport.style.cursor = last ? '' : 'grabbing';
        const target = clampPan(origin.x + mx, origin.y + my, scale.get());
        x.set(target.x);
        y.set(target.y);
        return origin;
      },
      onPinchStart: () => stopAnimating(),
      onPinch: ({ offset: [nextScale], origin: [originX, originY], event }) => {
        event.preventDefault();
        zoomAt(nextScale, originX, originY);
      },
      // The gesture's closing call, a moment after the wheel stops, repeats
      // its last event; it is not more wheel.
      onWheel: ({ event, last }) => {
        if (last) return;
        event.preventDefault();
        stopAnimating();
        zoomAt(
          scale.get() * 2 ** wheelZoom(event),
          event.clientX,
          event.clientY,
        );
      },
      // A new press forgets the last drag. Capture runs before any person's
      // own handler sees the press.
      onPointerDownCapture: () => {
        dragged.current = false;
      },
      onClickCapture: ({ event }) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.stopPropagation();
        event.preventDefault();
      },
    },
    {
      target: viewportRef,
      eventOptions: { passive: false },
      drag: {
        filterTaps: true,
        threshold: DRAG_THRESHOLD,
        // Only the primary button pans; touch and pen always count. The
        // arrow keys move between people (and focus pans to them), so they
        // must not also drag the canvas: a keyboard drag would mark the next
        // click, from Enter or Space on a person, as the end of a drag and
        // swallow it.
        pointer: { buttons: 1, keys: false },
      },
      pinch: {
        // Wheel pinches are handled with the wheel, so trackpads and mice
        // share one sensitivity.
        pinchOnWheel: false,
        scaleBounds: { min: MIN_SCALE, max: MAX_SCALE },
        from: () => [scale.get(), 0],
      },
    },
  );

  // From layout offsets, which a transform part-way through an animation
  // does not affect.
  const contentPositionOf = useCallback(
    (element: HTMLElement) => {
      const content = contentRef.current;
      let left = element.offsetWidth / 2;
      let top = element.offsetHeight / 2;
      let current: Element | null = element;
      while (current instanceof HTMLElement && current !== content) {
        left += current.offsetLeft;
        top += current.offsetTop;
        current = current.offsetParent;
      }
      return { x: left, y: top };
    },
    [contentRef],
  );

  // A content element's box, unscaled.
  const contentBoxOf = useCallback(
    (element: HTMLElement): Box => {
      const centre = contentPositionOf(element);
      const halfWidth = element.offsetWidth / 2;
      const halfHeight = element.offsetHeight / 2;
      return {
        left: centre.x - halfWidth,
        top: centre.y - halfHeight,
        right: centre.x + halfWidth,
        bottom: centre.y + halfHeight,
      };
    },
    [contentPositionOf],
  );

  const centreOn = useCallback<PanZoom['centreOn']>(
    (elements, { visibleRight, animated = true, insets = NO_INSETS } = {}) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const box = viewport.getBoundingClientRect();
      const right =
        visibleRight === undefined
          ? box.right
          : clamp(visibleRight, box.left, box.right);
      const targets = Array.isArray(elements) ? elements : [elements];
      const next = viewCentredOn({
        view: { x: x.get(), y: y.get(), scale: scale.get() },
        boxes: targets.map(contentBoxOf),
        area: {
          left: insets.left,
          top: insets.top,
          right: right - box.left - insets.right,
          bottom: box.height - insets.bottom,
        },
      });
      moveTo(next.x, next.y, next.scale, animated);
    },
    [viewportRef, contentBoxOf, moveTo, x, y, scale],
  );

  const bringIntoView = useCallback<PanZoom['bringIntoView']>(
    (elements, insets = MARGIN, keep) => {
      const viewport = viewportRef.current;
      const targets = Array.isArray(elements) ? elements : [elements];
      if (!viewport || targets.length === 0) return;
      const box = viewport.getBoundingClientRect();
      const now = { x: x.get(), y: y.get(), scale: scale.get() };
      const headed = destination.current ?? now;
      // Each element where it will be once the view gets where it is headed.
      const ratio = headed.scale / now.scale;
      const placedAt = (element: HTMLElement, around = 0): Box => {
        const shown = element.getBoundingClientRect();
        const atX = (client: number) =>
          headed.x + (client - box.left - now.x) * ratio;
        const atY = (client: number) =>
          headed.y + (client - box.top - now.y) * ratio;
        return {
          left: atX(shown.left) - around,
          right: atX(shown.right) + around,
          top: atY(shown.top) - around,
          bottom: atY(shown.bottom) + around,
        };
      };
      const shift = shiftIntoArea({
        targets: targets.map((element) => placedAt(element)),
        // With room around, or else alone.
        keep: keep
          ? [
              keep.elements.map((element) => placedAt(element, keep.around)),
              keep.elements.map((element) => placedAt(element)),
            ]
          : [],
        area: {
          left: insets.left,
          top: insets.top,
          right: box.width - insets.right,
          bottom: box.height - insets.bottom,
        },
      });
      if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5) return;
      moveTo(headed.x + shift.x, headed.y + shift.y, headed.scale, true);
    },
    [viewportRef, moveTo, x, y, scale],
  );

  const zoomBy = useCallback<PanZoom['zoomBy']>(
    (exponent, focus) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const about = (focus?.elements[0] ?? viewport).getBoundingClientRect();
      zoomAt(
        scale.get() * 2 ** exponent,
        about.left + about.width / 2,
        about.top + about.height / 2,
        true,
      );
      if (focus) bringIntoView(focus.elements, focus.insets);
    },
    [viewportRef, zoomAt, scale, bringIntoView],
  );

  const fitToView = useCallback<PanZoom['fitToView']>(
    (element, insets, { animated = true, reach, least } = {}) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width === 0 || height === 0) return;
      const centre = contentPositionOf(element);
      const availableWidth = viewport.clientWidth - insets.left - insets.right;
      const availableHeight =
        viewport.clientHeight - insets.top - insets.bottom;
      // The reach on either side scales with the zoom, and is never less
      // than its least size on screen.
      const around = reach ?? { content: 0, screen: 0 };
      const nextScale = clamp(
        Math.min(
          availableWidth / (width + 2 * around.content),
          (availableWidth - 2 * around.screen) / width,
          availableHeight / (height + 2 * around.content),
          (availableHeight - 2 * around.screen) / height,
        ),
        MIN_SCALE,
        1,
      );
      if (least && nextScale < least.scale) {
        const middle = contentPositionOf(least.around);
        const leastScale = clamp(least.scale, MIN_SCALE, 1);
        moveTo(
          insets.left + availableWidth / 2 - middle.x * leastScale,
          insets.top + availableHeight / 2 - middle.y * leastScale,
          leastScale,
          animated,
        );
        return;
      }
      moveTo(
        insets.left + availableWidth / 2 - centre.x * nextScale,
        insets.top + availableHeight / 2 - centre.y * nextScale,
        nextScale,
        animated,
      );
    },
    [viewportRef, contentPositionOf, moveTo],
  );

  const holdInPlace = useCallback<PanZoom['holdInPlace']>(
    (element, previous) => {
      const now = contentPositionOf(element);
      const current = scale.get();
      const shiftX = (previous.x - now.x) * current;
      const shiftY = (previous.y - now.y) * current;
      if (Math.abs(shiftX) < 0.5 && Math.abs(shiftY) < 0.5) return;
      stopAnimating();
      x.set(x.get() + shiftX);
      y.set(y.get() + shiftY);
    },
    [contentPositionOf, stopAnimating, x, y, scale],
  );

  const view = useCallback(
    () => ({ x: x.get(), y: y.get(), scale: scale.get() }),
    [x, y, scale],
  );
  const goTo = useCallback(
    (target: View) => moveTo(target.x, target.y, target.scale, true),
    [moveTo],
  );

  // Stable, so effects that use it run for their own reasons only.
  return useMemo(
    () => ({
      x,
      y,
      scale,
      centreOn,
      bringIntoView,
      zoomBy,
      fitToView,
      holdInPlace,
      contentPositionOf,
      view,
      goTo,
    }),
    [
      view,
      goTo,
      fitToView,
      x,
      y,
      scale,
      centreOn,
      bringIntoView,
      zoomBy,
      holdInPlace,
      contentPositionOf,
    ],
  );
}

/** Whether the zoom is at either end of its range, for the zoom buttons. */
export function useZoomLimits(scale: MotionValue<number>) {
  const limitOf = (value: number) =>
    value <= MIN_SCALE + 0.001
      ? 'min'
      : value >= MAX_SCALE - 0.001
        ? 'max'
        : null;
  const [limit, setLimit] = useState(() => limitOf(scale.get()));
  useMotionValueEvent(scale, 'change', (value) => setLimit(limitOf(value)));
  return { atMin: limit === 'min', atMax: limit === 'max' };
}
