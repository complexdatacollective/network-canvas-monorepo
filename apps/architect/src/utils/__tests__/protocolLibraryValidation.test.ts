import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { StoredProtocolRow } from '../assetDB';
import { markStoredProtocolValidated } from '../protocolLibrary';

const db = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(
    async (_mode: string, _table: unknown, operation: () => Promise<void>) =>
      await operation(),
  ),
}));

vi.mock('../assetDB', () => ({
  assetDb: {
    protocols: {
      get: db.get,
      update: db.update,
    },
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
