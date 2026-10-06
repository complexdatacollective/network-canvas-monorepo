import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { applyFreshLoadServiceWorkerUpdate } from '@codaco/fresco-ui/appUpdate/applyFreshLoadServiceWorkerUpdate';
import { registerPwaBuildLease } from '@codaco/fresco-ui/appUpdate/registerPwaBuildLease';

import App from './App';
import { startupLocale } from './i18n/preference';
import {
  hasPendingLaunchFiles,
  initFileLaunchCapture,
} from './lib/pwa/fileLaunchQueue';
import { initInstallPromptCapture } from './lib/pwa/installPrompt';
import { announceLoadingScreen } from './lib/pwa/loadingScreen';
import { LoadingScreenHandoff } from './lib/pwa/LoadingScreenHandoff';
import { initSwipeNavigationGuard } from './lib/pwa/swipeNavigationGuard';
import { initVisualViewportSizing } from './lib/pwa/visualViewportSizing';
import {
  requestPersistentStorage,
  requestPersistentStorageOnFirstInteraction,
} from './lib/storage';
import { interviewerCatalogSource } from './locales/catalogs';

announceLoadingScreen();

// Register before the startup update check so every active interview leases
// the precache matching the bundle it is actually running.
registerPwaBuildLease(__PWA_BUILD_ID__);

// The beforeinstallprompt event fires early and is one-shot; capture it before
// React mounts so PwaInstallNudge can offer a real one-tap install.
initInstallPromptCapture();

initSwipeNavigationGuard();

// Safari keeps the layout viewport behind its browser chrome and software
// keyboard. Align the full-screen app root to VisualViewport before React
// mounts so critical interview content is never laid out in the hidden region.
const disposeVisualViewportSizing = initVisualViewportSizing();
if (import.meta.hot) {
  import.meta.hot.dispose(disposeVisualViewportSizing);
}

// OS-launched .netcanvas files (installed-PWA file handler) can arrive before
// React mounts; capture them for Home to import after unlock.
initFileLaunchCapture();

async function startApp(): Promise<void> {
  await Promise.all([
    applyFreshLoadServiceWorkerUpdate({
      reload: false,
      shouldSkip: () =>
        window.location.pathname.startsWith('/interview/') ||
        hasPendingLaunchFiles(),
    }),
    // Load the startup language before the first render, alongside the update
    // check rather than after it, so a non-English device never paints English
    // first. A failure here must not stop the app mounting: the provider meets
    // the same failure, and its error boundary recovers in English.
    interviewerCatalogSource.load(startupLocale()).catch(() => undefined),
  ]);

  // Do not request at startup: Firefox may show a permission prompt, while
  // WebKit and Chromium judge silent grants using interaction/engagement
  // signals. The first gesture is a better time for both behaviours.
  requestPersistentStorageOnFirstInteraction();

  // Installing the PWA newly qualifies the origin for persistent storage, but
  // the box is only made non-evictable on an actual persist() call — request it
  // again when the install completes rather than leaving storage evictable.
  window.addEventListener(
    'appinstalled',
    () => void requestPersistentStorage(),
  );

  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root container #root not found');
  }

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
      <LoadingScreenHandoff />
    </StrictMode>,
  );
}

void startApp();
