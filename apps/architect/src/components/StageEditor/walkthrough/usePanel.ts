import {
  animate,
  type MotionValue,
  useDragControls,
  useMotionValue,
} from 'motion/react';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { STAGE_FORM_ID } from '../stageFormId';
import {
  besideColumn,
  besideTarget,
  type Box,
  type Fit,
  keepInside,
  type Placement,
  ringAround,
  scrollToCentre,
  scrollToTop,
} from './panelGeometry';
import {
  getWalkthroughPosition,
  setWalkthroughPosition,
} from './walkthroughStore';

/**
 * How long a step change takes. Everything it moves (the page's scroll, the
 * panel's place and height, the highlight ring and the step's text) moves
 * together over this time, on the same easing.
 */
export const STEP_SECONDS = 0.5;
const STEP = {
  type: 'tween',
  duration: STEP_SECONDS,
  ease: [0.65, 0, 0.35, 1],
} as const;

/** The width the panel prefers and the narrowest it may become, in rem. */
const PANEL_REM = 30;
const MIN_PANEL_REM = 18;
/** The shortest the panel becomes to fit above or below a section, in rem. */
const MIN_TALL_REM = 16;

const remPixels = () =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/** The editor's content: the stage form, which the panel keeps clear of. */
const contentColumn = () =>
  document.getElementById(STAGE_FORM_ID)?.getBoundingClientRect();

/**
 * What the panel keeps clear beside `section`: the section's height, across
 * the whole content column, so the panel covers only the margin beside it.
 */
function besideBox(section: HTMLElement, box: Box): Box {
  const column = isFixed(section) ? undefined : contentColumn();
  if (column === undefined) return box;
  return {
    top: box.top,
    height: box.height,
    left: column.left,
    width: column.width,
  };
}

/** Whether `element` sits in a fixed box, which the page scrolls past. */
function isFixed(element: HTMLElement): boolean {
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    if (getComputedStyle(node).position === 'fixed') return true;
  }
  return false;
}

