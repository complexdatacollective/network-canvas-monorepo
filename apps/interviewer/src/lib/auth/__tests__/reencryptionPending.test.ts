import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isReencryptionPending,
  setReencryptionPending,
} from '../reencryptionPending';

const KEY = 'interviewer:reencryption-pending';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(KEY);
});

describe('reencryptionPending — localStorage-backed retry signal', () => {
  it('round-trips through localStorage, independent of the sweep’s IndexedDB', () => {
    expect(isReencryptionPending()).toBe(false);

    setReencryptionPending(true);
    // The signal lives in localStorage precisely so an IndexedDB failure can't
    // swallow it.
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(isReencryptionPending()).toBe(true);

    setReencryptionPending(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(isReencryptionPending()).toBe(false);
  });

  it('reads false rather than throwing when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(isReencryptionPending()).toBe(false);
  });

  it('surfaces a write failure via console.error without throwing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => setReencryptionPending(true)).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});
