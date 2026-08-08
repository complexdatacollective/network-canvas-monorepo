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

import { installServiceWorkerUpdate } from '@codaco/fresco-ui/appUpdate/serviceWorkerUpdate';
import useAppUpdate, {
  type UseAppUpdateResult,
} from '@codaco/fresco-ui/appUpdate/useAppUpdate';
import { flushStageLiveValues } from '~/components/StageEditor/StageFormBridge';
import { useAppSelector } from '~/ducks/hooks';
import { store } from '~/ducks/store';
import { getLiveStageDraftDirty } from '~/selectors/stageEditorDraft';
import { appVersion } from '~/utils/appVersion';
import {
  isCriticalOperationInProgress,
  subscribeCriticalOperation,
} from '~/utils/criticalOperation';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const OPEN_DIALOG_SELECTOR = '[role="dialog"]';

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

const subscribeOpenDialogPresence = (listener: () => void): (() => void) => {
  if (typeof document === 'undefined') return () => {};

  const observer = new MutationObserver(listener);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['aria-hidden', 'hidden', 'role', 'style'],
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
};

const hasOpenDialog = (): boolean => {
  if (typeof document === 'undefined') return false;
  return document.querySelector(OPEN_DIALOG_SELECTOR) !== null;
};

// Owns service-worker registration (so the app stays installable) and the
// update state, exposing it to the version pill via context. Replaces the old
// PwaUpdateBanner.
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();

  // A reload discards an unsaved stage-editor draft, any open dialog, and any
  // in-flight import/export; gate auto-apply on these being clear.
  const draftDirty = useAppSelector(getLiveStageDraftDirty);
  const dialogOpen = useSyncExternalStore(
    subscribeOpenDialogPresence,
    hasOpenDialog,
    () => false,
  );
  const criticalOperationInProgress = useSyncExternalStore(
    subscribeCriticalOperation,
    isCriticalOperationInProgress,
    () => false,
  );
  const hasUnsavedWork =
    draftDirty || dialogOpen || criticalOperationInProgress;

  const {
    needRefresh: [needRefresh],
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
    () => installServiceWorkerUpdate({ registration }),
    [registration],
  );

  // Auto-apply reloads the app without asking, so it must not read the
  // debounced mirror `getLiveStageDraftDirty` is built on: an edit made inside
  // the coalescing window still reports pristine, and the reload would discard
  // it. Flush the mirror and re-read everything synchronously at the decision
  // point — this runs inside the hook's effect, so the dispatch is safe here in
  // a way it would not be during render (which is why `hasUnsavedWork` above,
  // used for the manual button and the dialog, stays a rendered value).
  const checkUnsavedWork = useCallback(() => {
    flushStageLiveValues();
    return (
      getLiveStageDraftDirty(store.getState()) ||
      hasOpenDialog() ||
      isCriticalOperationInProgress()
    );
  }, []);

  const update = useAppUpdate({
    app: 'architect',
    currentVersion: appVersion,
    needRefresh,
    hasUnsavedWork,
    installUpdate,
    checkUnsavedWork,
  });

  return (
    <AppUpdateContext.Provider value={{ ...update, hasUnsavedWork }}>
      {children}
    </AppUpdateContext.Provider>
  );
}
