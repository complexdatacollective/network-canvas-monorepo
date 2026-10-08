import { Toast } from '@base-ui/react/toast';
import type { ReactNode } from 'react';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import LocaleLoadFailureToast from '@codaco/fresco-ui/LocaleLoadFailureToast';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';
import { AppErrorBoundary } from '~/components/AppErrorBoundary';
import {
  AnalyticsProvider,
  useAnalytics,
} from '~/lib/analytics/AnalyticsProvider';
import { AuthProvider } from '~/lib/auth/AuthContext';
import { StepUpAuthProvider } from '~/lib/auth/StepUpAuthProvider';
import { OnlineStatusProvider } from '~/lib/net/OnlineStatusProvider';

function LanguageUnavailableNotice() {
  const analytics = useAnalytics();
  return (
    <LocaleLoadFailureToast
      onReload={() => window.location.reload()}
      onFailure={(error, locale) =>
        analytics.captureException(error, { feature: 'locale-load', locale })
      }
    />
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider>
      <Toast.Provider limit={7}>
        <TooltipProvider>
          <OnlineStatusProvider>
            <DndStoreProvider>
              <AuthProvider>
                <AnalyticsProvider>
                  <LanguageUnavailableNotice />
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
    </AnimationProvider>
  );
}
