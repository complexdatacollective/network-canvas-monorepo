import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deleteRetiredDatabases } from '../retiredDatabases';
import { DB_NAME, RETIRED_DB_NAMES } from '../storageNames';

const names = async () =>
  (await indexedDB.databases()).map((database) => database.name);

const create = async (name: string) => {
  const database = new Dexie(name);
  database.version(1).stores({ rows: 'id' });
  await database.table('rows').put({ id: 'row' });
  database.close();
};

afterEach(async () => {
  vi.restoreAllMocks();
  for (const name of [DB_NAME, ...RETIRED_DB_NAMES]) await Dexie.delete(name);
});

describe('deleteRetiredDatabases', () => {
  it('deletes only the databases an unreleased build left behind', async () => {
    await create(DB_NAME);
    for (const name of RETIRED_DB_NAMES) await create(name);

    await deleteRetiredDatabases();

    const left = await names();
    expect(left).toContain(DB_NAME);
    for (const name of RETIRED_DB_NAMES) expect(left).not.toContain(name);
  });

  it('creates nothing when they are not there', async () => {
    await deleteRetiredDatabases();
    for (const name of RETIRED_DB_NAMES) {
      expect(await names()).not.toContain(name);
    }
  });

  it('never throws, and still tries the others', async () => {
    for (const name of RETIRED_DB_NAMES) await create(name);
    const [first, ...rest] = RETIRED_DB_NAMES;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const realDelete = Dexie.delete.bind(Dexie);
    vi.spyOn(Dexie, 'delete').mockImplementation((name: string) =>
      name === first ? Promise.reject(new Error('blocked')) : realDelete(name),
    );

    await expect(deleteRetiredDatabases()).resolves.toBeUndefined();

    const left = await names();
    expect(left).toContain(first);
    for (const name of rest) expect(left).not.toContain(name);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
