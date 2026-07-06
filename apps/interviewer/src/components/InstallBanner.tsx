import { MonitorDown } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import Button from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import {
  getDeferredPrompt,
  promptInstall,
  subscribeInstallPrompt,
} from '~/lib/pwa/installPrompt';

const SESSION_DISMISS_KEY = 'interviewer-v8:install-banner-dismissed';

// Installed detection: the display-mode media query covers Chromium and
// Safari dock apps; the legacy navigator.standalone flag covers iOS/iPadOS
// home-screen apps.
const isInstalledDisplayMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }
  return navigator.standalone === true;
};

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
      ? 'Interviews stored in a browser tab can be deleted by the browser. Install Interviewer to keep data safe on this device.'
      : "Interviews stored in a browser tab can be deleted by the browser. To keep data safe, install Interviewer using the install icon in the browser's address bar.";
  }
  const isFirefox = navigator.userAgent.includes('Firefox');
  if (isFirefox) {
    return "Interviews stored in a browser tab can be deleted by the browser, and Firefox can't install web apps. To keep data safe, install Interviewer from Chrome, Edge, or Safari on this device.";
  }
  // Safari: the 7-day eviction is its documented behaviour, and the install
  // path depends on the device. iPadOS reports 'MacIntel' in desktop mode;
  // real Macs have no touchscreen.
  const isMac =
    navigator.platform.startsWith('Mac') && navigator.maxTouchPoints === 0;
  return isMac
    ? 'Safari deletes data stored by a browser tab after about 7 days without use. To keep interview data safe, install Interviewer: choose Share → Add to Dock.'
    : 'Safari deletes data stored by a browser tab after about 7 days without use. To keep interview data safe, install Interviewer: choose Share → Add to Home Screen.';
};

// Pure presentation: a quiet full-width strip urging install, with an
// optional one-tap Install action when the browser offered a deferred
// prompt. It exists for data safety, not convenience — browsers can evict
// a website's stored data, while installed apps are exempt.
export function InstallBannerView({
  message,
  canPromptInstall,
  onInstall,
  onDismiss,
}: {
  message: string;
  canPromptInstall: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside
      aria-label="Install Interviewer"
      className="bg-surface-1 text-surface-1-contrast border-outline/40 flex w-full items-center gap-3 border-b px-6 py-2 text-sm"
    >
      <MonitorDown className="text-warning size-4 shrink-0" aria-hidden />
      <p className="m-0 flex-1">{message}</p>
      {canPromptInstall && (
        <Button color="primary" size="sm" onClick={onInstall}>
          Install
        </Button>
      )}
      <CloseButton size="sm" onClick={onDismiss} />
    </aside>
  );
}

// A quiet full-width strip at the top of the dashboard whenever the app is
// running in a browser tab rather than as an installed app. It exists for
// data safety, not convenience: browsers can evict a website's stored data,
// while installed apps are exempt — so researchers should install before
// collecting interviews. Dismissal lasts one session; the risk persists, so
// it returns next launch.
export function InstallBanner() {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
  );
  const [dismissed, setDismissed] = useState(readSessionDismissed);
  // Static per page load: installing mid-session still requires launching the
  // installed app, so the strip staying up in the old tab is accurate.
  const [installed] = useState(isInstalledDisplayMode);

  if (installed || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
    } catch {
      // Private mode etc.: the in-memory state still hides it for this session.
    }
    setDismissed(true);
  };

  const canPromptInstall = deferredPrompt !== null;

  return (
    <InstallBannerView
      message={bannerMessage(canPromptInstall)}
      canPromptInstall={canPromptInstall}
      onInstall={() => void promptInstall()}
      onDismiss={dismiss}
    />
  );
}
