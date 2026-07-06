import { afterEach, describe, expect, it, vi } from 'vitest';

// The module registers window listeners on init, so load a fresh copy per test.
const loadModule = async () => {
  vi.resetModules();
  const mod = await import('../installPrompt');
  mod.initInstallPromptCapture();
  return mod;
};

const dispatchBeforeInstallPrompt = () => {
  const event = new Event('beforeinstallprompt');
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(event, 'prompt', { value: prompt });
  window.dispatchEvent(event);
  return prompt;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installPrompt', () => {
  it('starts with no deferred prompt', async () => {
    const mod = await loadModule();
    expect(mod.getDeferredPrompt()).toBeNull();
  });

  it('captures the deferred beforeinstallprompt event and notifies subscribers', async () => {
    const mod = await loadModule();
    const listener = vi.fn();
    mod.subscribeInstallPrompt(listener);

    dispatchBeforeInstallPrompt();

    expect(mod.getDeferredPrompt()).not.toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it('promptInstall fires the native prompt once and clears the stash', async () => {
    const mod = await loadModule();
    const prompt = dispatchBeforeInstallPrompt();

    await mod.promptInstall();

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(mod.getDeferredPrompt()).toBeNull();
  });

  it('clears the stash when the app is installed', async () => {
    const mod = await loadModule();
    dispatchBeforeInstallPrompt();

    window.dispatchEvent(new Event('appinstalled'));

    expect(mod.getDeferredPrompt()).toBeNull();
  });

  it('flips installed and notifies subscribers on appinstalled', async () => {
    const mod = await loadModule();
    const listener = vi.fn();
    mod.subscribeInstalled(listener);

    expect(mod.getInstalled()).toBe(false);

    window.dispatchEvent(new Event('appinstalled'));

    expect(mod.getInstalled()).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it('stops subscribers receiving updates after unsubscribe', async () => {
    const mod = await loadModule();
    const listener = vi.fn();
    const unsubscribe = mod.subscribeInstallPrompt(listener);

    unsubscribe();
    dispatchBeforeInstallPrompt();

    expect(listener).not.toHaveBeenCalled();
  });
});
