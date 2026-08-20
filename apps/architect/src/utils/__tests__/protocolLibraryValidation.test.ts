import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { StoredProtocolRow } from '../assetDB';
import {
  markStoredProtocolValidated,
  putStoredProtocolIfUnchanged,
} from '../protocolLibrary';

const db = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  update: vi.fn(),
  // Dexie takes a variable number of tables before the operation, so read the
  // operation off the end rather than by position.
  transaction: vi.fn(async (...args: unknown[]) => {
    const operation = args.at(-1) as () => Promise<unknown>;
    return await operation();
  }),
}));

vi.mock('../assetDB', () => ({
  assetDb: {
    protocols: {
      get: db.get,
      put: db.put,
      update: db.update,
    },
    assets: {},
    transaction: db.transaction,
  },
}));

vi.mock('../assetUtils', () => ({
  deleteOrphanedAssets: vi.fn(),
  deleteProtocolAssets: vi.fn(),
}));

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 8,
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
};

const expectedRow: StoredProtocolRow = {
  id: 'p1',
  name: protocol.name,
  schemaVersion: protocol.schemaVersion,
  protocol,
  createdAt: 1,
  updatedAt: 2,
};

describe('markStoredProtocolValidated', () => {
  beforeEach(() => {
    db.get.mockReset();
    db.update.mockReset();
    db.transaction.mockClear();
  });

  it('marks the same canonical revision inside one write transaction', async () => {
    db.get.mockResolvedValue(structuredClone(expectedRow));
    db.update.mockResolvedValue(1);

    await expect(
      markStoredProtocolValidated(expectedRow),
    ).resolves.toBeUndefined();

    expect(db.transaction).toHaveBeenCalledWith(
      'rw',
      expect.anything(),
      expect.any(Function),
    );
    expect(db.update).toHaveBeenCalledWith('p1', { validated: true });
  });

  it('does not mark a replacement written while validation is running', async () => {
    db.get.mockResolvedValue({
      ...expectedRow,
      protocol: { ...protocol, name: 'Invalid replacement' },
      updatedAt: 3,
    });

    await expect(markStoredProtocolValidated(expectedRow)).rejects.toThrow(
      'changed while it was being validated',
    );

    expect(db.update).not.toHaveBeenCalled();
  });

  it('does not mark a row that disappeared during validation', async () => {
    db.get.mockResolvedValue(undefined);

    await expect(markStoredProtocolValidated(expectedRow)).rejects.toThrow(
      'disappeared during validation',
    );

    expect(db.update).not.toHaveBeenCalled();
  });
});

/**
 * The write for a caller whose protocol was derived from a snapshot taken
 * before some slow asynchronous work — where another tab holding the same
 * library row can have autosaved into it in the meantime.
 */
describe('putStoredProtocolIfUnchanged', () => {
  const repaired: CurrentProtocol = { ...protocol, name: 'Study (repaired)' };
  const write = () =>
    putStoredProtocolIfUnchanged(expectedRow, {
      id: expectedRow.id,
      protocol: repaired,
      name: repaired.name,
    });

  beforeEach(() => {
    db.get.mockReset();
    db.put.mockReset().mockResolvedValue(undefined);
    db.update.mockReset();
    db.transaction.mockClear();
  });

  it('writes when the stored row is still the one the caller read', async () => {
    db.get.mockResolvedValue(structuredClone(expectedRow));

    await expect(write()).resolves.toBe(true);

    expect(db.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', protocol: repaired }),
    );
  });

  it('refuses when another tab has saved over the row', async () => {
    db.get.mockResolvedValue({
      ...expectedRow,
      protocol: { ...protocol, name: 'Saved by the other tab' },
      updatedAt: 3,
    });

    await expect(write()).resolves.toBe(false);

    expect(db.put).not.toHaveBeenCalled();
  });

  it('refuses when the row has been deleted', async () => {
    db.get.mockResolvedValue(undefined);

    await expect(write()).resolves.toBe(false);

    expect(db.put).not.toHaveBeenCalled();
  });

  it('compares and writes inside one transaction', async () => {
    db.get.mockResolvedValue(structuredClone(expectedRow));

    await write();

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
