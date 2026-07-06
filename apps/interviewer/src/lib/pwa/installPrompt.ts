// Captures the browser's PWA install prompt (Chrome/Edge/Android fire
// `beforeinstallprompt`; Safari/Firefox never do) and exposes it as a small
// external store so the install nudge can offer a real one-tap install.

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let initialized = false;

const notify = () => {
  for (const listener of listeners) listener();
};

// Register the capture listeners. Must run at startup (the event fires early and
// is one-shot), is idempotent, and is a no-op outside a browser.
export const initInstallPromptCapture = (): void => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's default mini-infobar; installation is driven by the nudge.
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
};

export const getDeferredPrompt = (): BeforeInstallPromptEvent | null =>
  deferredPrompt;

export const subscribeInstallPrompt = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Show the native install dialog. The deferred prompt can only be used once, so
// it is cleared immediately (which also hides the nudge).
export const promptInstall = async (): Promise<void> => {
  const prompt = deferredPrompt;
  if (!prompt) return;
  deferredPrompt = null;
  notify();
  await prompt.prompt();
};
