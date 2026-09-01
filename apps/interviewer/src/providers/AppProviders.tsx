import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Toast } from '@base-ui/react/toast';
import type { ReactNode } from 'react';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';
import { AppErrorBoundary } from '~/components/AppErrorBoundary';
import { AnalyticsProvider } from '~/lib/analytics/AnalyticsProvider';
import { AuthProvider } from '~/lib/auth/AuthContext';
import { StepUpAuthProvider } from '~/lib/auth/StepUpAuthProvider';
import { OnlineStatusProvider } from '~/lib/net/OnlineStatusProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider>
      <DirectionProvider direction="ltr">
        <Toast.Provider limit={7}>
          <TooltipProvider>
            <OnlineStatusProvider>
              <DndStoreProvider>
                <AuthProvider>
                  <AnalyticsProvider>
                    <AppErrorBoundary>
                      <DialogProvider>
                        <StepUpAuthProvider>{children}</StepUpAuthProvider>
                      </DialogProvider>
                    </AppErrorBoundary>
                  </AnalyticsProvider>
                </AuthProvider>
              </DndStoreProvider>
            </OnlineStatusProvider>
          </TooltipProvider>
          <Toaster />
        </Toast.Provider>
      </DirectionProvider>
    </AnimationProvider>
  );
}
