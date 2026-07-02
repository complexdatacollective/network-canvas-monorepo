'use client';

import { Drawer } from '@base-ui/react/drawer';
import { type ReactNode, useRef, useState } from 'react';

import CloseButton from '@codaco/fresco-ui/CloseButton';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';

type ComposerDrawerProps = {
  open: boolean;
  /** Called whenever the drawer requests to close (Escape, close button). */
  onClose: () => void;
  title: string;
  children: ReactNode;
};

const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 384;
const RESIZE_STEP = 24;

const clampWidth = (width: number) =>
  Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

/**
 * Right-hand attribute editor for the Network Composer. A non-modal, backdrop-
 * less Base UI drawer that slides in from the right and leaves the canvas
 * interactive, so selecting a different node simply swaps its contents. The
 * panel width is resizable by dragging (or arrow-keying) the handle on its
 * left edge.
 */
export default function ComposerDrawer({
  open,
  onClose,
  title,
  children,
}: ComposerDrawerProps) {
  const portalContainer = usePortalContainer();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    // Stop the drawer's swipe-dismiss handler from also claiming this gesture.
    // Don't preventDefault — that would suppress the click focusing the handle,
    // which the arrow-key resize relies on. `select-none` handles drag-select.
    event.stopPropagation();
    resizeStart.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const start = resizeStart.current;
    if (!start) return;
    // The handle is on the left edge, so dragging left (smaller clientX) widens.
    setWidth(clampWidth(start.width + (start.x - event.clientX)));
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    resizeStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setWidth((current) => clampWidth(current + RESIZE_STEP));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setWidth((current) => clampWidth(current - RESIZE_STEP));
    }
  };

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      modal={false}
      disablePointerDismissal
      swipeDirection="right"
    >
      <Drawer.Portal container={portalContainer ?? undefined}>
        <Drawer.Viewport
          className="pointer-events-auto fixed inset-y-0 right-0"
          style={{ width: `${width}px` }}
        >
          <Drawer.Popup
            // Opened by clicking a node on the canvas; don't yank focus off the
            // canvas. The panel is non-modal and reachable by tabbing into it.
            initialFocus={false}
            className={[
              // `publish-colors` sets the background context so descendants
              // (e.g. the scroll area's fade gradient) resolve against surface-1.
              'bg-surface-1 publish-colors text-text elevation-high absolute inset-0 flex flex-col',
              'transition-transform duration-300 ease-out',
              '[transform:translateX(var(--drawer-swipe-movement-x,0px))]',
              'data-[starting-style]:[transform:translateX(100%)]',
              'data-[ending-style]:[transform:translateX(100%)]',
            ].join(' ')}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panel"
              aria-valuemin={MIN_WIDTH}
              aria-valuemax={MAX_WIDTH}
              aria-valuenow={Math.round(width)}
              tabIndex={0}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onKeyDown={handleResizeKeyDown}
              className="focusable hover:bg-primary/40 absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize touch-none select-none"
            />
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-current/10 p-4 pl-6">
              <Drawer.Title className="truncate text-lg font-semibold">
                {title}
              </Drawer.Title>
              <Drawer.Close render={<CloseButton aria-label="Close" />} />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
