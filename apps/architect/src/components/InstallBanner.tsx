import { useState, useSyncExternalStore } from 'react';

import {
  type BrowserStorageProfile,
  getBrowserStorageProfile,
  StorageRiskBanner,
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
  profile: BrowserStorageProfile,
  canPromptInstall: boolean,
): string => {
  const { browserName, engine, risk } = profile;
  if (risk === 3) {
    return canPromptInstall
      ? `${browserName} rarely removes Network Canvas data automatically, but data stored in a browser tab is not guaranteed. Install Architect now to protect your protocols from being deleted.`
      : `${browserName} rarely removes Network Canvas data automatically, but data stored in a browser tab is not guaranteed. Use the install icon in the browser's address bar to install Architect now and protect your protocols from being deleted.`;
  }
  if (risk === 2) {
    return `${browserName} may remove Network Canvas data when this device runs low on storage. Allow persistent storage when ${browserName} asks, and install Architect if your device supports it to protect your protocols from being deleted.`;
  }
  // WebKit: the 7-day eviction is its documented behaviour, and the install
  // path depends on the device. This also covers Chrome/Firefox on iOS, where
  // Apple requires WebKit. iPadOS reports 'MacIntel' in desktop mode; real Macs
  // have no touchscreen.
  const isMac =
    navigator.platform.startsWith('Mac') && navigator.maxTouchPoints === 0;
  const storagePolicyDescription =
    engine === 'webkit' && browserName !== 'Safari'
      ? `${browserName} uses WebKit, which is known to remove Network Canvas data`
      : `${browserName} is known to remove Network Canvas data`;
  return isMac
    ? `${storagePolicyDescription} after 7 days of inactivity. Install Architect now to protect your protocols from being deleted: choose Share → Add to Dock.`
    : `${storagePolicyDescription} after 7 days of inactivity. Install Architect now to protect your protocols from being deleted: choose Share → Add to Home Screen.`;
};

function InstallBannerView({
  profile,
  canPromptInstall,
  onInstall,
  onDismiss,
}: {
  profile: BrowserStorageProfile;
  canPromptInstall: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <StorageRiskBanner
      aria-label="Install Architect"
      risk={profile.risk}
      installAction={canPromptInstall ? onInstall : undefined}
      onDismiss={onDismiss}
    >
      {bannerMessage(profile, canPromptInstall)}
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

  const profile = getBrowserStorageProfile();

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
      profile={profile}
      canPromptInstall={deferredPrompt !== null}
      onInstall={() => void promptInstall()}
      onDismiss={dismiss}
    />
  );
};

export default InstallBanner;
