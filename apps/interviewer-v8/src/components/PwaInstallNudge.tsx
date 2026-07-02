import { Download, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { cx } from '@codaco/fresco-ui/utils/cva';
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

const PwaInstallNudge = () => {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
  );
  const [dismissed, setDismissed] = useState(readDismissed);
  const [ready, setReady] = useState(false);

  // Hold the nudge back for a few seconds so it doesn't interrupt the moment the
  // page loads.
  useEffect(() => {
    if (!deferredPrompt) return undefined;
    const timer = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [deferredPrompt]);

  if (!deferredPrompt || dismissed || !ready) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Private mode etc.: still hide for this session.
    }
    setDismissed(true);
  };

  return (
    <aside
      aria-label="Install Interviewer"
      className={cx(
        'fixed top-(--space-md) right-(--space-md) z-(--z-tooltip)',
        'flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-(--space-sm)',
        'border-border bg-surface-1 text-surface-1-foreground rounded border p-(--space-md) text-sm shadow-lg',
      )}
    >
      {/* Arrow pointing up toward the browser's address-bar install icon. */}
      <span
        aria-hidden
        className="border-border bg-surface-1 absolute top-[-7px] right-7 size-3 rotate-45 border-t border-l"
      />

      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="text-muted-foreground hover:text-surface-1-foreground absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-full transition-colors hover:bg-current/10"
      >
        <X className="size-4" />
      </button>

      <p className="m-0 pr-(--space-lg)">
        Did you know you can install Interviewer and use it like an app, even
        offline?
      </p>
      <div className="flex justify-end">
        <Button
          color="primary"
          size="sm"
          onClick={() => void promptInstall()}
          icon={<Download />}
        >
          Install
        </Button>
      </div>
    </aside>
  );
};

export default PwaInstallNudge;
