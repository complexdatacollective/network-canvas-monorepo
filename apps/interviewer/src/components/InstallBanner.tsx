import { useState, useSyncExternalStore } from 'react';

import {
  type BrowserStorageProfile,
  getBrowserStorageProfile,
  StorageRiskBanner,
} from '@codaco/fresco-ui/StorageRiskBanner';
import {
  getDeferredPrompt,
  promptInstall,
  subscribeInstallPrompt,
} from '~/lib/pwa/installPrompt';

const SESSION_DISMISS_KEY = 'interviewer:install-banner-dismissed';

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

// Risk selects both intent and copy. The Interviewer wording deliberately
// foregrounds unexported research data, whose loss is irreversible.
const bannerMessage = (
  profile: BrowserStorageProfile,
  canPromptInstall: boolean,
): string => {
  const { browserName, engine, risk } = profile;
  if (risk === 3) {
    return canPromptInstall
      ? `${browserName} rarely removes Network Canvas data automatically, but interview data stored in a browser tab is not guaranteed. Install Interviewer now, before collecting data, to protect your interview data from being deleted.`
      : `${browserName} rarely removes Network Canvas data automatically, but interview data stored in a browser tab is not guaranteed. Before collecting data, use the install icon in the browser's address bar to install Interviewer and protect your interview data from being deleted.`;
  }
  if (risk === 2) {
    return `${browserName} may remove Network Canvas data when this device runs low on storage. Before collecting data, allow persistent storage when ${browserName} asks and install Interviewer if your device supports it to protect your interview data from being deleted.`;
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
    ? `${storagePolicyDescription} after 7 days of inactivity. Install Interviewer now, before collecting data, to protect your interview data from being deleted: choose Share → Add to Dock.`
    : `${storagePolicyDescription} after 7 days of inactivity. Install Interviewer now, before collecting data, to protect your interview data from being deleted: choose Share → Add to Home Screen.`;
};

// Pure presentation: a quiet full-width strip urging install, with an
// optional one-tap Install action when the browser offered a deferred
// prompt. It exists for data safety, not convenience — browsers can evict a
// website's stored data, while installation protects against routine cleanup.
export function InstallBannerView({
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
      aria-label="Install Interviewer"
      risk={profile.risk}
      installAction={canPromptInstall ? onInstall : undefined}
      onDismiss={onDismiss}
    >
      {bannerMessage(profile, canPromptInstall)}
    </StorageRiskBanner>
  );
}

// A quiet full-width strip at the top of the dashboard whenever the app is
// running in a browser tab rather than as an installed app. It exists for
// data safety, not convenience: browsers can evict a website's stored data,
// while installation protects against routine cleanup — so researchers should
// install before collecting interviews. Dismissal lasts one session; the risk
// persists, so it returns next launch.
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
  const profile = getBrowserStorageProfile();

  return (
    <InstallBannerView
      profile={profile}
      canPromptInstall={canPromptInstall}
      onInstall={() => void promptInstall()}
      onDismiss={dismiss}
    />
  );
}
