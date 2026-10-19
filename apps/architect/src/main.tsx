import { Toast } from '@base-ui/react/toast';

import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
// Strips a protocol id or hand-off key from the URL on evaluation. ./analytics
// imports it too, which is what keeps it ahead of `posthog.init` in a bundle;
// listing it first here keeps the same order in development.
import './utils/urlLaunchRequest';
import './analytics';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { applyFreshLoadServiceWorkerUpdate } from '@codaco/fresco-ui/appUpdate/applyFreshLoadServiceWorkerUpdate';
import { registerPwaBuildLease } from '@codaco/fresco-ui/appUpdate/registerPwaBuildLease';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import LocaleLoadFailureToast from '@codaco/fresco-ui/LocaleLoadFailureToast';
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
import { bundledProtocols } from './templates/bundled-protocols';
import { IS_SUBPATH_BUILD } from './utils/appBase';
import {
  forwardLaunchFilesToArchitect9,
  stageHandoffImport,
} from './utils/architect9Handoff';
import { isCriticalOperationInProgress } from './utils/criticalOperation';
import {
  hasPendingLaunchFiles,
  initFileLaunchCapture,
} from './utils/fileLaunchQueue';
import { pruneStaleHandoffs } from './utils/handoffStore';
import { initInstallPromptCapture } from './utils/installPrompt';
import {
  getAppServiceWorkerContainer,
  isRunningAsInstalledPwa,
  requestPersistentStorage,
  requestPersistentStorageOnFirstInteraction,
} from './utils/pwa';
import { reportError } from './utils/reportError';
import { takeUrlImportRequest } from './utils/urlLaunchRequest';

// The researcher's language is its own chunk. Fetch it now, alongside the
// service-worker and storage awaits in startApp, rather than after them; the
// boot screen stays in the English index.html ships with until it lands. A
// failed load leaves startup in English instead of stopping it: the provider
// tries again, and if that fails too Architect runs in English and a notice
// says so.
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
//
// Architect 8 served inside Architect 9 declares no file handler, but a launch
// can still reach one of its windows; Architect 9 owns .netcanvas launches, so
// the file is handed on to it.
initFileLaunchCapture(
  IS_SUBPATH_BUILD ? { routeFiles: forwardLaunchFilesToArchitect9 } : {},
);

// A file Architect 9 staged for this app (`?import=`) opens through the same
// queue, so it gets Open file's flow and holds the startup update check while
// it is read.
const handoffImportKey = takeUrlImportRequest();
if (handoffImportKey) stageHandoffImport(handoffImportKey);

// Hand-off records are consumed at once; anything older than an hour was
// abandoned (a closed tab, a failed navigation) and only takes up space.
void pruneStaleHandoffs().catch((error: unknown) => {
  reportError(error, { operation: 'handoffPrune' });
});

// During idle time, fetch stage thumbnails so they are already cached when the
// timeline or stage editor first renders. When running as an installed PWA, also
// warm the service-worker cache with the bundled template/Sample assets so those
// protocols can be installed offline. (A browser tab registers no service worker,
// so the warm is skipped there, and a sub-path build bundles none to warm.)
const warmCaches = () => {
  preloadTimelineImages();
  if (isRunningAsInstalledPwa()) {
    void bundledProtocols?.warmAssets();
  }
};

async function startApp(): Promise<void> {
  await applyFreshLoadServiceWorkerUpdate({
    reload: false,
    serviceWorker: getAppServiceWorkerContainer(),
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
                <LocaleLoadFailureToast
                  onReload={() => window.location.reload()}
                  onFailure={(error, locale) =>
                    reportError(error, { operation: 'locale-load', locale })
                  }
                />
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
