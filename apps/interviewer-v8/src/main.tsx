import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { initInstallPromptCapture } from './lib/pwa/installPrompt';
import { initSwipeNavigationGuard } from './lib/pwa/swipeNavigationGuard';
import { requestPersistentStorage } from './lib/storage';

// The beforeinstallprompt event fires early and is one-shot; capture it before
// React mounts so PwaInstallNudge can offer a real one-tap install.
initInstallPromptCapture();

initSwipeNavigationGuard();

void requestPersistentStorage();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
