// Captures the browser's PWA install prompt (Chrome/Edge/Android fire
// `beforeinstallprompt`; Safari/Firefox never do) and exposes it as a small
// external store so the install nudge can offer a real one-tap install. Also
// tracks whether the app has become installed so the nudge can hide reactively.

import { isRunningAsInstalledPwa } from '~/utils/pwa';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const promptListeners = new Set<() => void>();
const installedListeners = new Set<() => void>();
let initialized = false;

const notify = (listeners: Set<() => void>) => {
  for (const listener of listeners) listener();
};

const setInstalled = (next: boolean) => {
  if (installed === next) return;
  installed = next;
  notify(installedListeners);
};

// Register the capture listeners. Must run at startup (the event fires early and
// is one-shot), is idempotent, and is a no-op outside a browser.
export const initInstallPromptCapture = (): void => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  installed = isRunningAsInstalledPwa();

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's default mini-infobar; installation is driven by the nudge.
    event.preventDefault();
    deferredPrompt = event;
    notify(promptListeners);
  });
  // `appinstalled` fires in the tab that triggered installation even though that
  // tab usually stays a plain tab (the app opens in its own window), so it is
  // the reliable signal that the nudge's job is done.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify(promptListeners);
    setInstalled(true);
  });

  // Defensive: if the tab itself becomes standalone, reflect that too.
  if (typeof window.matchMedia === 'function') {
    window
      .matchMedia('(display-mode: standalone)')
      .addEventListener('change', (event) => {
        if (event.matches) setInstalled(true);
      });
  }
};

export const getDeferredPrompt = (): BeforeInstallPromptEvent | null =>
  deferredPrompt;

export const subscribeInstallPrompt = (listener: () => void): (() => void) => {
  promptListeners.add(listener);
  return () => {
    promptListeners.delete(listener);
  };
};

export const getInstalled = (): boolean => installed;

export const subscribeInstalled = (listener: () => void): (() => void) => {
  installedListeners.add(listener);
  return () => {
    installedListeners.delete(listener);
  };
};

// Show the native install dialog. The deferred prompt can only be used once, so
// it is cleared immediately (which also hides the nudge).
export const promptInstall = async (): Promise<void> => {
  const prompt = deferredPrompt;
  if (!prompt) return;
  deferredPrompt = null;
  notify(promptListeners);
  await prompt.prompt();
};
