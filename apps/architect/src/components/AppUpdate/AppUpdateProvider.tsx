import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import useAppUpdate, {
  type UseAppUpdateResult,
} from '@codaco/fresco-ui/appUpdate/useAppUpdate';
import { useAppSelector } from '~/ducks/hooks';
import { getStageDraftDirty } from '~/selectors/stageEditorDraft';
import { appVersion } from '~/utils/appVersion';
import {
  isCriticalOperationInProgress,
  subscribeCriticalOperation,
} from '~/utils/criticalOperation';

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

// Owns service-worker registration (so the app stays installable) and the
// update state, exposing it to the version pill via context. Replaces the old
// PwaUpdateBanner.
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();

  // A reload discards an unsaved stage-editor draft, any open dialog, and any
  // in-flight import/export; gate auto-apply on these being clear.
  const draftDirty = useAppSelector(getStageDraftDirty);
  const hasOpenDialog = useAppSelector(
    (state) => state.dialogs.dialogs.length > 0,
  );
  const criticalOperationInProgress = useSyncExternalStore(
    subscribeCriticalOperation,
    isCriticalOperationInProgress,
    () => false,
  );
  const hasUnsavedWork =
    draftDirty || hasOpenDialog || criticalOperationInProgress;

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
    app: 'architect',
    currentVersion: appVersion,
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
