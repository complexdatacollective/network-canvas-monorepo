import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRunningAsInstalledPwa } from '../pwa';

const stubMatchMedia = (matchingModes: string[]) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matchingModes.some((mode) => query.includes(mode)),
  }));
};

const setNavigatorStandalone = (value: boolean | undefined) => {
  Object.defineProperty(window.navigator, 'standalone', {
    configurable: true,
    value,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, 'standalone');
});

describe('isRunningAsInstalledPwa', () => {
  it('is false in a normal browser tab', () => {
    stubMatchMedia([]);
    expect(isRunningAsInstalledPwa()).toBe(false);
  });

  it('is true when launched in standalone display mode', () => {
    stubMatchMedia(['standalone']);
    expect(isRunningAsInstalledPwa()).toBe(true);
  });

  it('is true in other installed display modes', () => {
    stubMatchMedia(['window-controls-overlay']);
    expect(isRunningAsInstalledPwa()).toBe(true);
  });

  it('is false in browser fullscreen and minimal-ui (not installed modes)', () => {
    // A normal tab matches `(display-mode: fullscreen)` via the Fullscreen API
    // (e.g. fullscreening a <video>); it must not be treated as installed.
    stubMatchMedia(['fullscreen', 'minimal-ui']);
    expect(isRunningAsInstalledPwa()).toBe(false);
  });

  it('is true for an iOS home-screen app (navigator.standalone)', () => {
    stubMatchMedia([]);
    setNavigatorStandalone(true);
    expect(isRunningAsInstalledPwa()).toBe(true);
  });

  it('is false when matchMedia is unavailable and not an iOS app', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(isRunningAsInstalledPwa()).toBe(false);
  });
});
