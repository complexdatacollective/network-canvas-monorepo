// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Interviewer 8 inside Interviewer 9 (a /v8/ build) opens Interviewer 9's
// database, `interviewer`: the one Interviewer 8 created on 8.x devices, which
// Interviewer 9 has since upgraded to a version above Interviewer 8's (Dexie
// version 3, native 30), with tables and indexes of its own. Interviewer 8
// keeps its own declaration, opens it there as it is, and writes nothing but
// the session row of the interview the page was opened for.

const DB_NAME = 'interviewer';

// Interviewer 9's declaration, as far as this test needs one: every table and
// index Interviewer 8 declares, plus a table and a sessions index of its own,
// at a version above Interviewer 8's.
const INTERVIEWER_9_VERSION = 5;
const INTERVIEWER_9_STORES = {
  protocols: 'id, hash, name, importedAt',
  sessions:
    'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic, interviewer9Only',
  assets: 'id, protocolHash, assetId',
  settings: 'id',
  protocolMigrations: 'previousHash',
  legacyUpgrades: 'legacyHash',
};

const NETWORK = {
  nodes: [],
  edges: [],
  ego: { _uid: 'ego', attributes: {} },
};

// Rows in Interviewer 8's format, plaintext (a device without a lock), as
// Interviewer 9 writes them for a schema 8 protocol.
const session = (id: string, protocolHash: string) => ({
  id,
  protocolHash,
  protocolName: 'Study',
  caseId: `CASE-${id}`,
  startedAt: '2026-01-01T00:00:00.000Z',
  lastUpdatedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 0,
  isSynthetic: false,
  network: NETWORK,
});

const protocol = (hash: string, schemaVersion: number) => ({
  id: hash,
  hash,
  name: `Schema ${schemaVersion} study`,
  schemaVersion,
  importedAt: '2026-01-01T00:00:00.000Z',
  codebook: {},
  protocol: { name: 'Study', schemaVersion, stages: [], codebook: {} },
});

const INTERVIEWER_9_SETTINGS = {
  id: 'device',
  idleTimeoutMinutes: 5,
  requireUnlockOnEnter: false,
  requireUnlockOnExit: true,
  requireUnlockOnExport: true,
  allowStageNavigation: false,
  analyticsEnabled: false,
  lastActiveSessionId: 'from-interviewer-9',
};

const openInterviewer9 = () => {
  const v9 = new Dexie(DB_NAME);
  v9.version(INTERVIEWER_9_VERSION).stores(INTERVIEWER_9_STORES);
  return v9;
};

const seedInterviewer9 = async ({
  settings = INTERVIEWER_9_SETTINGS,
}: { settings?: Record<string, unknown> | null } = {}) => {
  const v9 = openInterviewer9();
  await v9.open();
  await v9
    .table('protocols')
    .bulkPut([protocol('hash-8', 8), protocol('hash-9', 9)]);
  await v9
    .table('sessions')
    .bulkPut([
      session('s1', 'hash-8'),
      { ...session('s2', 'hash-8'), isSynthetic: true },
      session('s9', 'hash-9'),
    ]);
  await v9.table('legacyUpgrades').put({ legacyHash: 'hash-8' });
  if (settings) await v9.table('settings').put(settings);
  v9.close();
};

/** Everything in the database, and its installed shape, read raw. */
const snapshot = async () => {
  const raw = new Dexie(DB_NAME);
  await raw.open();
  try {
    const tables: Record<string, unknown[]> = {};
    for (const table of raw.tables) {
      tables[table.name] = await table.toArray();
    }
    return {
      version: raw.verno,
      schema: Object.fromEntries(
        raw.tables.map((table) => [
          table.name,
          table.schema.indexes.map((index) => index.name).toSorted(),
        ]),
      ),
      tables,
    };
  } finally {
    raw.close();
  }
};

