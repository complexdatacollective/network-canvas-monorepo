import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { initFileLaunchCapture } from './lib/pwa/fileLaunchQueue';
import { initInstallPromptCapture } from './lib/pwa/installPrompt';
import { removeLoadingScreen } from './lib/pwa/loadingScreen';
import { initSwipeNavigationGuard } from './lib/pwa/swipeNavigationGuard';
import { requestPersistentStorage } from './lib/storage';

// The beforeinstallprompt event fires early and is one-shot; capture it before
// React mounts so PwaInstallNudge can offer a real one-tap install.
initInstallPromptCapture();

initSwipeNavigationGuard();

// OS-launched .netcanvas files (installed-PWA file handler) can arrive before
// React mounts; capture them for Home to import after unlock.
initFileLaunchCapture();

void requestPersistentStorage();

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
// React. Deferred to after the first commit paints so there's no flash of blank
// between the loader disappearing and React's own content (AuthGate's Spinner,
// then App's fade-in) painting — the loader cross-fades into the app.
requestAnimationFrame(() => {
  requestAnimationFrame(removeLoadingScreen);
});
