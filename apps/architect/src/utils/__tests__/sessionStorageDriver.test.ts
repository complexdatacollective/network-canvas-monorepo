import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSessionStorageDriver } from '../sessionStorageDriver';

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

  it('invokes onStorageError when a setItem write fails and falls back to memory', () => {
    const onStorageError = vi.fn();
    const driver = createSessionStorageDriver(onStorageError);

    const error = new DOMException('quota', 'QuotaExceededError');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw error;
    });

    driver.setItem('key', 'value');

    expect(onStorageError).toHaveBeenCalledTimes(1);
    expect(onStorageError).toHaveBeenCalledWith(error);
  });

  it('invokes onStorageError at most once even across repeated failing writes', () => {
    const onStorageError = vi.fn();
    const driver = createSessionStorageDriver(onStorageError);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    driver.setItem('key', 'value');
    driver.setItem('key', 'value2');

    expect(onStorageError).toHaveBeenCalledTimes(1);
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
