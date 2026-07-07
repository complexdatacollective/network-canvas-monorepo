import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLocation } from 'wouter';

import useAppUpdate, {
  type UseAppUpdateResult,
} from '@codaco/fresco-ui/appUpdate/useAppUpdate';
import { APP_VERSION } from '~/lib/appVersion';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

type AppUpdateContextValue = UseAppUpdateResult & { hasUnsavedWork: boolean };

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function useAppUpdateContext(): AppUpdateContextValue {
  const value = useContext(AppUpdateContext);
  if (!value) {
    throw new Error(
      'useAppUpdateContext must be used within AppUpdateProvider',
    );
  }
  return value;
}

// Owns service-worker registration (so the app stays installable/offline) and
// the update state, exposing it to the version pill via context. Replaces the
// old PwaUpdateBanner. A reload during an interview would interrupt data
// collection, so `/interview/*` counts as work in progress.
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const hasUnsavedWork = location.startsWith('/interview/');

  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
  });

  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  const installUpdate = useCallback(
    () => void updateServiceWorker(true),
    [updateServiceWorker],
  );

  const update = useAppUpdate({
    app: 'interviewer',
    currentVersion: APP_VERSION,
    needRefresh,
    hasUnsavedWork,
    installUpdate,
  });

  return (
    <AppUpdateContext.Provider value={{ ...update, hasUnsavedWork }}>
      {children}
    </AppUpdateContext.Provider>
  );
}
