import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { installServiceWorkerUpdate } from '@codaco/fresco-ui/appUpdate/serviceWorkerUpdate';
import useAppUpdate, {
  type UseAppUpdateResult,
} from '@codaco/fresco-ui/appUpdate/useAppUpdate';
import { APP_VERSION } from '~/lib/appVersion';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

type AppUpdateContextValue = UseAppUpdateResult;

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
// old PwaUpdateBanner.
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();

  const {
    needRefresh: [needRefresh],
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
    // The shared install action is the sole reload owner. vite-plugin-pwa's
    // default callback reloads as soon as the new worker takes control, which
    // can navigate an already-rendered app without the user requesting it.
    onNeedReload: () => undefined,
  });

  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  const installUpdate = useCallback(
    () => installServiceWorkerUpdate({ registration }),
    [registration],
  );

  const update = useAppUpdate({
    app: 'interviewer',
    currentVersion: APP_VERSION,
    needRefresh,
    installUpdate,
  });

  return (
    <AppUpdateContext.Provider value={update}>
      {children}
    </AppUpdateContext.Provider>
  );
}
