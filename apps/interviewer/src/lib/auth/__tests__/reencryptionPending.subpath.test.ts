// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Interviewer 8 inside Interviewer 9 (a /v8/ build) shares the
// `interviewer:reencryption-pending` flag with Interviewer 9, whose retry
// sweeps both apps' databases. An unlock here sweeps only Interviewer 8's
// database, so it must never clear the flag: Interviewer 9's own plaintext
// rows would then never be retried.

const PIN = '12345678';

// The build's base is read as the modules load, so each case loads the auth
// API fresh under that base, with the modules it shares state with.
const loadUnder = async (baseUrl: string) => {
  vi.stubEnv('BASE_URL', baseUrl);
  vi.resetModules();
  const [api, pending, sessionKey, vaultStore, { db }] = await Promise.all([
    import('../api'),
    import('../reencryptionPending'),
    import('../../db/sessionKey'),
    import('../../vault/vaultStore'),
    import('../../db/db'),
  ]);
  vaultStore.clearVault();
  sessionKey.setSessionDek(null);
  pending.setReencryptionPending(false);
  await db.sessions.clear();
  // Secured, then locked: the state a later unlock starts from.
  expect((await api.enrolWithPin(PIN)).ok).toBe(true);
  sessionKey.setSessionDek(null);
  return { api, pending, vaultStore };
};

afterEach(() => {
  localStorage.removeItem('interviewer:reencryption-pending');
  localStorage.removeItem('interviewer:vault');
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('the shared re-encryption pending flag', () => {
  it('survives a clean unlock in a /v8/ build', async () => {
    const { api, pending } = await loadUnder('/v8/');
    pending.setReencryptionPending(true);

    expect((await api.unlockWithPin(PIN)).ok).toBe(true);

    expect(pending.isReencryptionPending()).toBe(true);
  });

  it('is cleared by a clean unlock in the root build, which owns its sweep', async () => {
    const { api, pending } = await loadUnder('/');
    pending.setReencryptionPending(true);

    expect((await api.unlockWithPin(PIN)).ok).toBe(true);

    expect(pending.isReencryptionPending()).toBe(false);
  });
});