/** The element that scrolls `element` into view: its nearest scrolling box. */
function scrollerOf(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      /auto|scroll|overlay/.test(overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

/**
 * The floating panel's place, size and highlight ring, and how a step change
 * moves them.
 *
 * The panel keeps its bottom edge, where Back and Next are, still: a step of
 * a different height changes it at the top, and another step about the same
 * section leaves it where it is. It stays inside `bounds`, which keep clear of
 * the navigation bar and the toolbar, opens in the corner above the toolbar,
 * and can be dragged anywhere by its header.
 *
 * A step about another section scrolls that section into the middle of the
 * room and moves the panel clear of the editor's content beside it: narrower
 * where the margin is narrow, or above or below it, shorter, where no margin
 * is wide enough. Everything a step change moves is
 * worked out first and then animated together with `STEP`: the page's
 * scroll, the panel's place and height, and the ring, which therefore stays on
 * its section while the page scrolls under it.
 */
export function usePanel(target: HTMLElement | null, reducedMotion: boolean) {
  const card = useRef<HTMLDivElement>(null);
  const bounds = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLElement>(null);
  const dragControls = useDragControls();

  const start = getWalkthroughPosition();
  const x = useMotionValue(start?.x ?? 0);
  const y = useMotionValue(start?.y ?? 0);
  const height = useMotionValue(0);
  const width = useMotionValue(0);
  /** The height the panel was shortened to, to fit above or below a section. */
  const tallCap = useRef(Number.POSITIVE_INFINITY);
  // State for the style that switches to the animated height; a ref for the
  // callbacks, so they stay the same functions once it flips.
  const [sized, setSized] = useState(false);
  const sizedRef = useRef(false);
  const ringTop = useMotionValue(0);
  const ringLeft = useMotionValue(0);
  const ringWidth = useMotionValue(0);
  const ringHeight = useMotionValue(0);
  const ringOpacity = useMotionValue(0);

  // Read by callbacks that outlive a render. Set in the commit that shows the
  // step, so a move that ends at once (reduced motion) finds that step's
  // target, not the last one's.
  const reduced = useRef(reducedMotion);
  const targetNow = useRef(target);
  useLayoutEffect(() => {
    reduced.current = reducedMotion;
    targetNow.current = target;
  }, [reducedMotion, target]);

  /** Restored from the toolbar: the first step shown keeps the panel's place. */
  const restoring = useRef(start !== undefined);
  /** Dragged by the researcher: it stays put until a step about another section. */
  const byHand = useRef(start?.byHand ?? false);
  /** The section the panel was last put beside. */
  const besideOf = useRef<HTMLElement | null>(null);
  /** Where the latest move is taking the panel, while it is on the way. */
  const destination = useRef<Placement | null>(null);
  /** Counts moves, so only the latest one ends the moving state. */
  const moves = useRef(0);
  const moving = useRef(false);
  const scrolling = useRef<ReturnType<typeof animate> | null>(null);
  /** A step that asked to be shown before the panel could measure itself. */
  const unshown = useRef<{ section: HTMLElement | null } | null>(null);

  /**
   * The panel as it is, or, while it moves, as it will be; its room; and the
   * height the step on screen needs (the panel with nothing to scroll, up to
   * the room's height).
   */
  const measure = useCallback(() => {
    const [c, b, s, h, v, t, f] = [
      card,
      bounds,
      surface,
      header,
      viewport,
      content,
      footer,
    ].map((part) => part.current);
    if (!c || !b || !s || !h || !v || !t || !f) return undefined;
    const rect = c.getBoundingClientRect();
    const room = b.getBoundingClientRect();
    const padding = getComputedStyle(v);
    const natural =
      s.offsetHeight -
      s.clientHeight +
      h.offsetHeight +
      f.offsetHeight +
      t.offsetHeight +
      Number.parseFloat(padding.paddingTop) +
      Number.parseFloat(padding.paddingBottom);
    const at: Placement =
      moving.current && destination.current !== null
        ? destination.current
        : {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            tall: rect.height,
          };
    const rem = remPixels();
    const fit: Fit = {
      preferred: Math.min(PANEL_REM * rem, Math.floor(room.width)),
      min: MIN_PANEL_REM * rem,
    };
    const full = Math.min(Math.ceil(natural), Math.floor(room.height));
    return {
      rect,
      room,
      at,
      fit,
      minTall: MIN_TALL_REM * rem,
      full,
      tall: Math.min(full, tallCap.current),
    };
  }, []);

  const setRing = useCallback(
    (box: Box) => {
      const ring = ringAround(box);
      ringTop.set(ring.top);
      ringLeft.set(ring.left);
      ringWidth.set(ring.width);
      ringHeight.set(ring.height);
    },
    [ringHeight, ringLeft, ringTop, ringWidth],
  );

  /** Puts the ring back on the step's section, unless something is moving it. */
  const followRing = useCallback(() => {
    const section = targetNow.current;
    if (moving.current || section === null) return;
    setRing(section.getBoundingClientRect());
  }, [setRing]);

  /**
   * Moves the panel to `plan` (kept inside `bounds`), and the page and ring as
   * given, all together; straight there unless `animated`.
   */
  const moveTogether = useCallback(
    (
      plan: Placement,
      {
        animated,
        scroll,
        ring,
      }: Readonly<{
        animated: boolean;
        scroll?: Readonly<{ scroller: HTMLElement; to: number }>;
        ring?: Readonly<{ from: Box | null; to: Box | null }>;
      }>,
    ) => {
      const now = measure();
      if (now === undefined) return;
      const to = keepInside(plan, now.room);
      // The motion values hold the panel's live offset, so the move is
      // measured from where it is drawn now, not from its destination.
      const toX = x.get() + to.left - now.rect.left;
      const toY = y.get() + to.top - now.rect.top;
      destination.current = to;
      setWalkthroughPosition({ x: toX, y: toY, byHand: byHand.current });

      const finished: Promise<unknown>[] = [];
      const go = (value: MotionValue<number>, end: number) => {
        if (animated) finished.push(animate(value, end, STEP).finished);
        else value.jump(end);
      };
      go(x, toX);
      go(y, toY);
      // The first sizing is not a change, so it is not animated.
      if (sizedRef.current) {
        go(height, to.tall);
        go(width, to.width);
      } else {
        height.jump(to.tall);
        width.jump(to.width);
      }

      scrolling.current?.stop();
      scrolling.current = null;
      if (scroll !== undefined) {
        const { scroller } = scroll;
        if (animated) {
          scrolling.current = animate(scroller.scrollTop, scroll.to, {
            ...STEP,
            onUpdate: (value) => {
              scroller.scrollTop = value;
            },
          });
          finished.push(scrolling.current.finished);
        } else {
          scroller.scrollTop = scroll.to;
        }
      }

      if (ring?.to === null) {
        go(ringOpacity, 0);
      } else if (ring !== undefined) {
        // A ring that was hidden starts on its section, so it rides along
        // with the scroll rather than flying in from the last one.
        if (ringOpacity.get() === 0 && ring.from !== null) setRing(ring.from);
        const end = ringAround(ring.to);
        go(ringTop, end.top);
        go(ringLeft, end.left);
        go(ringWidth, end.width);
        go(ringHeight, end.height);
        go(ringOpacity, 1);
      }

      // Moving until the latest move is done; then the ring catches up with
      // anything that shifted on the way.
      const id = ++moves.current;
      moving.current = true;
      void Promise.all(finished).finally(() => {
        if (moves.current !== id) return;
        moving.current = false;
        destination.current = null;
        followRing();
      });
    },
    [
      followRing,
      height,
      measure,
      ringHeight,
      ringLeft,
      ringOpacity,
      ringTop,
      ringWidth,
      setRing,
      width,
      x,
      y,
    ],
  );

  /** Takes the step on screen: its height, and `section`, if it is about one. */
  const showStep = useCallback(
    (section: HTMLElement | null) => {
      const now = measure();
      if (now === undefined) {
        // The step mounted before the panel around it: shown once that has.
        unshown.current = { section };
        return;
      }
      unshown.current = null;
      const { room, at, fit, minTall, full } = now;
      let { tall } = now;
      const animated = sizedRef.current && !reduced.current;

      // Keep the bottom where it is; on first opening, sit at the foot of the
      // margin beside the content, or in the end corner if it is too narrow.
      const opening = !sizedRef.current && !restoring.current;
      let left = at.left;
      let top = opening
        ? room.top + room.height - tall
        : at.top + at.tall - tall;
      let panelWidth = opening ? fit.preferred : at.width;
      if (opening) {
        const column = contentColumn();
        const beside =
          column === undefined ? undefined : besideColumn(column, room, fit);
        if (beside !== undefined) ({ left, width: panelWidth } = beside);
        else if (
          card.current &&
          getComputedStyle(card.current).direction === 'rtl'
        )
          left = room.left;
        else left = room.left + room.width - panelWidth;
      }
      let scroll: { scroller: HTMLElement; to: number } | undefined;
      let ring: { from: Box | null; to: Box | null } = { from: null, to: null };

      if (section !== null) {
        const box = section.getBoundingClientRect();
        // A control on a fixed bar, such as the toolbar, is always in view.
        const scroller =
          isFixed(section) || restoring.current ? null : scrollerOf(section);
        // Centred if the panel fits in the margin beside it; otherwise at the
        // top, leaving the room below it for the panel.
        const scrollTo =
          besideColumn(besideBox(section, box), room, fit) === undefined
            ? scrollToTop
            : scrollToCentre;
        const by =
          scroller === null
            ? 0
            : scrollTo(
                box,
                room,
                scroller.scrollTop,
                scroller.scrollHeight - scroller.clientHeight,
              ) - scroller.scrollTop;
        if (scroller !== null && by !== 0) {
          scroll = { scroller, to: scroller.scrollTop + by };
        }
        const there = {
          top: box.top - by,
          left: box.left,
          width: box.width,
          height: box.height,
        };
        ring = { from: box, to: there };
        // Another step about the same section, or a panel being restored,
        // stays where it is.
        if (besideOf.current !== section && !restoring.current) {
          ({
            left,
            top,
            width: panelWidth,
            tall,
          } = besideTarget(
            besideBox(section, there),
            room,
            fit,
            full,
            minTall,
          ));
          tallCap.current = tall < full ? tall : Number.POSITIVE_INFINITY;
          byHand.current = false;
        }
        besideOf.current = section;
      } else {
        besideOf.current = null;
      }

      restoring.current = false;
      moveTogether(
        { left, top, width: panelWidth, tall },
        { animated, scroll, ring },
      );
      if (!sizedRef.current) {
        sizedRef.current = true;
        setSized(true);
      }
    },
    [measure, moveTogether],
  );

  // A step's own layout effect runs before the panel around it has mounted;
  // the first step is shown from here instead.
  useLayoutEffect(() => {
    if (unshown.current !== null) showStep(unshown.current.section);
  }, [showStep]);

  useEffect(() => {
    /**
     * Keeps the panel beside its section as the window or the section changes
     * size, on another side if that one has more room now; straight there, so
     * it keeps up while the window is dragged to a new size. Not for a panel
     * the researcher dragged elsewhere.
     */
    const reanchor = () => {
      const section = targetNow.current;
      if (moving.current || byHand.current) return false;
      if (section === null || besideOf.current !== section) return false;
      const now = measure();
      if (now === undefined) return false;
      const spot = besideTarget(
        besideBox(section, section.getBoundingClientRect()),
        now.room,
        now.fit,
        now.full,
        now.minTall,
      );
      tallCap.current =
        spot.tall < now.full ? spot.tall : Number.POSITIVE_INFINITY;
      moveTogether(spot, { animated: false });
      return true;
    };
    /**
     * Fits the panel to a change in its step's height or in its room, keeping
     * the bottom still.
     */
    const refit = () => {
      if (moving.current) return;
      const now = measure();
      if (now === undefined) return;
      const { rect, room, tall } = now;
      const inside =
        rect.left >= room.left &&
        rect.right <= room.right &&
        rect.bottom - tall >= room.top &&
        rect.bottom <= room.bottom;
      const resized = tall !== Math.round(height.get());
      if (!resized && inside) return;
      moveTogether(
        { left: rect.left, top: rect.bottom - tall, width: rect.width, tall },
        // A change of room is the window being resized: keep up with it.
        { animated: resized && !reduced.current },
      );
    };
    // The window or the section changing size re-places the panel beside the
    // section; the step's own height changing keeps the bottom still.
    const onRoomChange = () => {
      if (!reanchor()) refit();
      followRing();
    };
    const onStepResize = () => {
      refit();
      followRing();
    };

    const step = new ResizeObserver(onStepResize);
    for (const part of [header, content, footer]) {
      if (part.current !== null) step.observe(part.current);
    }
    const room = new ResizeObserver(onRoomChange);
    if (bounds.current !== null) room.observe(bounds.current);
    if (target !== null) room.observe(target);
    window.addEventListener('scroll', followRing, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', onRoomChange);
    return () => {
      step.disconnect();
      room.disconnect();
      window.removeEventListener('scroll', followRing, { capture: true });
      window.removeEventListener('resize', onRoomChange);
    };
  }, [followRing, height, measure, moveTogether, target]);

  // Stops scrolling the page once the panel goes.
  useEffect(() => () => scrolling.current?.stop(), []);

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      const from = event.target instanceof Element ? event.target : null;
      if (from?.closest('button, a') != null) return;
      // Otherwise moving the pointer across the page selects its text.
      event.preventDefault();
      byHand.current = true;
      tallCap.current = Number.POSITIVE_INFINITY;
      dragControls.start(event);
    },
    [dragControls],
  );

  // A drag is free to leave `bounds` (Motion's constraints would rescale the
  // panel's place on every change of height), so the panel eases back inside
  // them when it is let go.
  const settle = useCallback(() => {
    const now = measure();
    if (now === undefined) return;
    moveTogether(
      {
        left: now.rect.left,
        top: now.rect.top,
        width: now.rect.width,
        tall: now.tall,
      },
      { animated: !reduced.current },
    );
  }, [measure, moveTogether]);

  return {
    card,
    bounds,
    surface,
    header,
    viewport,
    content,
    footer,
    dragControls,
    x,
    y,
    height,
    width,
    sized,
    ring: {
      top: ringTop,
      left: ringLeft,
      width: ringWidth,
      height: ringHeight,
      opacity: ringOpacity,
    },
    startDrag,
    settle,
    showStep,
  };
}
