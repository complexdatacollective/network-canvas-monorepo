import { useState, useSyncExternalStore } from 'react';

import {
  getBrowserStorageRisk,
  StorageRiskBanner,
  type StorageRisk,
} from '@codaco/fresco-ui/StorageRiskBanner';
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

// Risk selects both intent and copy. Architect's wording focuses on protocols,
// which can be exported and backed up independently of the app.
const bannerMessage = (
  risk: StorageRisk,
  canPromptInstall: boolean,
): string => {
  if (risk === 3) {
    return canPromptInstall
      ? 'Chrome and Edge rarely delete site data, but protocols stored in a browser tab are not guaranteed. Install Architect to protect your work on this device.'
      : "Chrome and Edge rarely delete site data, but protocols stored in a browser tab are not guaranteed. Install Architect using the install icon in the browser's address bar.";
  }
  if (risk === 2) {
    return 'Firefox can delete protocols stored in this tab if this device runs low on storage. Allow persistent storage when Firefox asks, and export backups regularly. Install Architect if your browser and device support it.';
  }
  // WebKit: the 7-day eviction is its documented behaviour, and the install
  // path depends on the device. This also covers Chrome/Firefox on iOS, where
  // Apple requires WebKit. iPadOS reports 'MacIntel' in desktop mode; real Macs
  // have no touchscreen.
  const isMac =
    navigator.platform.startsWith('Mac') && navigator.maxTouchPoints === 0;
  return isMac
    ? 'Safari can delete protocols stored in this tab after about 7 days without interaction. Install Architect: choose Share → Add to Dock, and export backups regularly.'
    : 'On this device, the browser can delete protocols stored in this tab after about 7 days without interaction. Install Architect: choose Share → Add to Home Screen, and export backups regularly.';
};

function InstallBannerView({
  risk,
  canPromptInstall,
  onInstall,
  onDismiss,
}: {
  risk: StorageRisk;
  canPromptInstall: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <StorageRiskBanner
      aria-label="Install Architect"
      risk={risk}
      installAction={canPromptInstall ? onInstall : undefined}
      onDismiss={onDismiss}
    >
      {bannerMessage(risk, canPromptInstall)}
    </StorageRiskBanner>
  );
}

// A quiet full-width strip at the top of the screen whenever the app is
// running in a browser tab rather than as an installed app (mirrors
// Interviewer's InstallBanner). It exists for data safety, not convenience:
// browsers can evict a website's stored data, while installation protects
// against routine cleanup. Dismissal lasts one session; the risk persists, so
// it returns on the next launch.
const InstallBanner = () => {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
  );
  const installed = useSyncExternalStore(subscribeInstalled, getInstalled);
  const [dismissed, setDismissed] = useState(readSessionDismissed);

  if (installed || dismissed) return null;

  const risk = getBrowserStorageRisk();

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
    } catch {
      // Private mode etc.: the in-memory state still hides it for this session.
    }
    setDismissed(true);
  };

  return (
    <InstallBannerView
      risk={risk}
      canPromptInstall={deferredPrompt !== null}
      onInstall={() => void promptInstall()}
      onDismiss={dismiss}
    />
  );
};

export default InstallBanner;
