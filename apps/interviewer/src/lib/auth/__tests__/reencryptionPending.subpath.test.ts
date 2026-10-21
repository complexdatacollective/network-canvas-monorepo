// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Interviewer 8 inside Interviewer 9 (a /v8/ build) shares Interviewer 9's
// database and its `interviewer:reencryption-pending` flag, and writes nothing
// but its interview's session row. Interviewer 9's own unlock retries the
// sweep, so an unlock here never sweeps, and never clears the flag: the rows
// it would leave plaintext would then never be retried.

const PIN = '12345678';

const PLAINTEXT_SESSION = {
  id: 'plain-session',
  protocolHash: 'hash',
  protocolName: 'Study',
  caseId: 'CASE-1',
  startedAt: '2026-01-01T00:00:00.000Z',
  lastUpdatedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 0,
  network: { nodes: [], edges: [], ego: { _uid: 'ego', attributes: {} } },
};

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
  return { api, pending, sessionKey, db };
};

// Secured, then locked: the state a later unlock starts from.
const enrolThenLock = async ({
  api,
  sessionKey,
}: Awaited<ReturnType<typeof loadUnder>>) => {
  expect((await api.enrolWithPin(PIN)).ok).toBe(true);
  sessionKey.setSessionDek(null);
};

const readRawSession = async (id: string): Promise<unknown> => {
  const raw = new Dexie('interviewer');
  try {
    await raw.open();
    return await raw.table('sessions').get(id);
  } finally {
    raw.close();
  }
};

afterEach(async () => {
  window.history.replaceState(null, '', '/');
  localStorage.removeItem('interviewer:reencryption-pending');
  localStorage.removeItem('interviewer:vault');
  vi.unstubAllEnvs();
  vi.resetModules();
  await Dexie.delete('interviewer');
});

describe('the shared re-encryption pending flag', () => {
  it('survives an enrol and an unlock in a /v8/ build, which sweep nothing', async () => {
    // A plaintext row left from before the device was secured.
    const root = await loadUnder('/');
    await root.db.sessions.put(PLAINTEXT_SESSION);
    root.db.close();

    // Opened for that row's interview, so the /v8/ write scope lets a put of
    // it through: a sweep that ran would encrypt it, failing the checks below.
    window.history.replaceState(
      null,
      '',
      `/v8/interview/${PLAINTEXT_SESSION.id}`,
    );
    const subpath = await loadUnder('/v8/');
    await enrolThenLock(subpath);
    // Enrolment sweeps nothing either.
    await expect(readRawSession(PLAINTEXT_SESSION.id)).resolves.toEqual(
      PLAINTEXT_SESSION,
    );
    subpath.pending.setReencryptionPending(true);

    expect((await subpath.api.unlockWithPin(PIN)).ok).toBe(true);

    expect(subpath.pending.isReencryptionPending()).toBe(true);
    // Left for Interviewer 9's sweep.
    await expect(readRawSession(PLAINTEXT_SESSION.id)).resolves.toEqual(
      PLAINTEXT_SESSION,
    );
  });

  it('is cleared by a clean unlock in the root build, which owns its sweep', async () => {
    const root = await loadUnder('/');
    await enrolThenLock(root);
    root.pending.setReencryptionPending(true);

    expect((await root.api.unlockWithPin(PIN)).ok).toBe(true);

    expect(root.pending.isReencryptionPending()).toBe(false);
  });
});
