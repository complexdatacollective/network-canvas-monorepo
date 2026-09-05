import { describe, expect, it, vi } from 'vitest';

import {
  type CurrentProtocol,
  ProtocolValidationError,
} from '@codaco/protocol-validation';
import { APP_SCHEMA_VERSION } from '~/config';
import { messageFields } from '~/test/messageText';

import type { StoredProtocolRow } from '../assetDB';
import { admitStoredProtocol } from '../storedProtocolAdmission';

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: APP_SCHEMA_VERSION,
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
};

const makeRow = (
  overrides: Partial<StoredProtocolRow> = {},
): StoredProtocolRow => ({
  id: 'p1',
  name: protocol.name,
  schemaVersion: protocol.schemaVersion,
  protocol,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

// A row written by an older Architect. `schemaVersion` is the row's own column
// (what `putStoredProtocol` copied off the document when it was saved), which
// is what the version gate reads.
const OLDER_SCHEMA_VERSION = APP_SCHEMA_VERSION - 1;
const makeLegacyRow = (
  overrides: Partial<StoredProtocolRow> = {},
): StoredProtocolRow =>
  makeRow({
    id: 'older',
    schemaVersion: OLDER_SCHEMA_VERSION,
    protocol: {
      ...protocol,
      schemaVersion: OLDER_SCHEMA_VERSION,
    } as CurrentProtocol,
    // Marked valid under the schema of its own day: provenance must not let it
    // skip the upgrade.
    validated: true,
    ...overrides,
  });

const upgraded = { ...protocol, name: 'Study' };

describe('admitStoredProtocol', () => {
  describe('a row at this build’s schema version', () => {
    it('trusts a provenance-marked canonical row without validation', async () => {
      const validate = vi.fn();
      const markValidated = vi.fn();
      const persist = vi.fn();

      await expect(
        admitStoredProtocol(makeRow({ validated: true }), {
          validate,
          markValidated,
          persist,
        }),
      ).resolves.toEqual({ success: true, protocol });
      expect(validate).not.toHaveBeenCalled();
      expect(markValidated).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    });

    it('validates and marks an unproven legacy row once', async () => {
      const validate = vi
        .fn()
        .mockResolvedValue({ success: true, data: protocol });
      const markValidated = vi.fn().mockResolvedValue(undefined);
      const migrate = vi.fn();

      await expect(
        admitStoredProtocol(makeRow(), { validate, markValidated, migrate }),
      ).resolves.toEqual({ success: true, protocol });
      expect(validate).toHaveBeenCalledWith(protocol);
      expect(markValidated).toHaveBeenCalledWith(makeRow());
      expect(migrate).not.toHaveBeenCalled();
    });

    it('rejects an invalid legacy row without marking it', async () => {
      const error = new ProtocolValidationError([
        { code: 'custom', path: [], message: 'Legacy row is invalid' },
      ]);
      const validate = vi.fn().mockResolvedValue({ success: false, error });
      const markValidated = vi.fn();

      await expect(
        admitStoredProtocol(makeRow(), { validate, markValidated }),
      ).resolves.toEqual({
        success: false,
        refusal: { status: 'validation-error', message: error.message },
      });
      expect(markValidated).not.toHaveBeenCalled();
    });
  });

  describe('a row below this build’s schema version', () => {
    it('migrates it, saves it back over itself, and announces the upgrade', async () => {
      const row = makeLegacyRow();
      const migrate = vi.fn().mockReturnValue(upgraded);
      const validate = vi
        .fn()
        .mockResolvedValue({ success: true, data: upgraded });
      const persist = vi.fn().mockResolvedValue(true);
      const notifyUpgraded = vi.fn();

      await expect(
        admitStoredProtocol(row, {
          migrate,
          validate,
          persist,
          notifyUpgraded,
        }),
      ).resolves.toEqual({ success: true, protocol: upgraded });

      expect(migrate).toHaveBeenCalledWith(row.protocol, APP_SCHEMA_VERSION, {
        name: row.name,
      });
      // The upgraded document is validated before anything is written.
      expect(validate).toHaveBeenCalledWith(upgraded);
      // The write is guarded on the row still being the one that was read:
      // the snapshot travels with the input so the guard can compare.
      expect(persist).toHaveBeenCalledWith(
        row,
        expect.objectContaining({ id: 'older', protocol: upgraded }),
      );
      expect(persist.mock.invocationCallOrder[0]!).toBeGreaterThan(
        validate.mock.invocationCallOrder[0]!,
      );
      expect(notifyUpgraded).toHaveBeenCalledWith({ name: row.name });
    });

    it('refuses without announcing when another window saved the row mid-upgrade', async () => {
      const row = makeLegacyRow();
      const persist = vi.fn().mockResolvedValue(false);
      const notifyUpgraded = vi.fn();

      const result = await admitStoredProtocol(row, {
        migrate: vi.fn().mockReturnValue(upgraded),
        validate: vi.fn().mockResolvedValue({ success: true, data: upgraded }),
        persist,
        notifyUpgraded,
      });

      expect(result.success).toBe(false);
      if (result.success)
        throw new Error('The failed migration must refuse admission');
      expect({ ...result, refusal: messageFields(result.refusal) }).toEqual({
        success: false,
        refusal: {
          status: 'error',
          title: 'Protocol changed while upgrading',
          message: expect.stringContaining('saved by another window'),
        },
      });
      expect(notifyUpgraded).not.toHaveBeenCalled();
    });

    it('retains the assets the pre-migration manifest referenced', async () => {
      const row = makeLegacyRow({
        protocol: {
          ...protocol,
          schemaVersion: OLDER_SCHEMA_VERSION,
          assetManifest: { 'old-asset': { id: 'old-asset' } },
        } as unknown as CurrentProtocol,
      });
      const persist = vi.fn().mockResolvedValue(true);

      await admitStoredProtocol(row, {
        migrate: vi.fn().mockReturnValue(upgraded),
        validate: vi.fn().mockResolvedValue({ success: true, data: upgraded }),
        persist,
        notifyUpgraded: vi.fn(),
      });

      expect(persist).toHaveBeenCalledWith(
        row,
        expect.objectContaining({ retainedAssetIds: ['old-asset'] }),
      );
    });

    it('leaves the row untouched and humanises a migration that throws', async () => {
      const row = makeLegacyRow();
      const migrate = vi.fn().mockImplementation(() => {
        throw new Error('Duplicate attribute name "name"');
      });
      const persist = vi.fn();
      const markValidated = vi.fn();
      const notifyUpgraded = vi.fn();

      const result = await admitStoredProtocol(row, {
        migrate,
        validate: vi.fn(),
        persist,
        markValidated,
        notifyUpgraded,
      });

      expect(result.success).toBe(false);
      if (result.success)
        throw new Error('The failed migration must refuse admission');
      expect({ ...result, refusal: messageFields(result.refusal) }).toEqual({
        success: false,
        refusal: {
          status: 'error',
          title: 'Two attributes share a name',
          message: expect.stringContaining('both named "name"'),
          detail: 'Duplicate attribute name "name"',
        },
      });
      expect(persist).not.toHaveBeenCalled();
      expect(markValidated).not.toHaveBeenCalled();
      expect(notifyUpgraded).not.toHaveBeenCalled();
    });

    it('leaves the row untouched when the upgraded document fails validation', async () => {
      const error = new ProtocolValidationError([
        { code: 'custom', path: [], message: 'Upgraded protocol is invalid' },
      ]);
      const persist = vi.fn();
      const notifyUpgraded = vi.fn();

      const result = await admitStoredProtocol(makeLegacyRow(), {
        migrate: vi.fn().mockReturnValue(upgraded),
        validate: vi.fn().mockResolvedValue({ success: false, error }),
        persist,
        notifyUpgraded,
      });

      expect(result).toEqual({
        success: false,
        refusal: { status: 'validation-error', message: error.message },
      });
      expect(persist).not.toHaveBeenCalled();
      expect(notifyUpgraded).not.toHaveBeenCalled();
    });
  });

  describe('a row above this build’s schema version', () => {
    it('refuses to open it, and does not touch it', async () => {
      const row = makeRow({
        schemaVersion: APP_SCHEMA_VERSION + 1,
        validated: true,
      });
      const migrate = vi.fn();
      const validate = vi.fn();
      const persist = vi.fn();

      await expect(
        admitStoredProtocol(row, { migrate, validate, persist }),
      ).resolves.toEqual({
        success: false,
        refusal: {
          status: 'app-upgrade-required',
          protocolSchemaVersion: APP_SCHEMA_VERSION + 1,
        },
      });
      expect(migrate).not.toHaveBeenCalled();
      expect(validate).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    });
  });
});
