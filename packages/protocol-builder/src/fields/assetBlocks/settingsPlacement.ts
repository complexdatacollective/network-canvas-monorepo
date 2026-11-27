import {
  type CSSProperties,
  type RefObject,
  useLayoutEffect,
  useState,
} from 'react';

/**
 * How much of the top and of the bottom of the page a block scrolls in its
 * host covers with bars of its own, which a researcher still needs while a
 * block's settings are open (a title, the bar that saves the stage). A host
 * with such bars declares them as these custom properties, as any CSS length,
 * on the element the page scrolls in or on any element around the editor
 * (`hostBarsStyle`); one that declares none covers nothing.
 */
const COVERED_TOP = '--protocol-builder-covered-top';
const COVERED_BOTTOM = '--protocol-builder-covered-bottom';

/**
 * The inline style a host puts on the element the stage editor's page
 * scrolls in, or on any element around the editor, to say how much of the
 * page its own bars cover at the top and at the bottom: any CSS length,
 * such as a `var()` the host keeps measured. A block's settings over the
 * page keep clear of both.
 */
export const hostBarsStyle = (
  covered: Readonly<{ top: string; bottom: string }>,
): CSSProperties &
  Record<typeof COVERED_TOP | typeof COVERED_BOTTOM, string> => ({
  [COVERED_TOP]: covered.top,
  [COVERED_BOTTOM]: covered.bottom,
});

/** How much of the page a host's own bars cover, at the top and bottom. */
type Covered = Readonly<{ top: number; bottom: number }>;

const UNCOVERED: Covered = { top: 0, bottom: 0 };

/**
 * The style of the element the host's bars are read from (`COVERED_TOP`,
 * `COVERED_BOTTOM`): an element under the block, which inherits them, that
 * resolves each as one of its margins, since a custom property is read back
 * as the text it was given. `useSettingsPlacement` reads it as `probeRef`.
 */
export const COVERED_PROBE_STYLE: CSSProperties = {
  marginTop: `var(${COVERED_TOP}, 0px)`,
  marginBottom: `var(${COVERED_BOTTOM}, 0px)`,
};

const pixelsIn = (length: string): number => {
  const pixels = Number.parseFloat(length);
  return Number.isFinite(pixels) ? Math.max(pixels, 0) : 0;
};

const coveredAt = (probe: HTMLElement | null): Covered => {
  if (probe === null) return UNCOVERED;
  const style = getComputedStyle(probe);
  return {
    top: pixelsIn(style.marginTop),
    bottom: pixelsIn(style.marginBottom),
  };
};

// The settings stay open for as long as the block is selected, so they keep
// this far clear of the host's bars, which a popup at their edge would seem
// to belong to.
export const SETTINGS_MARGIN = 8;

/** How far the settings stand from the file: the popover's own distance. */
export const SETTINGS_OFFSET = 10;

/**
 * What the page a block is in scrolls inside: the nearest box around it that
 * scrolls, or nothing where the window itself does. Below whatever an app
 * shows above its pages, such as a banner, so the settings keep inside it.
 */
export const scrollerOf = (element: Element): Element | undefined => {
  for (
    let at = element.parentElement;
    at !== null && at !== element.ownerDocument.body;
    at = at.parentElement
  ) {
    if (/auto|scroll/.test(getComputedStyle(at).overflowY)) return at;
  }
  return undefined;
};

/**
 * How far in from the top and bottom of the page the settings keep: past the
 * host's bars, and clear of them. What the popover keeps clear of the edges
 * of `scrollerOf` too.
 */
const clearanceOf = (covered: Covered): Covered => ({
  top: covered.top + SETTINGS_MARGIN,
  bottom: covered.bottom + SETTINGS_MARGIN,
});

/** A part of the window, as `getBoundingClientRect` measures it. */
type Box = Readonly<{
  top: number;
  bottom: number;
  left: number;
  right: number;
}>;

/** What of the window `scroller` shows of the page, or the whole window. */
const shownBy = (scroller: Element | undefined): Box => {
  const box = scroller?.getBoundingClientRect();
  return {
    top: Math.max(box?.top ?? 0, 0),
    bottom: Math.min(box?.bottom ?? window.innerHeight, window.innerHeight),
    left: Math.max(box?.left ?? 0, 0),
    right: Math.min(box?.right ?? window.innerWidth, window.innerWidth),
  };
};

