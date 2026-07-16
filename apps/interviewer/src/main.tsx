import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { applyFreshLoadServiceWorkerUpdate } from '@codaco/fresco-ui/appUpdate/applyFreshLoadServiceWorkerUpdate';

import App from './App';
import {
  hasPendingLaunchFiles,
  initFileLaunchCapture,
} from './lib/pwa/fileLaunchQueue';
import { initInstallPromptCapture } from './lib/pwa/installPrompt';
import { removeLoadingScreen } from './lib/pwa/loadingScreen';
import { initSwipeNavigationGuard } from './lib/pwa/swipeNavigationGuard';
import { initVisualViewportSizing } from './lib/pwa/visualViewportSizing';
import {
  requestPersistentStorage,
  requestPersistentStorageOnFirstInteraction,
} from './lib/storage';

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
  if (
    await applyFreshLoadServiceWorkerUpdate({
      shouldSkip: () =>
        window.location.pathname.startsWith('/interview/') ||
        hasPendingLaunchFiles(),
    })
  ) {
    return;
  }

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
    </StrictMode>,
  );

  // Hand off from the static first-paint loader (index.html's #app-loading) to
  // React. Deferred to after the first commit paints so there's no flash of
  // blank between the loader disappearing and React's own content (AuthGate's
  // Spinner, then App's fade-in) painting — the loader cross-fades into the app.
  requestAnimationFrame(() => {
    requestAnimationFrame(removeLoadingScreen);
  });
}

void startApp();
