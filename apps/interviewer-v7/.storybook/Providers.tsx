'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Toast } from '@base-ui/react/toast';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';

declare global {
  // eslint-disable-next-line no-var
  var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
}

/**
 * Mounted as a global decorator in preview.tsx so every story sees the same
 * Fresco-style provider stack the app mounts in `AppProviders`, minus the
 * auth/step-up providers (those need the platform DB and aren't relevant to
 * presentational components). Provides the Toast surface, Tooltip, drag-and-drop
 * store, and dialog host that fresco-ui components may reach for.
 */
export default function Providers({
  children,
  disableAnimations,
}: {
  children: ReactNode;
  disableAnimations?: boolean;
}) {
  if (disableAnimations) {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  }

  return (
    <MotionConfig reducedMotion="user" skipAnimations={disableAnimations}>
      <DirectionProvider direction="ltr">
        <Toast.Provider limit={7}>
          <TooltipProvider>
            <DndStoreProvider>
              <DialogProvider>{children}</DialogProvider>
            </DndStoreProvider>
          </TooltipProvider>
          <Toaster />
        </Toast.Provider>
      </DirectionProvider>
    </MotionConfig>
  );
}
