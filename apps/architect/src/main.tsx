import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './analytics';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { applyFreshLoadServiceWorkerUpdate } from '@codaco/fresco-ui/appUpdate/applyFreshLoadServiceWorkerUpdate';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';

import { AppErrorBoundary } from './components/Errors';
import AppView from './components/ViewManager/views/App';
import { openLocalNetcanvas } from './ducks/modules/userActions/userActions';
import { store } from './ducks/store';
import { preloadTimelineImages } from './images/timeline';
import { warmBundledTemplateAssets } from './templates/warmBundledAssets';
import { isCriticalOperationInProgress } from './utils/criticalOperation';
import {
  hasPendingLaunchFiles,
  initFileLaunchCapture,
  subscribeLaunchFiles,
  takeLaunchFiles,
} from './utils/fileLaunchQueue';
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

async function startApp(): Promise<void> {
  if (
    await applyFreshLoadServiceWorkerUpdate({
      shouldSkip: () =>
        isCriticalOperationInProgress() || hasPendingLaunchFiles(),
    })
  ) {
    return;
  }

  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root container #root not found');
  }

  createRoot(root).render(
    <AppErrorBoundary>
      <Provider store={store}>
        {/* PortalContainerProvider outermost so fresco-ui overlays portal into
          its viewport layer; the `root` (isolation: isolate) wrapper keeps the
          app's own stacking contexts from competing with that layer. */}
        <PortalContainerProvider>
          <DialogProvider>
            <div className="root h-full">
              <AppView />
            </div>
          </DialogProvider>
        </PortalContainerProvider>
      </Provider>
    </AppErrorBoundary>,
  );

  // Matches the boot loader's opacity transition in index.html (400ms), plus a
  // buffer for the removal fallback below.
  const BOOT_LOADER_FADE_MS = 400;

  // Fade out and remove the inline boot loader (defined in index.html) once
  // React has committed its first frame. Two nested rAFs wait for the paint that
  // follows the initial commit so the fade begins over real app content, not a
  // blank root.
  const dismissBootLoader = () => {
    const loader = document.getElementById('boot-loader');
    // Idempotent: it's scheduled from both a rAF (paint-aligned) and a timer
    // backstop below, so bail if it's already gone or already fading.
    if (!loader || loader.classList.contains('boot-loader--hidden')) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (prefersReducedMotion) {
      loader.remove();
      return;
    }

    // Remove on transitionend for a tight hand-off, but also on a timeout so
    // the loader can never linger if the transition is interrupted or never
    // fires (e.g. the tab is backgrounded during the fade, which suspends
    // transitions).
    const remove = () => loader.remove();
    loader.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, BOOT_LOADER_FADE_MS + 100);
    loader.classList.add('boot-loader--hidden');
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(dismissBootLoader);
  });

  // rAF is suspended while a tab is backgrounded, so a tab opened in the
  // background would keep the loader until it's focused. React has already
  // committed by this point, so also dismiss on a timer backstop (idempotent)
  // that still fires when the tab is hidden.
  setTimeout(dismissBootLoader, BOOT_LOADER_FADE_MS + 100);

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmCaches);
  } else {
    setTimeout(warmCaches, 1000);
  }
}

void startApp();
