import { afterEach, describe, expect, it, vi } from 'vitest';

import { isPlatformAuthenticatorAvailable } from '../webauthn';

describe('isPlatformAuthenticatorAvailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when PublicKeyCredential is undefined', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(await isPlatformAuthenticatorAvailable()).toBe(false);
  });

  it('returns true when a user-verifying platform authenticator is available', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.resolve(true),
    });
    expect(await isPlatformAuthenticatorAvailable()).toBe(true);
  });

  it('returns false when no platform authenticator is available', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.resolve(false),
    });
    expect(await isPlatformAuthenticatorAvailable()).toBe(false);
  });

  it('returns false when the availability check throws', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.reject(new Error('boom')),
    });
    expect(await isPlatformAuthenticatorAvailable()).toBe(false);
  });
});
