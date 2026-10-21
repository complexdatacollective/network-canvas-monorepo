import { afterEach, describe, expect, it, vi } from 'vitest';

const UNLOCKED_AT = 1_000_000;
const SOON = UNLOCKED_AT + 1_000;

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
  it('follows an unlock on a page opened to resume an interview, for one minute', async () => {
    const grace = await openPage('/v8/', '/v8/interview/s1');
    expect(grace.takeEntryUnlockGrace('s1', UNLOCKED_AT)).toBe(false);

    // Each check uses the grace up, so each one gets a page of its own.
    const takenAt = async (now: number) => {
      const page = await openPage('/v8/', '/v8/interview/s1');
      page.noteLockScreenUnlock(UNLOCKED_AT);
      return page.takeEntryUnlockGrace('s1', now);
    };
    expect(await takenAt(UNLOCKED_AT)).toBe(true);
    expect(await takenAt(UNLOCKED_AT + grace.ENTRY_UNLOCK_GRACE_MS)).toBe(true);
    expect(await takenAt(UNLOCKED_AT + grace.ENTRY_UNLOCK_GRACE_MS + 1)).toBe(
      false,
    );
    // A clock that went backwards grants nothing.
    expect(await takenAt(UNLOCKED_AT - 1)).toBe(false);
  });

  it('follows an unlock on a page opened to review an interview', async () => {
    const grace = await openPage('/v8/', '/v8/interview/s1?mode=review');

    grace.noteLockScreenUnlock(UNLOCKED_AT);

    expect(grace.takeEntryUnlockGrace('s1', SOON)).toBe(true);
  });

  it('stands in once: a second entry within the minute asks again', async () => {
    const resumed = await openPage('/v8/', '/v8/interview/s1');
    resumed.noteLockScreenUnlock(UNLOCKED_AT);
    expect(resumed.takeEntryUnlockGrace('s1', SOON)).toBe(true);
    expect(resumed.takeEntryUnlockGrace('s1', SOON)).toBe(false);
    // A later lock-screen unlock on the same page does not grant it again.
    resumed.noteLockScreenUnlock(SOON);
    expect(resumed.takeEntryUnlockGrace('s1', SOON)).toBe(false);
  });

  it('never stands in for another interview, nor spends itself on one', async () => {
    const resumed = await openPage('/v8/', '/v8/interview/s1');
    resumed.noteLockScreenUnlock(UNLOCKED_AT);
    expect(resumed.takeEntryUnlockGrace('s2', SOON)).toBe(false);
    // The interview it was opened for still has it.
    expect(resumed.takeEntryUnlockGrace('s1', SOON)).toBe(true);
  });

  it('ends when the interview is left', async () => {
    const grace = await openPage('/v8/', '/v8/interview/s1');
    grace.noteLockScreenUnlock(UNLOCKED_AT);

    grace.endEntryUnlockGrace();

    expect(grace.takeEntryUnlockGrace('s1', SOON)).toBe(false);
  });

  it('is not granted on a page opened any other way', async () => {
    for (const path of ['/v8/', '/v8/data', '/v8/welcome']) {
      const grace = await openPage('/v8/', path);
      grace.noteLockScreenUnlock(UNLOCKED_AT);

      expect(grace.takeEntryUnlockGrace('s1', SOON)).toBe(false);
    }
  });
});

describe('Interviewer 9 saying the enter step is satisfied', () => {
  it('stands in for it once, for the interview the page was framed for', async () => {
    const framed = await openPage('/v8/', '/v8/interview/s1?mode=review');
    framed.noteInterviewer9EntryAuthorization(UNLOCKED_AT);

    expect(framed.takeEntryUnlockGrace('s2', SOON)).toBe(false);
    expect(framed.takeEntryUnlockGrace('s1', SOON)).toBe(true);
    expect(framed.takeEntryUnlockGrace('s1', SOON)).toBe(false);
  });

  it('is given up when the interview is left', async () => {
    const framed = await openPage('/v8/', '/v8/interview/s1');
    framed.noteInterviewer9EntryAuthorization(UNLOCKED_AT);

    framed.endEntryUnlockGrace();

    expect(framed.takeEntryUnlockGrace('s1', SOON)).toBe(false);
  });

  it('grants nothing in the root build', async () => {
    const page = await openPage('/', '/interview/s1');
    page.noteInterviewer9EntryAuthorization(UNLOCKED_AT);
    expect(page.takeEntryUnlockGrace('s1', SOON)).toBe(false);
  });
});

describe('the unlock-to-enter grace in the root build', () => {
  it('is never granted, however the page was opened', async () => {
    const resumed = await openPage('/', '/interview/s1');
    resumed.noteLockScreenUnlock(UNLOCKED_AT);
    expect(resumed.takeEntryUnlockGrace('s1', SOON)).toBe(false);
  });
});
