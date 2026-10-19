// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db, getSettings, updateSettings } from '../db';
import {
  INTERVIEWER_9_DB_NAME,
  interviewer9ReadOnlyMiddleware,
  readInterviewer9SecurityBehaviour,
} from '../interviewer9Settings';
import { DEFAULT_SETTINGS } from '../types';

const appBase = vi.hoisted(() => ({ isSubpath: true }));

vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return appBase.isSubpath;
  },
}));

// Interviewer 9's database as Interviewer 9 creates it: Dexie version(1),
// which IndexedDB stores as version 10.
const seedInterviewer9 = async (settingsRow?: Record<string, unknown>) => {
  const v9 = new Dexie(INTERVIEWER_9_DB_NAME);
  v9.version(1).stores({
    protocols: 'id, hash, name, importedAt',
    sessions: 'id, protocolHash',
    assets: 'id, protocolHash, assetId',
    settings: 'id',
    legacyUpgrades: 'legacyHash',
  });
  await v9.open();
  if (settingsRow) await v9.table('settings').put(settingsRow);
  v9.close();
};

const readInterviewer9Raw = async () => {
  const v9 = new Dexie(INTERVIEWER_9_DB_NAME);
  await v9.open();
  try {
    return {
      version: v9.verno,
      row: await v9.table('settings').get('device'),
    };
  } finally {
    v9.close();
  }
};

const listDatabaseNames = async () =>
  (await indexedDB.databases()).map((database) => database.name);

const V9_RULES = {
  id: 'device',
  idleTimeoutMinutes: 1,
  requireUnlockOnEnter: false,
  requireUnlockOnExit: true,
  requireUnlockOnExport: true,
  exportCSV: false,
};

beforeEach(() => {
  appBase.isSubpath = true;
});

afterEach(async () => {
  await Dexie.delete(INTERVIEWER_9_DB_NAME);
  await db.settings.clear();
});

describe('readInterviewer9SecurityBehaviour', () => {
  it('reads the lock rules from Interviewer 9’s settings row', async () => {
    await seedInterviewer9(V9_RULES);

    await expect(readInterviewer9SecurityBehaviour()).resolves.toEqual({
      idleTimeoutMinutes: 1,
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      requireUnlockOnExport: true,
    });
  });

  it('leaves Interviewer 9’s database exactly as it was', async () => {
    await seedInterviewer9(V9_RULES);
    const before = await readInterviewer9Raw();

    await readInterviewer9SecurityBehaviour();

    expect(await readInterviewer9Raw()).toEqual(before);
  });

  it('never creates Interviewer 9’s database when it does not exist', async () => {
    await expect(readInterviewer9SecurityBehaviour()).resolves.toBeNull();
    expect(await listDatabaseNames()).not.toContain(INTERVIEWER_9_DB_NAME);
  });

  it('treats a browser that cannot list its databases as having none', async () => {
    await seedInterviewer9(V9_RULES);
    Object.defineProperty(indexedDB, 'databases', {
      configurable: true,
      value: undefined,
    });
    try {
      await expect(readInterviewer9SecurityBehaviour()).resolves.toBeNull();
    } finally {
      Reflect.deleteProperty(indexedDB, 'databases');
    }
  });

  it('gives nothing when Interviewer 9 has no settings row yet', async () => {
    await seedInterviewer9();

    await expect(readInterviewer9SecurityBehaviour()).resolves.toBeNull();
  });

  it('takes only values this app understands', async () => {
    await seedInterviewer9({
      id: 'device',
      idleTimeoutMinutes: 7,
      requireUnlockOnEnter: 'yes',
      requireUnlockOnExit: false,
    });

    await expect(readInterviewer9SecurityBehaviour()).resolves.toEqual({
      requireUnlockOnExit: false,
    });
  });
});

describe('interviewer9ReadOnlyMiddleware', () => {
  it('refuses writes and read-write transactions', async () => {
    await seedInterviewer9(V9_RULES);
    const handle = new Dexie(INTERVIEWER_9_DB_NAME, { autoOpen: false });
    handle.use(interviewer9ReadOnlyMiddleware);
    await handle.open();
    try {
      await expect(
        handle.table('settings').put({ ...V9_RULES, idleTimeoutMinutes: 60 }),
      ).rejects.toThrow();
      await expect(
        handle.transaction('rw', 'settings', () => undefined),
      ).rejects.toThrow();
    } finally {
      handle.close();
    }
    expect((await readInterviewer9Raw()).row).toEqual(V9_RULES);
  });
});

describe('getSettings in Interviewer 8 inside Interviewer 9', () => {
  it('applies Interviewer 9’s lock rules over this app’s own', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, exportGraphML: false });
    await seedInterviewer9(V9_RULES);

    const settings = await getSettings();

    expect(settings).toMatchObject({
      idleTimeoutMinutes: 1,
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      requireUnlockOnExport: true,
      // Everything else is still this app's own.
      exportGraphML: false,
      exportCSV: DEFAULT_SETTINGS.exportCSV,
    });
  });

  it('falls back to its own rules when Interviewer 9 has none', async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, idleTimeoutMinutes: 30 });

    expect((await getSettings()).idleTimeoutMinutes).toBe(30);
  });

  it('never copies Interviewer 9’s rules into its own row on a write', async () => {
    await seedInterviewer9(V9_RULES);

    await updateSettings({ exportGraphML: false });

    expect(await db.settings.get('device')).toMatchObject({
      exportGraphML: false,
      idleTimeoutMinutes: DEFAULT_SETTINGS.idleTimeoutMinutes,
      requireUnlockOnEnter: DEFAULT_SETTINGS.requireUnlockOnEnter,
    });
  });
});

describe('getSettings at the root', () => {
  it('reads only its own row', async () => {
    appBase.isSubpath = false;
    await seedInterviewer9(V9_RULES);

    const settings = await getSettings();

    expect(settings.idleTimeoutMinutes).toBe(
      DEFAULT_SETTINGS.idleTimeoutMinutes,
    );
    expect(settings.requireUnlockOnEnter).toBe(
      DEFAULT_SETTINGS.requireUnlockOnEnter,
    );
  });
});
