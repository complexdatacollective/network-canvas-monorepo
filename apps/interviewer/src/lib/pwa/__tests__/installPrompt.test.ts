import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getDeferredPrompt,
  initInstallPromptCapture,
  promptInstall,
  subscribeInstallPrompt,
} from '../installPrompt';

type FakePrompt = BeforeInstallPromptEvent & {
  preventDefault: () => void;
  prompt: ReturnType<typeof vi.fn>;
};

const makePrompt = (): FakePrompt =>
  Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve<{
      readonly outcome: 'accepted' | 'dismissed';
      readonly platform: string;
    }>({ outcome: 'accepted', platform: 'web' }),
    platforms: [],
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installPrompt', () => {
  it('captures and exposes a fired beforeinstallprompt event', () => {
    initInstallPromptCapture();
    const evt = makePrompt();
    const preventDefault = vi.spyOn(evt, 'preventDefault');

    window.dispatchEvent(evt);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(getDeferredPrompt()).toBe(evt);
  });

  it('notifies subscribers when a prompt is captured', () => {
    initInstallPromptCapture();
    const listener = vi.fn();
    const unsubscribe = subscribeInstallPrompt(listener);

    window.dispatchEvent(makePrompt());
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    window.dispatchEvent(makePrompt());
    expect(listener).not.toHaveBeenCalled();
  });

  it('clears the prompt on appinstalled', () => {
    initInstallPromptCapture();
    window.dispatchEvent(makePrompt());
    expect(getDeferredPrompt()).not.toBeNull();

    window.dispatchEvent(new Event('appinstalled'));
    expect(getDeferredPrompt()).toBeNull();
  });

  it('prompts once then clears (single-shot)', async () => {
    initInstallPromptCapture();
    const evt = makePrompt();
    window.dispatchEvent(evt);

    await promptInstall();

    expect(evt.prompt).toHaveBeenCalledTimes(1);
    expect(getDeferredPrompt()).toBeNull();
  });
});
