import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasPasskeyWindowLimitation,
  isMacChromium,
} from '../passkeyWindowLimitation';

function stubEnvironment({
  platform,
  chromium,
  standalone,
  touchPoints = 0,
}: {
  platform: string;
  chromium: boolean;
  standalone: boolean;
  touchPoints?: number;
}) {
  vi.stubGlobal('navigator', {
    ...navigator,
    platform,
    maxTouchPoints: touchPoints,
    ...(chromium ? { userAgentData: {} } : {}),
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isMacChromium', () => {
  it('is true for Chromium on a real Mac', () => {
    stubEnvironment({
      platform: 'MacIntel',
      chromium: true,
      standalone: false,
    });
    expect(isMacChromium()).toBe(true);
  });

  it('is false for Safari/Firefox on a Mac (no userAgentData)', () => {
    stubEnvironment({
      platform: 'MacIntel',
      chromium: false,
      standalone: false,
    });
    expect(isMacChromium()).toBe(false);
  });

  it('is false on Windows Chromium', () => {
    stubEnvironment({ platform: 'Win32', chromium: true, standalone: false });
    expect(isMacChromium()).toBe(false);
  });

  it('is false on iPadOS masquerading as MacIntel (touch device)', () => {
    stubEnvironment({
      platform: 'MacIntel',
      chromium: true,
      standalone: false,
      touchPoints: 5,
    });
    expect(isMacChromium()).toBe(false);
  });
});

describe('hasPasskeyWindowLimitation', () => {
  it('fires only in a standalone (installed-PWA) window on macOS Chromium', () => {
    stubEnvironment({ platform: 'MacIntel', chromium: true, standalone: true });
    expect(hasPasskeyWindowLimitation()).toBe(true);
  });

  it('does not fire in a macOS Chromium browser tab', () => {
    stubEnvironment({
      platform: 'MacIntel',
      chromium: true,
      standalone: false,
    });
    expect(hasPasskeyWindowLimitation()).toBe(false);
  });

  it('does not fire in a standalone window on other platforms', () => {
    stubEnvironment({ platform: 'Win32', chromium: true, standalone: true });
    expect(hasPasskeyWindowLimitation()).toBe(false);
  });

  it('does not fire for Safari dock apps on macOS', () => {
    stubEnvironment({
      platform: 'MacIntel',
      chromium: false,
      standalone: true,
    });
    expect(hasPasskeyWindowLimitation()).toBe(false);
  });
});
