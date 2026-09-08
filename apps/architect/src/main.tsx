import { Toast } from '@base-ui/react/toast';

import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './analytics';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { applyFreshLoadServiceWorkerUpdate } from '@codaco/fresco-ui/appUpdate/applyFreshLoadServiceWorkerUpdate';
import { registerPwaBuildLease } from '@codaco/fresco-ui/appUpdate/registerPwaBuildLease';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';
import { Toaster } from '@codaco/fresco-ui/Toast';

import AppView from './components/ViewManager/views/App';
import { restoreActiveProtocolAfterStoreRehydration } from './ducks/restoreActiveProtocol';
import { store, storeRehydrated } from './ducks/store';
import { ArchitectI18nRoot } from './i18n/ArchitectI18nRoot';
import { initializeArchitectDocument } from './i18n/documentMetadata';
import { preloadTimelineImages } from './images/timeline';
import { warmBundledTemplateAssets } from './templates/warmBundledAssets';
import { isCriticalOperationInProgress } from './utils/criticalOperation';
import {
  hasPendingLaunchFiles,
  initFileLaunchCapture,
} from './utils/fileLaunchQueue';
import { initInstallPromptCapture } from './utils/installPrompt';
import {
  isRunningAsInstalledPwa,
  requestPersistentStorage,
  requestPersistentStorageOnFirstInteraction,
} from './utils/pwa';

initializeArchitectDocument();

// Register before the startup update check: skipWaiting moves every existing
// tab to the new worker, which must retain the precache for each tab's compiled
// bundle until that tab closes or reloads.
registerPwaBuildLease(__PWA_BUILD_ID__);

// Capture the PWA install prompt before React mounts — the event fires early and
// is one-shot.
initInstallPromptCapture();

// OS-launched .netcanvas files (installed-PWA file handler, Chromium desktop):
// capture before React mounts so early launches are queued until App consumes
// them inside the fresco dialog provider.
initFileLaunchCapture();

// During idle time, fetch stage thumbnails so they are already cached when the
// timeline or stage editor first renders. When running as an installed PWA, also
// warm the service-worker cache with the bundled template/Sample assets so those
// protocols can be installed offline. (A browser tab registers no service worker,
// so the warm is skipped there.)
const warmCaches = () => {
  preloadTimelineImages();
  if (isRunningAsInstalledPwa()) {
    void warmBundledTemplateAssets();
  }
};

async function startApp(): Promise<void> {
  await applyFreshLoadServiceWorkerUpdate({
    reload: false,
    shouldSkip: () =>
      isCriticalOperationInProgress() || hasPendingLaunchFiles(),
  });

  // redux-remember restores only the active library id. Load its canonical
  // protocol body from IndexedDB before mounting any direct /protocol route.
  const rehydrationResult = await storeRehydrated;
  await restoreActiveProtocolAfterStoreRehydration(store, rehydrationResult);

  // Protocols live in IndexedDB even in a browser tab, so request the durability
  // upgrade there as well as in installed sessions. Do not request at startup:
  // Firefox may show a permission prompt, while WebKit and Chromium judge silent
  // grants using interaction/engagement signals. The first gesture is a better
  // time for both behaviours.
  requestPersistentStorageOnFirstInteraction();

  // Installation can newly qualify this origin for a silent grant, so retry
  // when the install completes rather than leaving storage evictable.
  window.addEventListener(
    'appinstalled',
    () => void requestPersistentStorage(),
  );

  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root container #root not found');
  }

  createRoot(root).render(
    <ArchitectI18nRoot>
      <AnimationProvider
        disableAnimations={import.meta.env.VITE_DISABLE_ANIMATIONS === 'true'}
      >
        <Provider store={store}>
          {/* PortalContainerProvider outermost so fresco-ui overlays portal into
            its viewport layer; the `root` (isolation: isolate) wrapper keeps the
            app's own stacking contexts from competing with that layer. */}
          <PortalContainerProvider>
            {/* Transient, non-blocking notices (currently: a library protocol
                brought up to date as it opened). Inside PortalContainerProvider
                so the viewport lands in the same overlay layer as dialogs, and
                outside DialogProvider so a toast is never unmounted with the
                dialog that happened to be open. */}
            <Toast.Provider>
              <DialogProvider>
                <div className="root h-full">
                  <AppView />
                </div>
              </DialogProvider>
              <Toaster />
            </Toast.Provider>
          </PortalContainerProvider>
        </Provider>
      </AnimationProvider>
    </ArchitectI18nRoot>,
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
