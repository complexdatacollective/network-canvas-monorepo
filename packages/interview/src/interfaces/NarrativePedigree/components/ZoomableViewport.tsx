'use client';

import { LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';

import {
  canZoomIn,
  canZoomOut,
  centeredScrollLeft,
  clampScroll,
  DEFAULT_ZOOM,
  scaleAroundCenter,
  zoomIn,
  zoomOut,
} from '../zoom';

type PendingScroll =
  | {
      type: 'anchor';
      oldZoom: number;
      scrollLeft: number;
      scrollTop: number;
      clientWidth: number;
      clientHeight: number;
    }
  | { type: 'reset' };

type ZoomableViewportProps = {
  children: ReactNode;
  /** Accessible name for the zoom toolbar. */
  toolbarLabel: string;
  /** Fired when the scroll background (not the toolbar) is clicked. */
  onBackgroundClick?: () => void;
  /** Fired on Escape within the viewport. */
  onEscape?: () => void;
};

export default function ZoomableViewport({
  children,
  toolbarLabel,
  onBackgroundClick,
  onEscape,
}: ZoomableViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<PendingScroll | null>(null);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [scrollNonce, setScrollNonce] = useState(0);
  const [natural, setNatural] = useState({ width: 0, height: 0 });

  // Measure the un-transformed content. offsetWidth/Height ignore CSS
  // transforms, so this is the natural (100%) size at any zoom. Measured in a
  // layout effect (before paint) to avoid a mis-sized first frame; a
  // ResizeObserver keeps it current as the pedigree changes.
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;
    const measure = () =>
      setNatural((previous) =>
        previous.width === element.offsetWidth &&
        previous.height === element.offsetHeight
          ? previous
          : { width: element.offsetWidth, height: element.offsetHeight },
      );
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Apply the pending scroll adjustment once the new zoom has committed (so
  // scrollWidth/Height reflect the resized sizer). Keyed on the nonce so a reset
  // at an unchanged zoom still recentres.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const pending = pendingScroll.current;
    if (!element || !pending) return;
    pendingScroll.current = null;
    if (pending.type === 'reset') {
      element.scrollTop = 0;
      element.scrollLeft = centeredScrollLeft(
        element.scrollWidth,
        element.clientWidth,
      );
      return;
    }
    const ratio = zoom / pending.oldZoom;
    element.scrollLeft = clampScroll(
      scaleAroundCenter(pending.scrollLeft, pending.clientWidth, ratio),
      element.scrollWidth,
      element.clientWidth,
    );
    element.scrollTop = clampScroll(
      scaleAroundCenter(pending.scrollTop, pending.clientHeight, ratio),
      element.scrollHeight,
      element.clientHeight,
    );
  }, [scrollNonce, zoom]);

  const changeZoom = (next: number) => {
    const element = scrollRef.current;
    if (element) {
      pendingScroll.current = {
        type: 'anchor',
        oldZoom: zoom,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
      };
    }
    setZoom(next);
    setScrollNonce((nonce) => nonce + 1);
  };

  const handleReset = () => {
    pendingScroll.current = { type: 'reset' };
    setZoom(DEFAULT_ZOOM);
    setScrollNonce((nonce) => nonce + 1);
  };

  const items: ToolbarSegment[] = [
    {
      type: 'button',
      id: 'zoom-out',
      label: 'Zoom out',
      icon: <ZoomOut />,
      disabled: !canZoomOut(zoom),
      onClick: () => changeZoom(zoomOut(zoom)),
    },
    {
      type: 'button',
      id: 'zoom-in',
      label: 'Zoom in',
      icon: <ZoomIn />,
      disabled: !canZoomIn(zoom),
      onClick: () => changeZoom(zoomIn(zoom)),
    },
    { type: 'separator', id: 'zoom-separator' },
    {
      type: 'button',
      id: 'reset-zoom',
      label: 'Reset zoom',
      icon: <LocateFixed />,
      onClick: handleReset,
    },
  ];

  return (
    <>
      <div
        ref={scrollRef}
        data-narrative-pedigree-view
        role="presentation"
        className="relative flex min-h-0 w-full min-w-0 grow items-start justify-center-safe overflow-auto pt-6 pr-6 pb-24"
        onClick={onBackgroundClick}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onEscape?.();
        }}
      >
        <div
          className="relative flex-none"
          style={{ width: natural.width * zoom, height: natural.height * zoom }}
        >
          <div
            ref={contentRef}
            data-testid="np-zoom-content"
            data-zoom-level={zoom}
            className="absolute top-0 left-0 origin-top-left"
            style={{ transform: `scale(${zoom})` }}
          >
            {children}
          </div>
        </div>
      </div>
      <SegmentedToolbar
        label={toolbarLabel}
        size="lg"
        items={items}
        className="absolute right-4 bottom-4 z-10"
      />
    </>
  );
}
