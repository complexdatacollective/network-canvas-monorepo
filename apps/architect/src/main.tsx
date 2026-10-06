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

import BootLoaderHandoff from './components/BootLoaderHandoff';
import AppView from './components/ViewManager/views/App';
import { restoreActiveProtocolAfterStoreRehydration } from './ducks/restoreActiveProtocol';
import { store, storeRehydrated } from './ducks/store';
import { ArchitectI18nRoot } from './i18n/ArchitectI18nRoot';
import { initializeArchitectDocument } from './i18n/documentMetadata';
import { loadStartupLocale } from './i18n/imperative';
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

// The researcher's language is its own chunk. Fetch it now, alongside the
// service-worker and storage awaits in startApp, rather than after them; the
// boot screen stays in the English index.html ships with until it lands. A
// failed load leaves startup in English instead of stopping it: the provider
// tries again, and a second failure reaches its error boundary.
const startupLocaleReady = loadStartupLocale()
  .catch(() => undefined)
  .then(() => initializeArchitectDocument());

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
  // Restoration reports a refused protocol through getArchitectIntl, and the
  // first render reads the same catalog, so both wait for the language.
  await startupLocaleReady;
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
    <>
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
      </ArchitectI18nRoot>
      <BootLoaderHandoff />
    </>,
  );

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmCaches);
  } else {
    setTimeout(warmCaches, 1000);
  }
}

void startApp();
