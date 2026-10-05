'use client';

import { Drawer } from '@base-ui/react/drawer';
import type { ReactNode } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';

type PersonDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Called once the closing animation has finished. */
  onClosed?: () => void;
  /** Where focus returns when the panel closes. */
  returnFocus: () => HTMLElement | null;
  title: string;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * The side panel a family member is added or described in. A modal Base UI
 * drawer from the inline end of the screen: focus moves into it, is trapped
 * there, and returns to the family tree when it closes.
 */
export default function PersonDrawer({
  open,
  onClose,
  onClosed,
  returnFocus,
  title,
  children,
  footer,
}: PersonDrawerProps) {
  const intl = useAppIntl();
  const portalContainer = usePortalContainer();

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClosed?.();
      }}
      swipeDirection="right"
    >
      <Drawer.Portal container={portalContainer ?? undefined}>
        <Drawer.Backdrop className="fixed inset-0 bg-black/30 transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Drawer.Viewport className="pointer-events-none fixed inset-y-0 right-0 w-full max-w-md">
          <Drawer.Popup
            finalFocus={() => returnFocus()}
            className={[
              'bg-surface-1 publish-colors text-text elevation-high pointer-events-auto absolute inset-0 flex flex-col',
              'transition-transform duration-300 ease-out',
              '[transform:translateX(var(--drawer-swipe-movement-x,0px))]',
              'data-[starting-style]:[transform:translateX(100%)]',
              'data-[ending-style]:[transform:translateX(100%)]',
            ].join(' ')}
            data-testid="pedigree-person-panel"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-current/10 p-4 pl-6">
              <Drawer.Title className="text-lg font-semibold">
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
            <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-current/10 p-4">
              {footer}
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
