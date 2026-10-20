import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Interviewer9Unlock } from '~/lib/interviewer9Embed';

// Interviewer 8 framed by Interviewer 9 takes the key Interviewer 9 hands over
// as its session key, the state an unlock at its own lock screen leaves, so
// no lock screen shows for it; and Interviewer 9's word that the enter step is
// satisfied stands in for that step.

type Status = { configured: boolean; mode?: string; corrupt?: boolean };

const mocks = vi.hoisted(() => ({
  reply: null as Interviewer9Unlock | null,
  status: { configured: true, mode: 'pin' } as Status,
  noteEntry: vi.fn(),
  closed: false,
}));

vi.mock('~/lib/interviewer9Embed', () => ({
  interviewer9Unlock: async () => mocks.reply,
  isEmbedClosed: () => mocks.closed,
}));
vi.mock('../entryUnlockGrace', () => ({
  noteInterviewer9EntryAuthorization: () => mocks.noteEntry(),
}));
vi.mock('../../vault/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../vault/vault')>()),
  vaultStatus: () => mocks.status,
}));

// The adoption runs once per page load, so each case loads a fresh page.
const loadPage = async () => {
  vi.resetModules();
  const [api, sessionKey] = await Promise.all([
    import('../api'),
    import('../../db/sessionKey'),
  ]);
  sessionKey.setSessionDek(null);
  return { api, sessionKey };
};

const dataKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

beforeEach(() => {
  vi.stubEnv('BASE_URL', '/v8/');
  mocks.reply = null;
  mocks.status = { configured: true, mode: 'pin' };
  mocks.closed = false;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('adoptInterviewer9Unlock', () => {
  it.each(['pin', 'passphrase', 'biometric'])(
    'holds the handed-over key, so a %s lock reads as unlocked',
    async (mode) => {
      mocks.status = { configured: true, mode };
      const key = await dataKey();
      mocks.reply = { key, enterAuthorized: false };
      const { api, sessionKey } = await loadPage();
      expect(await api.status()).toMatchObject({ locked: true });

      await api.adoptInterviewer9Unlock();

      expect(sessionKey.getSessionDek()).toBe(key);
      expect(await api.status()).toEqual({
        configured: true,
        locked: false,
        mode,
      });
      expect(mocks.noteEntry).not.toHaveBeenCalled();
    },
  );

  it('notes the enter step as satisfied when Interviewer 9 says so', async () => {
    mocks.reply = { key: await dataKey(), enterAuthorized: true };
    const { api } = await loadPage();

    await api.adoptInterviewer9Unlock();

    expect(mocks.noteEntry).toHaveBeenCalledTimes(1);
  });

  it('takes nothing once the embedded interview has closed', async () => {
    mocks.reply = { key: await dataKey(), enterAuthorized: true };
    mocks.closed = true;
    const { api, sessionKey } = await loadPage();

    await api.adoptInterviewer9Unlock();

    expect(sessionKey.getSessionDek()).toBeNull();
    expect(mocks.noteEntry).not.toHaveBeenCalled();
  });

  it('leaves the lock screen to show when no reply came', async () => {
    const { api, sessionKey } = await loadPage();

    await api.adoptInterviewer9Unlock();

    expect(sessionKey.getSessionDek()).toBeNull();
    expect(await api.status()).toMatchObject({ locked: true });
    expect(mocks.noteEntry).not.toHaveBeenCalled();
  });

  it('leaves the lock screen to show when the reply holds no key for a lock that needs one', async () => {
    mocks.reply = { key: null, enterAuthorized: true };
    const { api, sessionKey } = await loadPage();

    await api.adoptInterviewer9Unlock();

    expect(sessionKey.getSessionDek()).toBeNull();
    expect(await api.status()).toMatchObject({ locked: true });
  });

  it.each([
    ['a device with no lock', { configured: true, mode: 'none' }],
    ['a device not set up', { configured: false }],
    ['a corrupt lock', { configured: false, corrupt: true }],
  ])('never holds a key on %s', async (_case, status) => {
    mocks.status = status;
    mocks.reply = { key: await dataKey(), enterAuthorized: false };
    const { api, sessionKey } = await loadPage();

    await api.adoptInterviewer9Unlock();

    expect(sessionKey.getSessionDek()).toBeNull();
  });

  it('runs once: a later lock is not undone by it', async () => {
    const key = await dataKey();
    mocks.reply = { key, enterAuthorized: true };
    const { api, sessionKey } = await loadPage();
    await api.adoptInterviewer9Unlock();

    await api.lock();
    await api.adoptInterviewer9Unlock();

    expect(sessionKey.getSessionDek()).toBeNull();
    expect(mocks.noteEntry).toHaveBeenCalledTimes(1);
  });
});
