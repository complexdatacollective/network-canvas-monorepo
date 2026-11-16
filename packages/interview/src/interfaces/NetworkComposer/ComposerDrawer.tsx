'use client';

import { useDirection } from '@base-ui/react/direction-provider';
import { Drawer } from '@base-ui/react/drawer';
import { type ReactNode, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';

import { interfaceMessages } from '../messages';

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
 * Attribute editor for the Network Composer, on the end edge of the screen:
 * the right, or the left in a right-to-left interview. A non-modal, backdrop-
 * less Base UI drawer that slides in from that edge and leaves the canvas
 * interactive, so selecting a different node simply swaps its contents. The
 * panel width is resizable by dragging (or arrow-keying) the handle on its
 * inner edge.
 */
export default function ComposerDrawer({
  open,
  onClose,
  title,
  children,
}: ComposerDrawerProps) {
  const intl = useAppIntl();
  const portalContainer = usePortalContainer();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  // Which way is "into the canvas": left, or right in a right-to-left
  // interview, where the panel is on the left.
  const isRtl = useDirection() === 'rtl';
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
    // The handle is on the panel's inner edge, so dragging it into the canvas
    // widens the panel.
    const intoCanvas = isRtl
      ? event.clientX - start.x
      : start.x - event.clientX;
    setWidth(clampWidth(start.width + intoCanvas));
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    resizeStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // The arrow pointing into the canvas widens, as a drag that way does.
    const widenKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
    const narrowKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
    if (event.key === widenKey) {
      event.preventDefault();
      setWidth((current) => clampWidth(current + RESIZE_STEP));
    } else if (event.key === narrowKey) {
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
      swipeDirection={isRtl ? 'left' : 'right'}
    >
      <Drawer.Portal container={portalContainer ?? undefined}>
        <Drawer.Viewport
          className="pointer-events-auto fixed inset-y-0 inset-e-0"
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
              // A transform has no logical form: the panel leaves towards
              // the right edge, or the left in a right-to-left interview.
              'data-[starting-style]:[transform:translateX(100%)]',
              'data-[ending-style]:[transform:translateX(100%)]',
              'rtl:data-[starting-style]:[transform:translateX(-100%)]',
              'rtl:data-[ending-style]:[transform:translateX(-100%)]',
            ].join(' ')}
          >
            <div
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a focusable window splitter (separator widget with a value); <hr> is a static, unfocusable break.
              role="separator"
              aria-orientation="vertical"
              aria-label={intl.formatMessage(interfaceMessages.resizePanel)}
              aria-valuemin={MIN_WIDTH}
              aria-valuemax={MAX_WIDTH}
              aria-valuenow={Math.round(width)}
              tabIndex={0}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onKeyDown={handleResizeKeyDown}
              className="focusable hover:bg-primary/40 absolute inset-y-0 inset-s-0 z-10 w-1.5 cursor-ew-resize touch-none select-none"
            />
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-current/10 p-4 ps-6">
              <Drawer.Title className="truncate text-lg font-semibold">
                {title}
              </Drawer.Title>
              <Drawer.Close
                render={
                  <CloseButton
                    aria-label={intl.formatMessage(commonMessages.close)}
                  />
                }
              />
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
