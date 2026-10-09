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
import { type PanZoom, useZoomLimits } from '../FamilyPedigree/usePanZoom';
import { interfaceMessages } from '../messages';

/** How far one press of a zoom control (or of + or −) zooms, as a power of
 * two. */
const ZOOM_STEP = 0.5;

type PedigreeViewportProps = {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  panZoom: PanZoom;
  /** Keys the canvas does not handle itself (it handles + and −). */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
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
 * from the keyboard to zoom about the middle. It is clipped rather than
 * scrollable, so focusing someone off screen pans to them instead of
 * scrolling. Announced as a region named for the family.
 */
export function PedigreeViewport({
  viewportRef,
  contentRef,
  panZoom,
  onKeyDown,
  onBlur,
  onClick,
  overlay,
  children,
}: PedigreeViewportProps) {
  const intl = useAppIntl();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        panZoom.zoomBy(ZOOM_STEP);
        return;
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        panZoom.zoomBy(-ZOOM_STEP);
        return;
      }
    }
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
 * buttons are disabled at either end of the zoom's range.
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
      tooltip={false}
      icon={<Scan />}
      onClick={onShowWholeFamily}
      data-testid="pedigree-zoom-fit"
    />,
  ];
}

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
  const centreOf = (element: HTMLElement): Point => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
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