/**
 * Where across the window settings `wide` stand: centred on the file, and
 * moved as far as they must be to stay inside `room`, as the popover moves
 * them.
 */
const acrossFrom = (file: Box, wide: number, room: Box) => {
  const left = Math.max(
    Math.min((file.left + file.right - wide) / 2, room.right - wide),
    room.left,
  );
  return { left, right: left + wide };
};

/**
 * Whether settings standing at `settings` would come nearer the corner that
 * resizes the picture than they stand to the file, which leaves a pointer
 * room to take hold of it.
 */
const comesNear = (settings: Box, corner: Box): boolean =>
  settings.top < corner.bottom + SETTINGS_OFFSET &&
  settings.bottom > corner.top - SETTINGS_OFFSET &&
  settings.left < corner.right + SETTINGS_OFFSET &&
  settings.right > corner.left - SETTINGS_OFFSET;

/**
 * Which side of the file its settings stand on, whether they may cover part
 * of it to be seen whole, how far from it they stand, and the part of the
 * window they keep inside.
 */
type SettingsPlacement = Readonly<{
  side: 'top' | 'bottom';
  overlaps: boolean;
  offset: number;
  room: Box;
}>;

/**
 * Under the file where the whole of its settings fits there, over it where
 * they fit there instead. Where they fit on neither side, on the side with
 * more room, moved over the file as far as they must be to be seen whole:
 * covering some of the file the researcher has just selected is better than
 * settings that have to be scrolled to be read. Never beside it, where they
 * would cover whatever the page has there.
 *
 * Wherever they stand, they leave uncovered the corner that resizes the
 * picture (`corner`, where it has one), as far from it as they stand from
 * the file. Under the file, they stand under the corner too. Moved over the
 * file, they stand beside the corner, on the side the file is on; where they
 * are too wide for that, they stand above the corner or under it, whichever
 * leaves more of them in sight, and scroll within themselves.
 *
 * `room` is the part of the window they may stand in, and `settings` how
 * wide and how tall the whole of them is.
 */
export const settingsPlacement = (
  file: Box,
  settings: Readonly<{ wide: number; tall: number }>,
  room: Box,
  corner?: Box,
): SettingsPlacement => {
  const { wide, tall } = settings;
  const below = room.bottom - file.bottom - SETTINGS_OFFSET;
  const above = file.top - room.top - SETTINGS_OFFSET;
  const across = acrossFrom(file, wide, room);
  const clearOfCorner = (top: number, bottom: number) =>
    corner === undefined || !comesNear({ ...across, top, bottom }, corner);
  const standing = (
    side: SettingsPlacement['side'],
    overlaps: boolean,
  ): SettingsPlacement => ({ side, overlaps, offset: SETTINGS_OFFSET, room });

  const under = file.bottom + SETTINGS_OFFSET;
  if (below >= tall && clearOfCorner(under, under + tall)) {
    return standing('bottom', false);
  }
  // Under the corner, which hangs below the file.
  const underCorner =
    corner === undefined
      ? 0
      : Math.max(
          corner.bottom + SETTINGS_OFFSET - file.bottom,
          SETTINGS_OFFSET,
        );
  if (
    underCorner > SETTINGS_OFFSET &&
    room.bottom - file.bottom - underCorner >= tall
  ) {
    return { ...standing('bottom', false), offset: underCorner };
  }
  const over = file.top - SETTINGS_OFFSET;
  if (above >= tall && clearOfCorner(over - tall, over)) {
    return standing('top', false);
  }

  const side = below >= above ? 'bottom' : 'top';
  const shown = Math.min(tall, room.bottom - room.top);
  const top = side === 'bottom' ? room.bottom - shown : room.top;
  if (corner === undefined || clearOfCorner(top, top + shown)) {
    return standing(side, true);
  }
  const beside =
    corner.left + corner.right > file.left + file.right
      ? { ...room, right: Math.min(room.right, corner.left - SETTINGS_OFFSET) }
      : { ...room, left: Math.max(room.left, corner.right + SETTINGS_OFFSET) };
  if (beside.right - beside.left >= wide) {
    return { ...standing(side, true), room: beside };
  }
  const roomOverCorner = corner.top - SETTINGS_OFFSET - room.top;
  const roomUnderCorner = room.bottom - corner.bottom - SETTINGS_OFFSET;
  if (roomOverCorner >= roomUnderCorner) {
    return {
      ...standing('top', true),
      room: {
        ...room,
        bottom: Math.min(room.bottom, corner.top - SETTINGS_OFFSET),
      },
    };
  }
  return { ...standing('bottom', false), offset: underCorner };
};

