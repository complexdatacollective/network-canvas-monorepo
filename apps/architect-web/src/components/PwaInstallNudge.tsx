import { Download, X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import { cx } from '~/utils/cva';
import {
  getDeferredPrompt,
  promptInstall,
  subscribeInstallPrompt,
} from '~/utils/installPrompt';

const DISMISSED_KEY = 'architect:pwa-install-nudge-dismissed';
const LEARN_MORE_URL = 'https://documentation.networkcanvas.com';

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
        'fixed top-4 right-4 z-50 flex max-w-xs flex-col gap-3',
        'bg-rich-black text-platinum rounded-2xl border border-white/10 py-3 pr-9 pl-4 shadow-lg',
      )}
    >
      {/* Caret hinting up towards the browser's address-bar install icon. */}
      <span
        aria-hidden
        className="bg-rich-black absolute -top-1 right-6 size-2 rotate-45 border-t border-l border-white/10"
      />
      <button
        type="button"
        aria-label="Dismiss"
        className="text-platinum/60 hover:text-platinum absolute top-2 right-2"
        onClick={dismiss}
      >
        <X aria-hidden className="size-4" />
      </button>

      <div className="flex items-start gap-3">
        <Download
          aria-hidden
          className="text-sea-green mt-0.5 size-5 shrink-0"
        />
        <p className="text-sm">
          Did you know that you can install Architect Web and use it like an app
          (even offline)?
        </p>
      </div>

      <div className="flex items-center gap-4 self-end">
        <button
          type="button"
          className={cx(
            'bg-sea-green rounded-full px-3 py-1 text-sm font-semibold text-white',
          )}
          onClick={() => void promptInstall()}
        >
          Install
        </button>
        <a
          href={LEARN_MORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-platinum/70 hover:text-platinum text-sm underline"
        >
          Learn more
        </a>
      </div>
    </aside>
  );
};

export default PwaInstallNudge;
