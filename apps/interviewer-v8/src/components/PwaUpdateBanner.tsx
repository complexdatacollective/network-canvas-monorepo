import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import { cx } from '@codaco/fresco-ui/utils/cva';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
// A pending update that surfaces within this window of loading the page is
// treated as "the latest version was already available when you opened the app",
// and is applied silently. Anything later is an update that arrived during an
// open session, which we surface as a prompt.
const FRESH_LOAD_WINDOW_MS = 20 * 1000;

// The one route where a reload would interrupt data collection. While the
// location is inside it, neither the silent fresh-load update nor the manual
// Reload is allowed — the update is deferred until the researcher leaves.
const isInterviewActive = (location: string): boolean =>
  location.startsWith('/interview/');

const PwaUpdateBanner = () => {
  const [location] = useLocation();
  const interviewActive = isInterviewActive(location);

  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();
  const [promptVisible, setPromptVisible] = useState(false);
  const loadedAt = useRef(Date.now());

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
  });

  // Poll for a new version during long sessions; clear the timer on unmount so
  // it does not leak or keep firing against a stale registration.
  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  // Fresh loads (off an interview) end up on the latest version: a pending
  // update is applied silently. An update that appears later, in an open tab,
  // gets the prompt. While an interview is active, do neither — hold the pending
  // update; when the researcher leaves the interview this effect re-runs
  // (location changed) and the prompt surfaces.
  useEffect(() => {
    if (!needRefresh) return;
    if (interviewActive) return;
    if (Date.now() - loadedAt.current < FRESH_LOAD_WINDOW_MS) {
      void updateServiceWorker(true);
    } else {
      setPromptVisible(true);
    }
  }, [needRefresh, interviewActive, updateServiceWorker]);

  if (!promptVisible || interviewActive) return null;

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
        A new version of Interviewer is available. Your work is saved.
      </p>
      <Button
        color="primary"
        size="sm"
        onClick={() => void updateServiceWorker(true)}
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