/**
 * How far in from each edge of what the page is shown in (`shownBy`) the
 * popover keeps, to stay inside `room`: its `collisionPadding`.
 */
type Clearance = Box;

/** Where the settings stand, and what they keep clear of the page's edges. */
type SettingsLayout = Omit<SettingsPlacement, 'room'> &
  Readonly<{ clearance: Clearance }>;

const sameLayout = (one: SettingsLayout, other: SettingsLayout) =>
  one.side === other.side &&
  one.overlaps === other.overlaps &&
  one.offset === other.offset &&
  one.clearance.top === other.clearance.top &&
  one.clearance.bottom === other.clearance.bottom &&
  one.clearance.left === other.clearance.left &&
  one.clearance.right === other.clearance.right;

/**
 * How wide and how tall the popup `panel` is drawn in would be with the whole
 * of what `panel` holds in sight: the popup as it is, with the part of
 * `panel` it shows given back as all of it. Whatever the popup draws around
 * `panel`, a border among it, is counted as it is drawn.
 */
const popupSizeAround = (
  panel: HTMLElement,
): Readonly<{ wide: number; tall: number }> => {
  const popup = panel.closest('[role="dialog"]');
  if (!(popup instanceof HTMLElement)) {
    return { wide: panel.offsetWidth, tall: panel.scrollHeight };
  }
  return {
    wide: popup.offsetWidth,
    tall: panel.scrollHeight + popup.offsetHeight - panel.clientHeight,
  };
};

/**
 * Where a block's settings stand (`settingsPlacement`), kept up while they
 * are open as the page scrolls, the window changes size and the settings
 * change height. `panel` is what scrolls inside them, whose full height is
 * theirs; `scroller` what the page scrolls in; `probeRef` where the host's
 * bars are read (`COVERED_PROBE_STYLE`); `cornerRef` the corner that resizes
 * the block's picture, where it has one, which they leave uncovered.
 */
export function useSettingsPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panel: HTMLElement | null,
  scroller: Element | undefined,
  probeRef: RefObject<HTMLElement | null>,
  cornerRef?: RefObject<HTMLElement | null>,
): SettingsLayout {
  const [layout, setLayout] = useState<SettingsLayout>({
    side: 'bottom',
    overlaps: false,
    offset: SETTINGS_OFFSET,
    clearance: { ...clearanceOf(UNCOVERED), left: 0, right: 0 },
  });
  useLayoutEffect(() => {
    if (!open || panel === null) return undefined;
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const anchor = anchorRef.current;
      if (anchor === null) return;
      const shown = shownBy(scroller);
      const covered = clearanceOf(coveredAt(probeRef.current));
      const { room, ...placement } = settingsPlacement(
        anchor.getBoundingClientRect(),
        popupSizeAround(panel),
        {
          ...shown,
          top: shown.top + covered.top,
          bottom: shown.bottom - covered.bottom,
        },
        cornerRef?.current?.getBoundingClientRect(),
      );
      const next = {
        ...placement,
        clearance: {
          top: room.top - shown.top,
          bottom: shown.bottom - room.bottom,
          left: room.left - shown.left,
          right: shown.right - room.right,
        },
      };
      setLayout((current) => (sameLayout(current, next) ? current : next));
    };
    const schedule = () => {
      frame ??= requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', schedule);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(schedule);
    for (const child of panel.children) observer?.observe(child);
    if (anchorRef.current !== null) observer?.observe(anchorRef.current);
    if (scroller !== undefined) observer?.observe(scroller);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [open, anchorRef, panel, scroller, probeRef, cornerRef]);
  return layout;
}

// On the side chosen for them, moved along the line of the page to stay in
// the window; and, where they must cover the file, moved over it.
export const SETTINGS_COLLISIONS = {
  beside: { side: 'none', align: 'shift', fallbackAxisSide: 'none' },
  over: { side: 'shift', align: 'shift', fallbackAxisSide: 'none' },
} as const;
