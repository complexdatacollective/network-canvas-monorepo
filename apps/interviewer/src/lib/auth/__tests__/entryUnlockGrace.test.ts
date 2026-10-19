import { afterEach, describe, expect, it, vi } from 'vitest';

const HASH = 'q2Vb3n0p9X_cE-1lK4mZ8sT6yU7wA5dF0gH2jR3tY9o';
const UNLOCKED_AT = 1_000_000;

// The grace reads how this page was opened as its modules load, so each case
// loads them fresh, under a build's BASE_URL, at the URL the page opened on.
const openPage = async (baseUrl: string, path: string) => {
  vi.stubEnv('BASE_URL', baseUrl);
  window.history.replaceState(null, '', path);
  vi.resetModules();
  return import('../entryUnlockGrace');
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
});

describe('the unlock-to-enter grace in a /v8/ build', () => {
  it('follows an unlock on a page opened for an interview, for one minute', async () => {
    const grace = await openPage('/v8/', '/v8/interview/s1');

    expect(grace.hasEntryUnlockGrace(UNLOCKED_AT)).toBe(false);
    grace.noteLockScreenUnlock(UNLOCKED_AT);

    expect(grace.hasEntryUnlockGrace(UNLOCKED_AT)).toBe(true);
    expect(
      grace.hasEntryUnlockGrace(UNLOCKED_AT + grace.ENTRY_UNLOCK_GRACE_MS),
    ).toBe(true);
    expect(
      grace.hasEntryUnlockGrace(UNLOCKED_AT + grace.ENTRY_UNLOCK_GRACE_MS + 1),
    ).toBe(false);
    // A clock that went backwards grants nothing.
    expect(grace.hasEntryUnlockGrace(UNLOCKED_AT - 1)).toBe(false);
  });

  it('follows an unlock on a page opened by ?start=', async () => {
    const grace = await openPage('/v8/', `/v8/?start=${HASH}`);

    grace.noteLockScreenUnlock(UNLOCKED_AT);

    expect(grace.hasEntryUnlockGrace(UNLOCKED_AT + 1_000)).toBe(true);
  });

  it('is not granted on a page opened any other way', async () => {
    for (const path of ['/v8/', '/v8/data', `/v8/?start=..%2F`]) {
      const grace = await openPage('/v8/', path);
      grace.noteLockScreenUnlock(UNLOCKED_AT);

      expect(grace.hasEntryUnlockGrace(UNLOCKED_AT + 1_000)).toBe(false);
    }
  });
});

describe('the unlock-to-enter grace in the root build', () => {
  it('is never granted, however the page was opened', async () => {
    for (const path of ['/interview/s1', `/?start=${HASH}`]) {
      const grace = await openPage('/', path);
      grace.noteLockScreenUnlock(UNLOCKED_AT);

      expect(grace.hasEntryUnlockGrace(UNLOCKED_AT + 1_000)).toBe(false);
    }
  });
});
