import './analytics';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { AppErrorBoundary } from './components/Errors';
import AppView from './components/ViewManager/views/App';
import { store } from './ducks/store';
import { preloadTimelineImages } from './images/timeline';
import { warmBundledTemplateAssets } from './templates/warmBundledAssets';
import { openLocalNetcanvas } from './ducks/modules/userActions/userActions';
import { initFileLaunchCapture, subscribeLaunchFiles, takeLaunchFiles } from './utils/fileLaunchQueue';
import { initInstallPromptCapture } from './utils/installPrompt';
import { isRunningAsInstalledPwa, requestPersistentStorage } from './utils/pwa';

// Capture the PWA install prompt before React mounts — the event fires early and
// is one-shot.
initInstallPromptCapture();

// OS-launched .netcanvas files (installed-PWA file handler, Chromium desktop):
// Architect opens the file for editing through the same thunk as Home's
// drag-and-drop. Only the first file of a launch batch opens — the editor
// holds a single active protocol.
initFileLaunchCapture();
subscribeLaunchFiles(() => {
  const [first] = takeLaunchFiles();
  if (first) void store.dispatch(openLocalNetcanvas(first));
});

const root = document.getElementById('root') as Element;

createRoot(root).render(
  <AppErrorBoundary>
    <Provider store={store}>
      <AppView />
    </Provider>
  </AppErrorBoundary>,
);

// During idle time, fetch stage thumbnails so they are already cached when the
// timeline or stage editor first renders. When running as an installed PWA, also
// warm the service-worker cache with the bundled template/Sample assets so those
// protocols can be installed offline. (A browser tab registers no service worker,
// so the warm is skipped there.)
const warmCaches = () => {
  preloadTimelineImages();
  if (isRunningAsInstalledPwa()) {
    void requestPersistentStorage();
    void warmBundledTemplateAssets();
  }
};

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(warmCaches);
} else {
  setTimeout(warmCaches, 1000);
}
