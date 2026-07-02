import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLocation } from 'wouter';

import { useToast } from '@codaco/fresco-ui/Toast';

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

// Headless: surfaces the update prompt through the app's toast system (which
// owns placement, stacking, motion, swipe-dismiss, and screen-reader
// announcements) rather than rendering its own floating chrome.
const PwaUpdateBanner = () => {
  const [location] = useLocation();
  const interviewActive = isInterviewActive(location);

  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();
  const loadedAt = useRef(Date.now());

  const { add, close } = useToast();
  const toastIdRef = useRef<string | null>(null);
  // An explicit user dismissal holds for the rest of the session; a
  // programmatic close (deferring while an interview starts) must not count
  // as one, or the prompt would never come back afterwards.
  const dismissedRef = useRef(false);
  const deferringRef = useRef(false);

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
  // gets the prompt. While an interview is active, do neither — the toast is
  // withdrawn and the pending update held; when the researcher leaves the
  // interview this effect re-runs (location changed) and the prompt surfaces.
  // The id/dismissal refs make re-runs idempotent, so the unstable
  // toast-manager identities in the deps are harmless.
  useEffect(() => {
    if (!needRefresh) return;
    if (interviewActive) {
      if (toastIdRef.current) {
        deferringRef.current = true;
        close(toastIdRef.current);
      }
      return;
    }
    if (Date.now() - loadedAt.current < FRESH_LOAD_WINDOW_MS) {
      void updateServiceWorker(true);
      return;
    }
    if (dismissedRef.current || toastIdRef.current) return;
    toastIdRef.current = add({
      title: 'Update available',
      description: 'A new version of Interviewer is ready. Your work is saved.',
      icon: <RefreshCw className="size-5" aria-hidden="true" />,
      timeout: 0,
      cancelLabel: 'Reload',
      onCancel: () => void updateServiceWorker(true),
      onClose: () => {
        toastIdRef.current = null;
        if (!deferringRef.current) dismissedRef.current = true;
        deferringRef.current = false;
      },
    });
  }, [needRefresh, interviewActive, updateServiceWorker, add, close]);

  return null;
};

export default PwaUpdateBanner;
