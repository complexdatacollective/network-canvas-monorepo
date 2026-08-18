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
    expect(markValidated).toHaveBeenCalledWith(makeRow());
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

  // The provenance mark records that a protocol passed the rules of the
  // Architect that wrote it. The interface-ownership rules are newer, so a
  // marked row still has to be checked against them — otherwise the fast path
  // admits a protocol that fails on the researcher's first commit.
  it('refuses a provenance-marked row that violates the interface-ownership rules', async () => {
    const validate = vi.fn();
    const markValidated = vi.fn();
    const conflicted: CurrentProtocol = {
      ...protocol,
      name: 'Conflicted study',
      stages: [
        {
          id: 'af1',
          type: 'AlterForm',
          label: 'Alter form',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'T', text: 'X' },
          form: {
            fields: [
              { variable: 'name', prompt: 'Name?' },
              { variable: 'name', prompt: 'Name again?' },
            ],
          },
        },
      ],
    } as unknown as CurrentProtocol;

    const result = await admitStoredProtocol(
      { ...makeRow(true), protocol: conflicted },
      { validate, markValidated },
    );

    expect(result.success).toBe(false);
    expect(!result.success && result.error.message).toContain(
      'the same attribute',
    );
    expect(validate).not.toHaveBeenCalled();
    expect(markValidated).not.toHaveBeenCalled();
  });
});
