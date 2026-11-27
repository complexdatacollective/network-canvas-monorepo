import {
  type CSSProperties,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { POPOVER_ARROW_PADDING } from '@codaco/fresco-ui/popoverArrow';

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
export type Box = Readonly<{
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
 * How far the settings stop short of a part of a block they must not cover
 * (a player's controls, the corner that resizes a picture) when they cover
 * the rest of it.
 */
export const KEEP_OUT_CLEARANCE = 12;

/**
 * How tall the bar of controls that a browser draws along the bottom of a
 * video is, which the settings never cover.
 */
export const PLAYER_CONTROLS_HEIGHT = 56;

/** The sides of the settings button, in the order they are tried. */
export type SettingsSide = 'bottom' | 'top' | 'end' | 'start';

const SIDES: readonly SettingsSide[] = ['bottom', 'top', 'end', 'start'];

/**
 * Which side of the settings button the settings stand on, and the part of
 * the window they keep inside. `scrolls` where they fit on no side and are cut
 * short, to be scrolled within.
 */
export type SettingsPlacement = Readonly<{
  side: SettingsSide;
  room: Box;
  scrolls: boolean;
}>;

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));

/** Whether `one` comes within `SETTINGS_OFFSET` of `other`. */
const comesNear = (one: Box, other: Box): boolean =>
  one.top < other.bottom + SETTINGS_OFFSET &&
  one.bottom > other.top - SETTINGS_OFFSET &&
  one.left < other.right + SETTINGS_OFFSET &&
  one.right > other.left - SETTINGS_OFFSET;

/** How wide the arrow the settings point at their button with is drawn. */
const ARROW_WIDE = 20;

/**
 * How far from a corner of the settings their arrow is, at the least: the
 * popover keeps the middle of the arrow this far in from the corner, and
 * moves the settings along to keep it so, past the end of a small button.
 */
const ARROW_INSET = POPOVER_ARROW_PADDING + ARROW_WIDE / 2;

/**
 * Where the edge of the settings lined up with an edge of `button` (its end,
 * under or over it; its top, beside it) comes: on that edge, or past it as
 * far as the arrow pointing at the button's middle needs (`ARROW_INSET`).
 */
const linedUpWith = (edge: number, middle: number, towards: 1 | -1): number =>
  towards === 1
    ? Math.max(edge, middle + ARROW_INSET)
    : Math.min(edge, middle - ARROW_INSET);

/**
 * Where settings `wide` and `tall` would stand on `side` of `button`, as
 * the popover puts them: under or over it lined up with its end and moved
 * along the line to stay inside `room`; beside it lined up with its top and
 * moved up or down to stay inside `room`. Null where they do not fit there.
 */
const standingOn = (
  side: SettingsSide,
  button: Box,
  { wide, tall }: Readonly<{ wide: number; tall: number }>,
  room: Box,
  direction: 'ltr' | 'rtl',
): Box | null => {
  const across = (button.left + button.right) / 2;
  if (side === 'bottom' || side === 'top') {
    if (wide > room.right - room.left) return null;
    const end =
      direction === 'rtl'
        ? linedUpWith(button.left, across, -1) + wide
        : linedUpWith(button.right, across, 1);
    const left = clamp(end - wide, room.left, room.right - wide);
    const top =
      side === 'bottom'
        ? button.bottom + SETTINGS_OFFSET
        : button.top - SETTINGS_OFFSET - tall;
    if (top < room.top || top + tall > room.bottom) return null;
    return { top, bottom: top + tall, left, right: left + wide };
  }
  if (tall > room.bottom - room.top) return null;
  const onTheRight = (side === 'end') === (direction === 'ltr');
  const left = onTheRight
    ? button.right + SETTINGS_OFFSET
    : button.left - SETTINGS_OFFSET - wide;
  if (left < room.left || left + wide > room.right) return null;
  const down = (button.top + button.bottom) / 2;
  const top = clamp(
    linedUpWith(button.top, down, -1),
    room.top,
    room.bottom - tall,
  );
  return { top, bottom: top + tall, left, right: left + wide };
};

/**
 * Where a block's settings stand beside its settings button: on the first
 * side of the button where the whole of them fits in `room` (below it, above
 * it, at the end of the line, at its start), skipping a side where they would
 * cover any of `keepOut` (a player's controls, the corner that resizes a
 * picture). Where no side has room, they are cut short and scroll within,
 * on whichever of the sides below and above the button has more room for
 * them: below it, over the top of the block, they stop `KEEP_OUT_CLEARANCE`
 * short of whatever of `keepOut` is below them.
 *
 * `room` is the part of the window they may stand in, `settings` how wide
 * and how tall the whole of them is, and `direction` that of the block's
 * text, whose end the button stands at.
 */
export const settingsPlacement = (
  button: Box,
  settings: Readonly<{ wide: number; tall: number }>,
  room: Box,
  keepOut: readonly Box[] = [],
  direction: 'ltr' | 'rtl' = 'ltr',
): SettingsPlacement => {
  for (const side of SIDES) {
    const box = standingOn(side, button, settings, room, direction);
    if (box !== null && !keepOut.some((part) => comesNear(box, part))) {
      return { side, room, scrolls: false };
    }
  }
  const top = button.bottom + SETTINGS_OFFSET;
  const wide = Math.min(settings.wide, room.right - room.left);
  const across = (button.left + button.right) / 2;
  const end =
    direction === 'rtl'
      ? linedUpWith(button.left, across, -1) + wide
      : linedUpWith(button.right, across, 1);
  const left = clamp(end - wide, room.left, room.right - wide);
  // Whatever of `keepOut` they would come near across, below their top.
  const below = keepOut
    .filter(
      (part) =>
        part.bottom > top &&
        part.left < left + wide + SETTINGS_OFFSET &&
        part.right > left - SETTINGS_OFFSET,
    )
    .map((part) => part.top - KEEP_OUT_CLEARANCE);
  const bottom = Math.min(room.bottom, ...below);
  // Above the button, nothing of the block is in their way: what they keep
  // clear of is below its top.
  const roomAbove = button.top - SETTINGS_OFFSET - room.top;
  if (roomAbove > bottom - top) return { side: 'top', room, scrolls: true };
  return { side: 'bottom', room: { ...room, bottom }, scrolls: true };
};

/**
 * How far in from each edge of what the page is shown in (`shownBy`) the
 * popover keeps, to stay inside `room`: its `collisionPadding`.
 */
type Clearance = Box;

/**
 * Where the settings stand, as the popover is told: the side of the button
 * (a physical side: the end of the line is the right in left-to-right text),
 * which edge of them lines up with the button, what they keep clear of the
 * page's edges, and whether they are cut short to be scrolled within.
 */
type SettingsLayout = Readonly<{
  side: 'top' | 'bottom' | 'left' | 'right';
  align: 'start' | 'end';
  clearance: Clearance;
  scrolls: boolean;
}>;

const sameLayout = (one: SettingsLayout, other: SettingsLayout) =>
  one.side === other.side &&
  one.align === other.align &&
  one.scrolls === other.scrolls &&
  one.clearance.top === other.clearance.top &&
  one.clearance.bottom === other.clearance.bottom &&
  one.clearance.left === other.clearance.left &&
  one.clearance.right === other.clearance.right;

/** The popover's side for `side` of a button at the end of a line in `direction`. */
const physicalSide = (
  side: SettingsSide,
  direction: 'ltr' | 'rtl',
): SettingsLayout['side'] => {
  if (side === 'top' || side === 'bottom') return side;
  return (side === 'end') === (direction === 'ltr') ? 'right' : 'left';
};

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

/** What `useSettingsPlacement` places the settings of a block from. */
type SettingsPlacementSource = Readonly<{
  /** Whether the settings are open. */
  open: boolean;
  /** The settings button, which the settings are attached to. */
  buttonRef: RefObject<HTMLElement | null>;
  /** What scrolls inside the settings, whose full height is theirs. */
  panel: HTMLElement | null;
  /** What the page scrolls in (`scrollerOf`). */
  scroller: Element | undefined;
  /** Where the host's bars are read (`COVERED_PROBE_STYLE`). */
  probeRef: RefObject<HTMLElement | null>;
  /** The parts of the block that the settings never cover, read as they open. */
  keepOut?: () => readonly Box[];
  /** The direction of the block's text. */
  direction: 'ltr' | 'rtl';
}>;

/**
 * Where a block's settings stand beside its settings button
 * (`settingsPlacement`), kept up while they are open as the page scrolls,
 * the window changes size and the settings change height.
 */
export function useSettingsPlacement({
  open,
  buttonRef,
  panel,
  scroller,
  probeRef,
  keepOut,
  direction,
}: SettingsPlacementSource): SettingsLayout {
  const [layout, setLayout] = useState<SettingsLayout>({
    side: 'bottom',
    align: 'end',
    clearance: { ...clearanceOf(UNCOVERED), left: 0, right: 0 },
    scrolls: false,
  });
  const latestKeepOut = useRef(keepOut);
  useLayoutEffect(() => {
    latestKeepOut.current = keepOut;
  });
  useLayoutEffect(() => {
    if (!open || panel === null) return undefined;
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const button = buttonRef.current;
      if (button === null) return;
      const shown = shownBy(scroller);
      const covered = clearanceOf(coveredAt(probeRef.current));
      const { side, room, scrolls } = settingsPlacement(
        button.getBoundingClientRect(),
        popupSizeAround(panel),
        {
          ...shown,
          top: shown.top + covered.top,
          bottom: shown.bottom - covered.bottom,
        },
        latestKeepOut.current?.() ?? [],
        direction,
      );
      const next: SettingsLayout = {
        side: physicalSide(side, direction),
        align: side === 'top' || side === 'bottom' ? 'end' : 'start',
        scrolls,
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
    if (buttonRef.current !== null) observer?.observe(buttonRef.current);
    if (scroller !== undefined) observer?.observe(scroller);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [open, buttonRef, panel, scroller, probeRef, direction]);
  return layout;
}

/**
 * On the side chosen for them, moved along it to stay in the window (see
 * `settingsPlacement`), and never moved to another side by the popover.
 */
export const SETTINGS_COLLISIONS = {
  side: 'none',
  align: 'shift',
  fallbackAxisSide: 'none',
} as const;
