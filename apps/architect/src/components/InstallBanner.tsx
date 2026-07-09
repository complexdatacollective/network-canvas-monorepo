import { Download, X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import {
  getDeferredPrompt,
  getInstalled,
  promptInstall,
  subscribeInstalled,
  subscribeInstallPrompt,
} from '~/utils/installPrompt';

const SESSION_DISMISS_KEY = 'architect:install-banner-dismissed';

const readSessionDismissed = () => {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
};

// Browser-specific message: each engine sees only its own eviction reality
// and its own install path. Whole strings per branch so each can localise.
const bannerMessage = (canPromptInstall: boolean): string => {
  const isChromium = 'userAgentData' in navigator;
  if (isChromium) {
    return canPromptInstall
      ? 'Protocols stored in a browser tab can be deleted by the browser. Install Architect to keep your work safe on this device.'
      : "Protocols stored in a browser tab can be deleted by the browser. To keep your work safe, install Architect using the install icon in the browser's address bar.";
  }
  const isFirefox = navigator.userAgent.includes('Firefox');
  if (isFirefox) {
    return "Protocols stored in a browser tab can be deleted by the browser, and Firefox can't install web apps. To keep your work safe, install Architect from Chrome, Edge, or Safari on this device.";
  }
  // Safari: the 7-day eviction is its documented behaviour, and the install
  // path depends on the device. iPadOS reports 'MacIntel' in desktop mode;
  // real Macs have no touchscreen.
  const isMac =
    navigator.platform.startsWith('Mac') && navigator.maxTouchPoints === 0;
  return isMac
    ? 'Safari deletes data stored by a browser tab after about 7 days without use. To keep your work safe, install Architect: choose Share → Add to Dock.'
    : 'Safari deletes data stored by a browser tab after about 7 days without use. To keep your work safe, install Architect: choose Share → Add to Home Screen.';
};

// A quiet full-width strip at the top of the screen whenever the app is
// running in a browser tab rather than as an installed app (mirrors
// Interviewer's InstallBanner). It exists for data safety, not convenience:
// browsers can evict a website's stored data, while installed apps are
// exempt. Dismissal lasts one session; the risk persists, so it returns on
// the next launch.
const InstallBanner = () => {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
  );
  const installed = useSyncExternalStore(subscribeInstalled, getInstalled);
  const [dismissed, setDismissed] = useState(readSessionDismissed);

  if (installed || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
    } catch {
      // Private mode etc.: the in-memory state still hides it for this session.
    }
    setDismissed(true);
  };

  return (
    <Alert
      aria-label="Install Architect"
      variant="warning"
      density="compact"
      className="border-outline bg-surface-1! text-surface-1-contrast! my-0 shrink-0 rounded-none! border-x-0 border-t-0 border-b px-6 py-2 shadow-none!"
    >
      <AlertDescription className="flex items-center gap-3 text-sm">
        <span className="flex-1">{bannerMessage(deferredPrompt !== null)}</span>
        {deferredPrompt !== null && (
          <Button
            color="primary"
            size="sm"
            className="text-sm"
            onClick={() => void promptInstall()}
          >
            <Download />
            Install
          </Button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="text-muted hover:text-surface-1-contrast inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-current/10"
        >
          <X className="size-4" />
        </button>
      </AlertDescription>
    </Alert>
  );
};

export default InstallBanner;
