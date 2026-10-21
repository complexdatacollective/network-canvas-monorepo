import {
  type IntlShape,
  createAppIntl,
  defineMessages,
} from '@codaco/app-i18n/messages';

const defaultIntl = createAppIntl({ locale: 'en' });
import { useState, useSyncExternalStore } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
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
const utilityMessages = defineMessages({
  rarelyRemovesNetworkCanvasData: {
    id: 'architect.utility.installBanner.rarelyRemovesNetworkCanvasData',
    defaultMessage:
      '{browserName} rarely removes Network Canvas data automatically, but data stored in a browser tab is not guaranteed. Install Architect now to protect your protocols from being deleted.',
    description:
      'Researcher-facing explanatory text in components / InstallBanner.',
  },
  rarelyRemovesNetworkCanvasData16bdc: {
    id: 'architect.utility.installBanner.rarelyRemovesNetworkCanvasData16bdc',
    defaultMessage:
      "{browserName} rarely removes Network Canvas data automatically, but data stored in a browser tab is not guaranteed. Use the install icon in the browser's address bar to install Architect now and protect your protocols from being deleted.",
    description:
      'Researcher-facing explanatory text in components / InstallBanner.',
  },
  mayRemoveNetworkCanvasData: {
    id: 'architect.utility.installBanner.mayRemoveNetworkCanvasData',
    defaultMessage:
      '{browserName} may remove Network Canvas data when this device runs low on storage. Allow persistent storage when {browserNameValue} asks, and install Architect if your device supports it to protect your protocols from being deleted.',
    description:
      'Researcher-facing explanatory text in components / InstallBanner.',
  },
  after7DaysOfInactivity: {
    id: 'architect.utility.installBanner.after7DaysOfInactivity',
    defaultMessage:
      '{usesWebKit, select, true {{browserName} uses WebKit, which is known to remove Network Canvas data after 7 days of inactivity.} other {{browserName} is known to remove Network Canvas data after 7 days of inactivity.}} Install Architect now to protect your protocols from being deleted: choose Share → Add to Dock.',
    description:
      'Researcher-facing explanatory text in components / InstallBanner.',
  },
  after7DaysOfInactivity7c6c0: {
    id: 'architect.utility.installBanner.after7DaysOfInactivity7c6c0',
    defaultMessage:
      '{usesWebKit, select, true {{browserName} uses WebKit, which is known to remove Network Canvas data after 7 days of inactivity.} other {{browserName} is known to remove Network Canvas data after 7 days of inactivity.}} Install Architect now to protect your protocols from being deleted: choose Share → Add to Home Screen.',
    description:
      'Researcher-facing explanatory text in components / InstallBanner.',
  },
});
const messages = defineMessages({
  installArchitect: {
    id: 'architect.installBanner.installArchitect',
    defaultMessage: 'Install Architect',
    description: 'The aria-label text in components / InstallBanner.',
  },
});

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
  intl: IntlShape = defaultIntl,
): string => {
  const { browserName, engine, risk } = profile;
  if (risk === 3) {
    return canPromptInstall
      ? intl.formatMessage(utilityMessages.rarelyRemovesNetworkCanvasData, {
          browserName: browserName,
        })
      : intl.formatMessage(
          utilityMessages.rarelyRemovesNetworkCanvasData16bdc,
          { browserName: browserName },
        );
  }
  if (risk === 2) {
    return intl.formatMessage(utilityMessages.mayRemoveNetworkCanvasData, {
      browserName: browserName,
      browserNameValue: browserName,
    });
  }
  // WebKit: the 7-day eviction is its documented behaviour, and the install
  // path depends on the device. This also covers Chrome/Firefox on iOS, where
  // Apple requires WebKit. iPadOS reports 'MacIntel' in desktop mode; real Macs
  // have no touchscreen.
  const isMac =
    navigator.platform.startsWith('Mac') && navigator.maxTouchPoints === 0;
  const usesWebKit = engine === 'webkit' && browserName !== 'Safari';
  return isMac
    ? intl.formatMessage(utilityMessages.after7DaysOfInactivity, {
        browserName,
        usesWebKit: String(usesWebKit),
      })
    : intl.formatMessage(utilityMessages.after7DaysOfInactivity7c6c0, {
        browserName,
        usesWebKit: String(usesWebKit),
      });
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
  const intl = useAppIntl();
  return (
    <StorageRiskBanner
      aria-label={intl.formatMessage(messages.installArchitect)}
      risk={profile.risk}
      installAction={canPromptInstall ? onInstall : undefined}
      onDismiss={onDismiss}
    >
      {bannerMessage(profile, canPromptInstall, intl)}
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
