'use client';

import { Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { motion } from 'motion/react';
import type {
  FocusEventHandler,
  KeyboardEvent,
  MouseEventHandler,
  ReactElement,
  ReactNode,
  RefObject,
} from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { ToolbarIconButton } from '@codaco/fresco-ui/SegmentedToolbar';

import { messages } from '../FamilyPedigree/messages';
import {
  ARROW_DIRECTIONS,
  nearestInDirection,
  type Point,
} from '../FamilyPedigree/spatialNavigation';
import {
  type PanZoom,
  type ZoomFocus,
  useZoomLimits,
} from '../FamilyPedigree/usePanZoom';
import { interfaceMessages } from '../messages';

/** How far one press of a zoom control (or of + or −) zooms, as a power of
 * two. */
const ZOOM_STEP = 0.5;

/**
 * Zooms the canvas for + or −, wherever the key is pressed: about `focus`,
 * kept in view, or else about the middle. Other keys, keys already handled
 * and keys typed into a text field are left alone. Whether it zoomed.
 */
export function zoomForKey(
  event: KeyboardEvent<HTMLElement>,
  panZoom: PanZoom,
  focus?: ZoomFocus,
) {
  const { target } = event;
  const typing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable);
  if (
    typing ||
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  ) {
    return false;
  }
  const exponent =
    event.key === '+' || event.key === '='
      ? ZOOM_STEP
      : event.key === '-' || event.key === '_'
        ? -ZOOM_STEP
        : 0;
  if (exponent === 0) return false;
  event.preventDefault();
  panZoom.zoomBy(exponent, focus);
  return true;
}

type PedigreeViewportProps = {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  panZoom: PanZoom;
  /** Keys the canvas does not handle itself (it handles + and −). */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** What + and − keep in view when focus is on `target`, inside the
   * family. Without it, the focused element itself. */
  zoomFocus?: (target: HTMLElement) => ZoomFocus | undefined;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
  /** Drawn over the canvas, outside the panned and zoomed content. */
  overlay?: ReactNode;
  /** The family tree (a `PedigreeLayout`). */
  children: ReactNode;
};

/**
 * The family tree's canvas, shared by the Family Pedigree and the Narrative
 * Pedigree: drag to pan, wheel or pinch to zoom (`usePanZoom`), and + or −
 * from the keyboard to zoom about the middle, or about the person focused,
 * who stays in view. It is clipped rather than scrollable, so focusing
 * someone off screen pans to them instead of scrolling. Announced as a
 * region named for the family.
 */
export function PedigreeViewport({
  viewportRef,
  contentRef,
  panZoom,
  onKeyDown,
  zoomFocus,
  onBlur,
  onClick,
  overlay,
  children,
}: PedigreeViewportProps) {
  const intl = useAppIntl();

  // Focus inside the family is kept in view as it zooms.
  const focusOf = (target: EventTarget): ZoomFocus | undefined => {
    if (
      !(target instanceof HTMLElement) ||
      !contentRef.current?.contains(target)
    ) {
      return undefined;
    }
    return zoomFocus ? zoomFocus(target) : { elements: [target] };
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (zoomForKey(event, panZoom, focusOf(event.target))) return;
    onKeyDown?.(event);
  };

  return (
    <div
      ref={viewportRef}
      role="region"
      aria-label={intl.formatMessage(messages.canvasLabel)}
      className="relative min-h-0 w-full flex-1 cursor-grab touch-none overflow-clip select-none"
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
      onClick={onClick}
      data-testid="pedigree-canvas"
    >
      {overlay}
      <motion.div
        ref={contentRef}
        className="absolute top-0 left-0 w-max p-40"
        style={{
          x: panZoom.x,
          y: panZoom.y,
          scale: panZoom.scale,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Zoom out, zoom in, and show the whole family: the canvas's controls, as
 * keyed buttons to place directly in a `SegmentedToolbar` (which accepts only
 * its own components as children, so they cannot share a wrapper). The zoom
 * buttons are disabled at either end of the zoom's range. The toolbar's
 * area handles + and − too (`zoomForKey`), so the keys zoom with focus on
 * any of its controls, as they do in the canvas.
 */
export function usePedigreeZoomButtons({
  panZoom,
  onShowWholeFamily,
}: {
  panZoom: PanZoom;
  onShowWholeFamily: () => void;
}): ReactElement[] {
  const intl = useAppIntl();
  const zoomLimits = useZoomLimits(panZoom.scale);
  return [
    <ToolbarIconButton
      key="zoom-out"
      aria-label={intl.formatMessage(interfaceMessages.zoomOut)}
      icon={<ZoomOut />}
      disabled={zoomLimits.atMin}
      onClick={() => panZoom.zoomBy(-ZOOM_STEP)}
      data-testid="pedigree-zoom-out"
    />,
    <ToolbarIconButton
      key="zoom-in"
      aria-label={intl.formatMessage(interfaceMessages.zoomIn)}
      icon={<ZoomIn />}
      disabled={zoomLimits.atMax}
      onClick={() => panZoom.zoomBy(ZOOM_STEP)}
      data-testid="pedigree-zoom-in"
    />,
    <ToolbarIconButton
      key="zoom-fit"
      aria-label={intl.formatMessage(messages.showWholeFamily)}
      icon={<Scan />}
      onClick={onShowWholeFamily}
      data-testid="pedigree-zoom-fit"
    />,
  ];
}

/**
 * Where an element's centre sits in the page's layout: from layout offsets,
 * which the canvas's zoom and any animation under way do not change, so
 * positions compare alike at every zoom.
 */
const layoutCentreOf = (element: HTMLElement): Point => {
  let x = element.offsetWidth / 2;
  let y = element.offsetHeight / 2;
  let current: Element | null = element;
  while (current instanceof HTMLElement) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent;
  }
  return { x, y };
};

/**
 * Moves keyboard focus from one person to the nearest in the arrow key's
 * direction, by where they sit in the tree. People whose button is disabled
 * are passed over. Other keys are left alone.
 */
export function focusNeighbourInDirection(
  people: ReadonlyMap<string, HTMLButtonElement>,
  fromId: string,
  event: KeyboardEvent<HTMLElement>,
) {
  const direction = ARROW_DIRECTIONS[event.key];
  if (!direction) return;
  event.preventDefault();
  const centreOf = layoutCentreOf;
  const current = people.get(fromId);
  if (!current) return;
  const candidates = new Map<string, Point>();
  for (const [id, element] of people) {
    if (id !== fromId && !element.disabled) {
      candidates.set(id, centreOf(element));
    }
  }
  const next = nearestInDirection(centreOf(current), candidates, direction);
  if (next) people.get(next)?.focus();
}
