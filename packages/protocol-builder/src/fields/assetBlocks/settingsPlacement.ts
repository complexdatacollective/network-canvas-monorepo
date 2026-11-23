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

/**
 * The part of the window the settings may stand in: what `scroller` shows of
 * the page, or the whole window, less `clearance` at each end.
 */
const roomIn = (scroller: Element | undefined, clearance: Covered) => {
  const box = scroller?.getBoundingClientRect();
  return {
    top: Math.max(box?.top ?? 0, 0) + clearance.top,
    bottom:
      Math.min(box?.bottom ?? window.innerHeight, window.innerHeight) -
      clearance.bottom,
  };
};

/**
 * Which side of the file its settings stand on, and whether they may cover
 * part of it to be seen whole.
 */
type SettingsPlacement = Readonly<{
  side: 'top' | 'bottom';
  overlaps: boolean;
}>;

/**
 * Under the file where the whole of its settings fits there, over it where
 * they fit there instead. Where they fit on neither side, on the side with
 * more room, moved over the file as far as they must be to be seen whole:
 * covering some of the file the researcher has just selected is better than
 * settings that have to be scrolled to be read. Never beside it, where they
 * would cover whatever the page has there.
 *
 * `room` is the part of the window they may stand in (`roomIn`), `tall` how
 * tall the whole of the settings is.
 */
export const settingsPlacement = (
  file: Readonly<{ top: number; bottom: number }>,
  tall: number,
  room: Readonly<{ top: number; bottom: number }>,
): SettingsPlacement => {
  const below = room.bottom - file.bottom - SETTINGS_OFFSET;
  const above = file.top - room.top - SETTINGS_OFFSET;
  if (below >= tall) return { side: 'bottom', overlaps: false };
  if (above >= tall) return { side: 'top', overlaps: false };
  return { side: below >= above ? 'bottom' : 'top', overlaps: true };
};

/** Where the settings stand, and what they keep clear of the page's ends. */
type SettingsLayout = SettingsPlacement & Readonly<{ clearance: Covered }>;

const sameLayout = (one: SettingsLayout, other: SettingsLayout) =>
  one.side === other.side &&
  one.overlaps === other.overlaps &&
  one.clearance.top === other.clearance.top &&
  one.clearance.bottom === other.clearance.bottom;

/**
 * How tall the popup `panel` is drawn in would be with the whole of what
 * `panel` holds in sight: the popup as it is, with the part of `panel` it
 * shows given back as all of it. Whatever the popup draws around `panel`, a
 * border among it, is counted as it is drawn.
 */
const popupHeightAround = (panel: HTMLElement): number => {
  const popup = panel.closest('[role="dialog"]');
  const around =
    popup instanceof HTMLElement ? popup.offsetHeight - panel.clientHeight : 0;
  return panel.scrollHeight + around;
};

/**
 * Where a block's settings stand (`settingsPlacement`), kept up while they
 * are open as the page scrolls, the window changes size and the settings
 * change height. `panel` is what scrolls inside them, whose full height is
 * theirs; `scroller` what the page scrolls in; `probeRef` where the host's
 * bars are read (`COVERED_PROBE_STYLE`).
 */
export function useSettingsPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panel: HTMLElement | null,
  scroller: Element | undefined,
  probeRef: RefObject<HTMLElement | null>,
): SettingsLayout {
  const [layout, setLayout] = useState<SettingsLayout>({
    side: 'bottom',
    overlaps: false,
    clearance: clearanceOf(UNCOVERED),
  });
  useLayoutEffect(() => {
    if (!open || panel === null) return undefined;
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const anchor = anchorRef.current;
      if (anchor === null) return;
      const clearance = clearanceOf(coveredAt(probeRef.current));
      const next = {
        ...settingsPlacement(
          anchor.getBoundingClientRect(),
          popupHeightAround(panel),
          roomIn(scroller, clearance),
        ),
        clearance,
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
  }, [open, anchorRef, panel, scroller, probeRef]);
  return layout;
}

// On the side chosen for them, moved along the line of the page to stay in
// the window; and, where they must cover the file, moved over it.
export const SETTINGS_COLLISIONS = {
  beside: { side: 'none', align: 'shift', fallbackAxisSide: 'none' },
  over: { side: 'shift', align: 'shift', fallbackAxisSide: 'none' },
} as const;
