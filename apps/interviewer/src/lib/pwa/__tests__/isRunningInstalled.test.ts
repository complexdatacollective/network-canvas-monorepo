import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRunningInstalled } from '../isRunningInstalled';

function stubEnvironment({
  standalone,
  iosStandalone = false,
}: {
  standalone: boolean;
  iosStandalone?: boolean;
}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
  }));
  // isRunningInstalled only reads navigator.standalone; a minimal stub avoids
  // spreading the navigator class instance.
  vi.stubGlobal('navigator', { standalone: iosStandalone });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isRunningInstalled', () => {
  it('is false in a plain browser tab', () => {
    stubEnvironment({ standalone: false });
    expect(isRunningInstalled()).toBe(false);
  });

  it('is true for a standalone display-mode window (Chromium / Safari dock)', () => {
    stubEnvironment({ standalone: true });
    expect(isRunningInstalled()).toBe(true);
  });

  it('is true for an iOS home-screen app via navigator.standalone', () => {
    stubEnvironment({ standalone: false, iosStandalone: true });
    expect(isRunningInstalled()).toBe(true);
  });
});
