import { describe, expect, it, vi } from 'vitest';

import {
  type CurrentProtocol,
  ProtocolValidationError,
} from '@codaco/protocol-validation';

import type { StoredProtocolRow } from '../assetDB';
import { admitStoredProtocol } from '../storedProtocolAdmission';

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: 8,
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
};

const makeRow = (validated?: true): StoredProtocolRow => ({
  id: 'p1',
  name: protocol.name,
  schemaVersion: protocol.schemaVersion,
  protocol,
  validated,
  createdAt: 0,
  updatedAt: 0,
});

describe('admitStoredProtocol', () => {
  it('trusts a provenance-marked canonical row without validation', async () => {
    const validate = vi.fn();
    const markValidated = vi.fn();

    await expect(
      admitStoredProtocol(makeRow(true), { validate, markValidated }),
    ).resolves.toEqual({ success: true });
    expect(validate).not.toHaveBeenCalled();
    expect(markValidated).not.toHaveBeenCalled();
  });

  it('validates and marks an unproven legacy row once', async () => {
    const validate = vi
      .fn()
      .mockResolvedValue({ success: true, data: protocol });
    const markValidated = vi.fn().mockResolvedValue(undefined);

    await expect(
      admitStoredProtocol(makeRow(), { validate, markValidated }),
    ).resolves.toEqual({ success: true });
    expect(validate).toHaveBeenCalledWith(protocol);
    expect(markValidated).toHaveBeenCalledWith('p1');
  });

  it('rejects an invalid legacy row without marking it', async () => {
    const error = new ProtocolValidationError([
      { code: 'custom', path: [], message: 'Legacy row is invalid' },
    ]);
    const validate = vi.fn().mockResolvedValue({ success: false, error });
    const markValidated = vi.fn();

    await expect(
      admitStoredProtocol(makeRow(), { validate, markValidated }),
    ).resolves.toEqual({ success: false, error });
    expect(markValidated).not.toHaveBeenCalled();
  });
});