// The build's base and the page's address are read as the modules load, so
// each case loads them fresh, as a page opened at `path` under `baseUrl`.
const openPage = async (path: string, baseUrl = '/v8/') => {
  vi.stubEnv('BASE_URL', baseUrl);
  window.history.replaceState(null, '', path);
  vi.resetModules();
  const [api, { db }] = await Promise.all([import('../api'), import('../db')]);
  return { api, db };
};

let opened: Dexie | null = null;

afterEach(async () => {
  opened?.close();
  opened = null;
  vi.unstubAllEnvs();
  vi.resetModules();
  window.history.replaceState(null, '', '/');
  await Dexie.delete(DB_NAME);
});

describe('a database Interviewer 9 has upgraded', () => {
  it('opens with Interviewer 8’s declaration, at Interviewer 9’s version, and upgrades nothing', async () => {
    await seedInterviewer9();
    const before = await snapshot();
    expect(before.version).toBe(INTERVIEWER_9_VERSION);

    const { api, db } = await openPage('/v8/interview/s1');
    opened = db;

    const stored = await api.getSession('s1');
    expect(stored).toMatchObject({ id: 's1', caseId: 'CASE-s1' });
    await expect(api.getProtocolByHash('hash-8')).resolves.toMatchObject({
      schemaVersion: 8,
    });
    // Dexie stores version n as native version 10n.
    expect(db.backendDB().version).toBe(INTERVIEWER_9_VERSION * 10);
    db.close();

    // Its tables, indexes and version are Interviewer 9's still.
    const after = await snapshot();
    expect(after.version).toBe(before.version);
    expect(after.schema).toEqual(before.schema);
  });

  it('writes the running interview’s answers, step and finish to its session row, and nothing else', async () => {
    await seedInterviewer9();
    const before = await snapshot();
    const { api, db } = await openPage('/v8/interview/s1');
    opened = db;

    const answered = {
      ...NETWORK,
      nodes: [{ _uid: 'n1', type: 'person', attributes: {} }],
    };
    await api.updateSession('s1', { network: answered, currentStep: 2 });
    await api.markSessionFinished('s1');
    db.close();

    const after = await snapshot();
    const s1 = after.tables.sessions?.find(
      (row) => (row as { id: string }).id === 's1',
    );
    expect(s1).toMatchObject({
      id: 's1',
      protocolHash: 'hash-8',
      currentStep: 2,
      network: answered,
    });
    expect((s1 as { finishedAt: string | null }).finishedAt).not.toBeNull();

    // Everything but that row is exactly as Interviewer 9 left it.
    const withoutS1 = (tables: Record<string, unknown[]>) => ({
      ...tables,
      sessions: tables.sessions?.filter(
        (row) => (row as { id: string }).id !== 's1',
      ),
    });
    expect(withoutS1(after.tables)).toEqual(withoutS1(before.tables));
  });

  it('refuses every other write', async () => {
    await seedInterviewer9();
    const before = await snapshot();
    const { api, db } = await openPage('/v8/interview/s1');
    opened = db;

    const attempts: [string, () => Promise<unknown>][] = [
      ['a setting', () => api.updateSettings({ requireUnlockOnEnter: false })],
      [
        'the settings table',
        () =>
          db.table('settings').put({
            ...INTERVIEWER_9_SETTINGS,
            idleTimeoutMinutes: 60,
          }),
      ],
      ['a protocol', () => db.table('protocols').put(protocol('hash-new', 8))],
      [
        'an asset',
        () =>
          db.assets.put({
            id: 'a',
            protocolHash: 'hash-8',
            assetId: 'a',
            name: 'a',
            type: 'image',
            data: 'x',
          }),
      ],
      [
        'a protocol migration record',
        () =>
          db.protocolMigrations.put({
            previousHash: 'old',
            hash: 'hash-8',
            migratedAt: '2026-01-01T00:00:00.000Z',
          }),
      ],
      ['another session', () => api.updateSession('s2', { currentStep: 3 })],
      [
        'a new session',
        () =>
          api.createSession({
            protocolHash: 'hash-8',
            protocolName: 'Study',
            caseId: 'NEW',
            initialNetwork: NETWORK,
          }),
      ],
      ['a deletion of its own session', () => api.deleteSessions(['s1'])],
      ['a deletion of other sessions', () => api.deleteSyntheticSessions()],
      ['a deletion of a protocol', () => api.deleteProtocol('hash-8')],
      [
        'a launch protocol migration',
        () =>
          db.transaction(
            'rw',
            db.protocols,
            db.sessions,
            async () => undefined,
          ),
      ],
    ];
    for (const [what, attempt] of attempts) {
      await expect(attempt(), what).rejects.toThrow();
    }
    db.close();

    expect((await snapshot()).tables).toEqual(before.tables);
  });

  it('reads the lock rules from Interviewer 9’s settings row, without writing one', async () => {
    await seedInterviewer9();
    const { api, db } = await openPage('/v8/interview/s1');
    opened = db;

    await expect(api.getSettings()).resolves.toMatchObject({
      id: 'device',
      idleTimeoutMinutes: 5,
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      requireUnlockOnExport: true,
      allowStageNavigation: false,
      analyticsEnabled: false,
    });
  });

  it('runs under the defaults, and writes none, while Interviewer 9 has no settings row', async () => {
    await seedInterviewer9({ settings: null });
    const { api, db } = await openPage('/v8/interview/s1');
    opened = db;

    const { DEFAULT_SETTINGS } = await import('../types');
    await expect(api.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    db.close();

    expect((await snapshot()).tables.settings).toEqual([]);
  });

  it('takes only setting values this app understands', async () => {
    await seedInterviewer9({
      settings: {
        id: 'device',
        idleTimeoutMinutes: 7,
        requireUnlockOnEnter: 'yes',
        requireUnlockOnExit: true,
        allowStageNavigation: null,
      },
    });
    const { api, db } = await openPage('/v8/interview/s1');
    opened = db;
    const { DEFAULT_SETTINGS } = await import('../types');

    await expect(api.getSettings()).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      requireUnlockOnExit: true,
    });
  });

  it('looks up a session’s protocol schema from plaintext fields', async () => {
    await seedInterviewer9();
    const { api, db } = await openPage('/v8/interview/s1');
    opened = db;

    await expect(api.getSessionProtocolSchemaVersion('s1')).resolves.toBe(8);
    await expect(api.getSessionProtocolSchemaVersion('s9')).resolves.toBe(9);
    await expect(
      api.getSessionProtocolSchemaVersion('missing'),
    ).resolves.toBeNull();
  });
});

