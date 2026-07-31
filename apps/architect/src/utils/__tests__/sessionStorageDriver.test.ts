import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearRememberedAppSession,
  createSessionStorageDriver,
} from '../sessionStorageDriver';

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('sessionStorageDriver', () => {
  it('round-trips values through sessionStorage', () => {
    const driver = createSessionStorageDriver();

    driver.setItem('@@remember-app', '{"activeProtocolId":"abc"}');

    expect(window.sessionStorage.getItem('@@remember-app')).toBe(
      '{"activeProtocolId":"abc"}',
    );
    expect(driver.getItem('@@remember-app')).toBe('{"activeProtocolId":"abc"}');
  });

  it('returns null for a missing key', () => {
    const driver = createSessionStorageDriver();
    expect(driver.getItem('missing')).toBeNull();
  });

  it('clears the remembered app session after startup recovery', () => {
    window.sessionStorage.setItem(
      '@@remember-app',
      '{"activeProtocolId":"stale"}',
    );

    clearRememberedAppSession();

    expect(window.sessionStorage.getItem('@@remember-app')).toBeNull();
  });

  it('falls back to an in-memory store when sessionStorage.setItem throws', () => {
    const driver = createSessionStorageDriver();

    // Simulate a browser that exposes sessionStorage but rejects writes
    // (e.g. Safari private browsing, disabled storage).
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });

    driver.setItem('key', 'value');
    // The write did not reach sessionStorage...
    expect(setItemSpy).toHaveBeenCalled();

    // ...but the value is still readable from the in-memory fallback.
    setItemSpy.mockRestore();
    expect(driver.getItem('key')).toBe('value');
  });

  it('keeps canonical persistence concerns separate from session fallback', () => {
    const driver = createSessionStorageDriver();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    driver.setItem('key', 'value');
    driver.setItem('key', 'value2');

    expect(driver.getItem('key')).toBe('value2');
  });

  it('keeps two driver instances independent (models two tabs)', () => {
    // Each tab has its own sessionStorage; the in-memory fallback must also be
    // per-instance so a storage-unavailable tab never leaks into another.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);

    const tabA = createSessionStorageDriver();
    const tabB = createSessionStorageDriver();

    tabA.setItem('@@remember-app', 'A');
    tabB.setItem('@@remember-app', 'B');

    expect(tabA.getItem('@@remember-app')).toBe('A');
    expect(tabB.getItem('@@remember-app')).toBe('B');
  });
});
