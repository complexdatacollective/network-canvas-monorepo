'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Toast } from '@base-ui/react/toast';
import { MotionConfig } from 'motion/react';
import { type ComponentType, type ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';

export default function Providers({
  children,
  disableAnimations,
  nuqsAdapter: NuqsAdapter,
}: {
  children: ReactNode;
  disableAnimations?: boolean;
  /**
   * Required rather than defaulted to the Next adapter: a default parameter is
   * still a static import, so defaulting would pull Next's client runtime into
   * every host's bundle, including hosts that are not Next.
   */
  nuqsAdapter: ComponentType<{ children: ReactNode }>;
}) {
  if (disableAnimations) {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  }

  return (
    <NuqsAdapter>
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
    </NuqsAdapter>
  );
}
