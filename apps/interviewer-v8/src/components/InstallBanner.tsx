import { Download } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
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

// Shown on the dashboard whenever the app is running in a browser tab rather
// than as an installed app. This is a data-safety warning, not a convenience
// nudge: browsers can evict a website's stored data (Safari deletes it after
// about 7 days without use), while installed apps are exempt — so researchers
// must install before collecting interviews. Dismissal lasts one session; the
// risk persists, so the banner returns on the next launch.
export function InstallBanner() {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
  );
  const [dismissed, setDismissed] = useState(readSessionDismissed);
  // Static per page load: installing mid-session still requires launching the
  // installed app, so the banner staying up in the old tab is accurate.
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

  return (
    <div className="px-11 pt-6">
      <Alert variant="warning" className="relative">
        <AlertTitle>Install Interviewer before collecting data</AlertTitle>
        <AlertDescription>
          <Paragraph margin="none">
            In a browser tab, stored interviews can be deleted by the browser —
            Safari removes a website's data after about 7 days without use.
            Installing Interviewer as an app keeps interview data safe on this
            device.
          </Paragraph>
          {deferredPrompt ? (
            <Button
              color="primary"
              size="sm"
              className="mt-3"
              icon={<Download />}
              onClick={() => void promptInstall()}
            >
              Install Interviewer
            </Button>
          ) : (
            <Paragraph margin="none" className="mt-3">
              To install: in Safari, open the Share menu and choose Add to Dock
              (Mac) or Add to Home Screen (iPad). In Chrome or Edge, use the
              install icon in the address bar.
            </Paragraph>
          )}
        </AlertDescription>
        <CloseButton
          size="sm"
          className="absolute top-3 right-3"
          onClick={dismiss}
        />
      </Alert>
    </div>
  );
}
