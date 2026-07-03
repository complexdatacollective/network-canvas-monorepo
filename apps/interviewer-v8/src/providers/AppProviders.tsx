import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Toast } from '@base-ui/react/toast';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';
import { AnalyticsProvider } from '~/lib/analytics/AnalyticsProvider';
import { AuthProvider } from '~/lib/auth/AuthContext';
import { StepUpAuthProvider } from '~/lib/auth/StepUpAuthProvider';
import { OnlineStatusProvider } from '~/lib/net/OnlineStatusProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <DirectionProvider direction="ltr">
        <Toast.Provider limit={7}>
          <TooltipProvider>
            <OnlineStatusProvider>
              <DndStoreProvider>
                <AuthProvider>
                  <AnalyticsProvider>
                    <DialogProvider>
                      <StepUpAuthProvider>{children}</StepUpAuthProvider>
                    </DialogProvider>
                  </AnalyticsProvider>
                </AuthProvider>
              </DndStoreProvider>
            </OnlineStatusProvider>
          </TooltipProvider>
          <Toaster />
        </Toast.Provider>
      </DirectionProvider>
    </MotionConfig>
  );
}
