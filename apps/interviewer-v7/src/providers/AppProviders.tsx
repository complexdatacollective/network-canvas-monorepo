import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Toast } from '@base-ui/react/toast';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';
import { AuthProvider } from '~/lib/auth/AuthContext';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <DirectionProvider direction="ltr">
        <Toast.Provider limit={7}>
          <TooltipProvider>
            <DndStoreProvider>
              <DialogProvider>
                <AuthProvider>{children}</AuthProvider>
              </DialogProvider>
            </DndStoreProvider>
          </TooltipProvider>
          <Toaster />
        </Toast.Provider>
      </DirectionProvider>
    </MotionConfig>
  );
}
