import { describe, expect, it, vi } from 'vitest';

import {
  type CurrentProtocol,
  ProtocolValidationError,
} from '@codaco/protocol-validation';
import { APP_SCHEMA_VERSION } from '~/config';

import type { StoredProtocolRow } from '../assetDB';
import { admitStoredProtocol } from '../storedProtocolAdmission';

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: APP_SCHEMA_VERSION,
  localization: { defaultLocale: 'en', locales: ['en'] },
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
    // past the version gate.
    validated: true,
    ...overrides,
  });

describe('admitStoredProtocol', () => {
  describe('a row at this build’s schema version', () => {
    it('trusts a provenance-marked canonical row without validation', async () => {
      const validate = vi.fn();
      const markValidated = vi.fn();

      await expect(
        admitStoredProtocol(makeRow({ validated: true }), {
          validate,
          markValidated,
        }),
      ).resolves.toEqual({ success: true, protocol });
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
      ).resolves.toEqual({ success: true, protocol });
      expect(validate).toHaveBeenCalledWith(protocol, { draft: true });
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
      ).resolves.toEqual({
        success: false,
        refusal: { status: 'validation-error', message: error.message },
      });
      expect(markValidated).not.toHaveBeenCalled();
    });
  });

  // This library holds only this schema's protocols: older ones live in
  // Architect 8's library and are upgraded into a new row, never in place. A
  // row that claims an older schema here is refused, whatever it is marked.
  describe('a row below this build’s schema version', () => {
    it.each([
      ['marked valid', makeLegacyRow()],
      ['unmarked', makeLegacyRow({ validated: undefined })],
    ])(
      'refuses it as invalid when %s, and does not touch it',
      async (_, row) => {
        const validate = vi.fn();
        const markValidated = vi.fn();

        await expect(
          admitStoredProtocol(row, { validate, markValidated }),
        ).resolves.toEqual({
          success: false,
          refusal: {
            status: 'validation-error',
            message: `The library row records schema version ${OLDER_SCHEMA_VERSION}, but this library holds only schema version ${APP_SCHEMA_VERSION} protocols.`,
          },
        });
        expect(validate).not.toHaveBeenCalled();
        expect(markValidated).not.toHaveBeenCalled();
      },
    );
  });

  describe('a row above this build’s schema version', () => {
    it('refuses to open it, and does not touch it', async () => {
      const row = makeRow({
        schemaVersion: APP_SCHEMA_VERSION + 1,
        validated: true,
      });
      const validate = vi.fn();
      const markValidated = vi.fn();

      await expect(
        admitStoredProtocol(row, { validate, markValidated }),
      ).resolves.toEqual({
        success: false,
        refusal: {
          status: 'app-upgrade-required',
          protocolSchemaVersion: APP_SCHEMA_VERSION + 1,
        },
      });
      expect(validate).not.toHaveBeenCalled();
      expect(markValidated).not.toHaveBeenCalled();
    });
  });
});
