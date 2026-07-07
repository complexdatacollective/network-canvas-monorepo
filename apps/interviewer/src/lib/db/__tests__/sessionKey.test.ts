import { afterEach, describe, expect, it } from 'vitest';

import { getSessionDek, setSessionDek } from '../sessionKey';

async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

describe('sessionKey', () => {
  afterEach(() => {
    setSessionDek(null);
  });

  it('returns null before any key is set', () => {
    expect(getSessionDek()).toBeNull();
  });

  it('returns the key that was set', async () => {
    const key = await makeKey();
    setSessionDek(key);
    expect(getSessionDek()).toBe(key);
  });

  it('clears the key when set to null', async () => {
    setSessionDek(await makeKey());
    setSessionDek(null);
    expect(getSessionDek()).toBeNull();
  });
});
