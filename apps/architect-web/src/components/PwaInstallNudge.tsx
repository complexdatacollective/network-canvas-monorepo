import { Download, X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import { cx } from '~/utils/cva';
import {
  getDeferredPrompt,
  promptInstall,
  subscribeInstallPrompt,
} from '~/utils/installPrompt';

const DISMISSED_KEY = 'architect:pwa-install-nudge-dismissed';

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

  if (!deferredPrompt || dismissed) return null;

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
      aria-label="Install Architect"
      className={cx(
        'fixed top-4 right-4 z-50 flex max-w-xs items-center gap-3',
        'bg-rich-black text-platinum rounded-2xl border border-white/10 px-4 py-3 shadow-lg',
      )}
    >
      {/* Caret hinting up towards the browser's address-bar install icon. */}
      <span
        aria-hidden
        className="bg-rich-black absolute -top-1 right-6 size-2 rotate-45 border-t border-l border-white/10"
      />
      <Download aria-hidden className="text-sea-green size-5 shrink-0" />
      <span className="text-sm">Install Architect to use it offline.</span>
      <button
        type="button"
        className={cx(
          'bg-sea-green shrink-0 rounded-full px-3 py-1 text-sm font-semibold text-white',
        )}
        onClick={() => void promptInstall()}
      >
        Install
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-platinum/60 hover:text-platinum shrink-0"
        onClick={dismiss}
      >
        <X aria-hidden className="size-4" />
      </button>
    </aside>
  );
};

export default PwaInstallNudge;