describe('a database that does not exist yet', () => {
  it('is neither opened nor created by the settings read or the interview look-up', async () => {
    const { api, db } = await openPage('/v8/interview/s1');
    opened = db;
    const { DEFAULT_SETTINGS } = await import('../types');

    await expect(api.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(api.getSessionProtocolSchemaVersion('s1')).resolves.toBeNull();

    const names = (await indexedDB.databases()).map((entry) => entry.name);
    expect(names).not.toContain(DB_NAME);
  });
});

describe('a page not opened for an interview', () => {
  it('can write no row at all', async () => {
    await seedInterviewer9();
    const before = await snapshot();
    const { api, db } = await openPage('/v8/');
    opened = db;

    await expect(api.updateSession('s1', { currentStep: 1 })).rejects.toThrow();
    db.close();

    expect((await snapshot()).tables).toEqual(before.tables);
  });
});

describe('the root build', () => {
  it('still writes its own settings and sessions as on main', async () => {
    await seedInterviewer9({ settings: null });
    const { api, db } = await openPage('/interview/s1', '/');
    opened = db;

    await api.updateSettings({ lastActiveSessionId: 's2' });
    await api.updateSession('s2', { currentStep: 4 });
    db.close();

    const after = await snapshot();
    expect(after.tables.settings).toEqual([
      expect.objectContaining({ id: 'device', lastActiveSessionId: 's2' }),
    ]);
    expect(after.tables.sessions).toContainEqual(
      expect.objectContaining({ id: 's2', currentStep: 4 }),
    );
  });
});
