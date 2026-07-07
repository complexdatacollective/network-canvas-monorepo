import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { actionCreators as dialogActions } from '~/ducks/modules/dialogs';
import Button from '~/lib/legacy-ui/components/Button';
import { getStageDraftDirty } from '~/selectors/stageEditorDraft';
import {
  isCriticalOperationInProgress,
  subscribeCriticalOperation,
} from '~/utils/criticalOperation';
import { cx } from '~/utils/cva';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
// A pending update that surfaces within this window of loading the page is
// treated as "the latest version was already available when you opened the app",
// and is applied silently. Anything later is an update that arrived during an
// open session, which we surface as a prompt.
const FRESH_LOAD_WINDOW_MS = 20 * 1000;

const PwaUpdateBanner = () => {
  const dispatch = useAppDispatch();
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();
  const [promptVisible, setPromptVisible] = useState(false);
  const loadedAt = useRef(Date.now());
  const confirming = useRef(false);

  // Proxies for work that a reload would discard: an unsaved stage-editor draft,
  // any open dialog (which also covers the mid-import migration/validation/error
  // dialogs a cold file-handler launch can raise), and an in-flight import or
  // export (the silent happy-path import window raises no dialog). Applying an
  // update reloads the tab, so gate the reload on these being clear.
  const draftDirty = useAppSelector(getStageDraftDirty);
  const hasOpenDialog = useAppSelector(
    (state) => state.dialogs.dialogs.length > 0,
  );
  const criticalOperationInProgress = useSyncExternalStore(
    subscribeCriticalOperation,
    isCriticalOperationInProgress,
    () => false,
  );
  const reloadWouldLoseWork =
    draftDirty || hasOpenDialog || criticalOperationInProgress;

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
  });

  // Poll for a new version during long editing sessions; clear the timer on
  // unmount so it does not leak or keep firing against a stale registration.
  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  // Fresh loads always end up on the latest version: a pending update is applied
  // silently (which reloads the page). An update that appears later, in an
  // already-open tab, gets the prompt instead. The auto-apply is suppressed
  // while a reload would lose work — e.g. a cold file-handler import still
  // running (its migration/validation dialogs keep this true); the effect
  // re-runs when that clears, and falls through to the prompt if the window has
  // meanwhile elapsed.
  useEffect(() => {
    if (!needRefresh) return undefined;
    const remaining = FRESH_LOAD_WINDOW_MS - (Date.now() - loadedAt.current);
    if (remaining <= 0) {
      setPromptVisible(true);
      return undefined;
    }
    if (!reloadWouldLoseWork) {
      void updateServiceWorker(true);
      return undefined;
    }
    // Within the window but a reload would lose work: hold off. The effect
    // re-runs and applies silently if the work clears in time; otherwise show
    // the prompt once the window elapses so the update is never lost.
    const timerId = window.setTimeout(() => setPromptVisible(true), remaining);
    return () => window.clearTimeout(timerId);
  }, [needRefresh, reloadWouldLoseWork, updateServiceWorker]);

  const handleReload = useCallback(() => {
    if (!reloadWouldLoseWork) {
      void updateServiceWorker(true);
      return;
    }
    if (confirming.current) return;
    confirming.current = true;
    void dispatch(
      dialogActions.openDialog({
        type: 'Confirm',
        title: 'Reload to update?',
        message:
          'You have changes in progress that have not been saved yet. Reloading now to update will discard them. Save your work first, or reload anyway?',
        confirmLabel: 'Reload anyway',
        onConfirm: () => void updateServiceWorker(true),
      }),
    ).finally(() => {
      confirming.current = false;
    });
  }, [dispatch, reloadWouldLoseWork, updateServiceWorker]);

  if (!promptVisible) return null;

  return (
    <aside
      aria-label="Update available"
      aria-live="polite"
      className={cx(
        'fixed bottom-(--space-md) left-1/2 z-(--z-global-ui) -translate-x-1/2',
        'flex max-w-[calc(100vw-2rem)] items-center gap-(--space-md)',
        'border-border bg-surface-1 text-surface-1-foreground rounded border p-(--space-md) text-sm shadow-lg',
      )}
    >
      <p className="m-0">
        A new version of Architect is available. Reloading updates this tab and
        any other open Architect tabs; unsaved changes in progress will be lost.
      </p>
      <Button
        color="sea-green"
        size="small"
        className="text-sm"
        onClick={handleReload}
      >
        Reload
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setPromptVisible(false)}
        className="text-muted-foreground hover:text-surface-1-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-current/10"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
};

export default PwaUpdateBanner;
