// Display modes that mean "running as an installed app". Deliberately excludes
// `fullscreen` and `minimal-ui`: `(display-mode: fullscreen)` also matches when a
// normal tab enters Fullscreen-API fullscreen (e.g. fullscreening a <video>), so
// treating it as "installed" would register the service worker in a plain tab.
const INSTALLED_DISPLAY_MODES = ['standalone', 'window-controls-overlay'];

// True when the app is running as an installed PWA (launched from the home
// screen or its own app window) rather than in a normal browser tab. Offline
// support is enabled only for installed sessions; in a tab the app runs online
// with normal HTTP caching and registers no service worker.
export const isRunningAsInstalledPwa = (): boolean => {
  if (typeof window === 'undefined') return false;

  // iOS Safari home-screen apps predate the `display-mode` media query.
  if (window.navigator.standalone === true) return true;

  if (typeof window.matchMedia !== 'function') return false;

  return INSTALLED_DISPLAY_MODES.some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
};

// Best-effort request for persistent storage so the browser is less likely to
// evict the offline caches (precache + warmed template/Sample media) and the
// IndexedDB protocol library under storage pressure. Installed PWAs are usually
// granted this without a prompt. Returns whether storage is persisted; never
// throws and is a no-op where the Storage API is unavailable (e.g. iOS Safari,
// which already gives installed home-screen apps durable storage).
export const requestPersistentStorage = async (): Promise<boolean> => {
  if (typeof navigator.storage?.persist !== 'function') return false;
  // persisted()/persist() usually resolve to a boolean, but the Storage spec
  // allows them to reject (e.g. opaque origin, storage disabled); catch so a
  // fire-and-forget `void requestPersistentStorage()` can't become an unhandled
  // rejection.
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};

// Request from a user gesture rather than at startup. WebKit and Chromium use
// interaction/engagement heuristics for their silent decision, while Firefox
// can show a permission prompt. Deferring gives every browser the strongest
// useful context and avoids surprising Firefox users during page load.
export const requestPersistentStorageOnFirstInteraction = (): void => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }
  const request = () => {
    window.removeEventListener('pointerdown', request);
    window.removeEventListener('keydown', request);
    void requestPersistentStorage();
  };
  window.addEventListener('pointerdown', request);
  window.addEventListener('keydown', request);
};
