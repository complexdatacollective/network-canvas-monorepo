import { Download } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useToast } from '@codaco/fresco-ui/Toast';
import {
  getDeferredPrompt,
  promptInstall,
  subscribeInstallPrompt,
} from '~/lib/pwa/installPrompt';

const DISMISSED_KEY = 'interviewer-v8:pwa-install-nudge-dismissed';
const SHOW_DELAY_MS = 5000;

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const persistDismissed = () => {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // Private mode etc.: the in-memory state still hides it for this session.
  }
};

// Headless: offers the one-tap install through the app's toast system rather
// than bespoke floating chrome. Closing the toast in any way counts as
// acting on the nudge (installed, declined the browser dialog, or dismissed),
// so it never shows again on this device.
const PwaInstallNudge = () => {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
  );
  const [dismissed, setDismissed] = useState(readDismissed);

  const { add, close } = useToast();
  const toastIdRef = useRef<string | null>(null);

  // Hold the nudge back for a few seconds so it doesn't interrupt the moment
  // the page loads. The id ref makes re-runs idempotent, so the unstable
  // toast-manager identities in the deps are harmless.
  useEffect(() => {
    if (!deferredPrompt || dismissed) return undefined;
    const timer = window.setTimeout(() => {
      if (toastIdRef.current) return;
      toastIdRef.current = add({
        title: 'Install Interviewer',
        description:
          'Add Interviewer to this device to use it like an app — it works fully offline.',
        icon: <Download className="size-5" aria-hidden="true" />,
        timeout: 0,
        cancelLabel: 'Install',
        onCancel: () => {
          void promptInstall();
          if (toastIdRef.current) close(toastIdRef.current);
        },
        onClose: () => {
          toastIdRef.current = null;
          persistDismissed();
          setDismissed(true);
        },
      });
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [deferredPrompt, dismissed, add, close]);

  return null;
};

export default PwaInstallNudge;
