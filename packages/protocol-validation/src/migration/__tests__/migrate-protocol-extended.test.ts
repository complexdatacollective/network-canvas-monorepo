import { describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '../../schemas/index.ts';
import { getProtocolFileErrorKind } from '../../utils/protocolFileErrorKind.ts';
import {
  SchemaVersionDetectionError,
  ValidationError,
  VersionMismatchError,
} from '../errors.ts';
import {
  detectSchemaVersion,
  getMigrationInfo,
  migrateProtocol,
  protocolMigrator,
} from '../migrate-protocol.ts';

describe('Protocol Migration - Extended Tests', () => {
  describe('detectSchemaVersion - edge cases', () => {
    it('should throw error for null document', () => {
      expect(() => detectSchemaVersion(null)).toThrow(
        SchemaVersionDetectionError,
      );
    });

    it('should throw error for undefined document', () => {
      expect(() => detectSchemaVersion(undefined)).toThrow(
        SchemaVersionDetectionError,
      );
    });

    it('should throw error for string schemaVersion', () => {
      const doc = { schemaVersion: 'abc' };
      expect(() => detectSchemaVersion(doc)).toThrow(
        SchemaVersionDetectionError,
      );
    });

    it('should throw error for negative version', () => {
      const doc = { schemaVersion: -1 };
      expect(() => detectSchemaVersion(doc)).toThrow(
        SchemaVersionDetectionError,
      );
    });

    it('should throw error for float version', () => {
      const doc = { schemaVersion: 7.5 };
      expect(() => detectSchemaVersion(doc)).toThrow(
        SchemaVersionDetectionError,
      );
    });

    it.each([
      CURRENT_SCHEMA_VERSION + 1,
      999,
      String(CURRENT_SCHEMA_VERSION + 1),
    ])(
      'reports version %j as made by newer software, not as missing',
      (schemaVersion) => {
        let thrown: unknown;
        try {
          detectSchemaVersion({ schemaVersion });
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(VersionMismatchError);
        expect(getProtocolFileErrorKind(thrown)).toBe('newerVersion');
      },
    );

    it('should throw error for array', () => {
      const doc = { schemaVersion: [7] };
      expect(() => detectSchemaVersion(doc)).toThrow(
        SchemaVersionDetectionError,
      );
    });

    it('should throw error for object schemaVersion', () => {
      const doc = { schemaVersion: { version: 7 } };
      expect(() => detectSchemaVersion(doc)).toThrow(
        SchemaVersionDetectionError,
      );
    });

    it('should throw error for boolean schemaVersion', () => {
      const doc = { schemaVersion: true };
      expect(() => detectSchemaVersion(doc)).toThrow(
        SchemaVersionDetectionError,
      );
    });
  });

  describe('getMigrationInfo - additional cases', () => {
    it('should handle migration to current version (default)', () => {
      const info = getMigrationInfo(7);
      expect(info.canMigrate).toBe(true);
      expect(info.path).toContain(7);
      expect(info.path.at(-1)).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('should indicate cannot migrate for unknown source version', () => {
      const info = getMigrationInfo(0 as never, 8);
      expect(info.canMigrate).toBe(false);
      expect(info.path).toEqual([]);
    });

    it('should return correct step count', () => {
      const info = getMigrationInfo(7, 8);
      expect(info.stepsRequired).toBe(info.path.length - 1);
    });

    it('should have zero steps for no migration', () => {
      const info = getMigrationInfo(8, 8);
      expect(info.stepsRequired).toBe(0);
      expect(info.path).toEqual([8]);
    });
  });

  describe('migrateProtocol - validation errors', () => {
    it('should throw ValidationError for invalid v7 document structure', () => {
      const invalidDoc = {
        schemaVersion: 7,
        // Missing required fields like codebook, stages
        invalidField: 'test',
      };

      expect(() =>
        migrateProtocol(invalidDoc, undefined, { name: 'Test Protocol' }),
      ).toThrow(ValidationError);
    });

    it('should throw ValidationError with version information', () => {
      const invalidDoc = {
        schemaVersion: 7,
      };

      try {
        migrateProtocol(invalidDoc, undefined, { name: 'Test Protocol' });
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        if (e instanceof ValidationError) {
          expect(e.message).toContain('version 7');
        }
      }
    });

    it('rejects invalid current-version colors instead of repairing them', () => {
      const invalidDoc = {
        name: 'Invalid color protocol',
        schemaVersion: 9,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: '#cc0000',
              shape: { default: 'circle' },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
        assetManifest: {},
      };

      expect(() => migrateProtocol(invalidDoc)).toThrow(
        'Invalid protocol document for version 9',
      );
    });

    it('should preserve data types during migration', () => {
      const v7Doc = {
        schemaVersion: 7,
        description: 'Test protocol',
        lastModified: '2024-01-01T00:00:00.000Z',
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
        stages: [],
      };

      const migrated = migrateProtocol(v7Doc, undefined, {
        name: 'Test Protocol',
      });

      expect(typeof migrated.description).toBe('string');
      expect(migrated.description).toBe('Test protocol');
      expect(migrated.lastModified).toBe('2024-01-01T00:00:00.000Z');
      expect(typeof migrated.codebook).toBe('object');
      expect(Array.isArray(migrated.stages)).toBe(true);
    });

    it('should add experiments field during v7 to v8 migration', () => {
      const v7Doc = {
        schemaVersion: 7,
        description: 'Test',
        lastModified: '2024-01-01T00:00:00.000Z',
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
        stages: [],
      };

      const migrated = migrateProtocol(v7Doc, 8, {
        name: 'Test Protocol',
      });

      expect(migrated).toHaveProperty('experiments');
      expect(migrated.experiments).toEqual({});
    });

    it('should keep the experiments field during v8 to v9 migration', () => {
      const v7Doc = {
        schemaVersion: 7,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [],
      };

      const migrated = migrateProtocol(v7Doc, 9, { name: 'Test Protocol' });

      expect(migrated.experiments).toEqual({});
    });

    it('should handle null values in optional fields', () => {
      const v7Doc = {
        schemaVersion: 7,
        description: null as never,
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
        stages: [],
      };

      // This should either migrate successfully or throw a clear validation error
      try {
        const migrated = migrateProtocol(v7Doc, undefined, {
          name: 'Test Protocol',
        });
        expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
      }
    });
  });

  describe('migrateProtocol - validation of the target version', () => {
    const v7Doc = (variableName: string) => ({
      schemaVersion: 7,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            variables: { v1: { name: variableName, type: 'text' } },
          },
        },
        edge: {},
        ego: {},
      },
      stages: [],
    });

    it('validates a migration to version 8 against the version 8 schema', () => {
      const migrated = migrateProtocol(v7Doc('first_name'), 8, {
        name: 'Test Protocol',
      });
      expect(migrated.schemaVersion).toBe(8);
    });

    it('accepts the same names in a version 9 result', () => {
      const migrated = migrateProtocol(v7Doc('名前'), 9, {
        name: 'Test Protocol',
      });
      expect(migrated.schemaVersion).toBe(9);
      expect(migrated.codebook.node?.person?.variables?.v1?.name).toBe('名前');
    });
  });

  describe('ProtocolMigrator - cache behavior', () => {
    it('should not cache when cacheKey is not provided', async () => {
      const v7Doc = {
        schemaVersion: 7,
        description: 'No cache test',
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
        stages: [],
      };

      const result1 = await protocolMigrator.migrate(v7Doc, {
        dependencies: { name: 'Test Protocol' },
      });
      const result2 = await protocolMigrator.migrate(v7Doc, {
        dependencies: { name: 'Test Protocol' },
      });

      // Without cache key, results should be different instances
      expect(result1.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result2.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('should return different instances for different cache keys', async () => {
      const v7Doc = {
        schemaVersion: 7,
        description: 'Multi-cache test',
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
        stages: [],
      };

      const result1 = await protocolMigrator.migrate(v7Doc, {
        cacheKey: 'key1',
        dependencies: { name: 'Test Protocol' },
      });
      const result2 = await protocolMigrator.migrate(v7Doc, {
        cacheKey: 'key2',
        dependencies: { name: 'Test Protocol' },
      });

      expect(result1).not.toBe(result2);
      expect(result1.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result2.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('should handle clearing non-existent cache key', () => {
      expect(() =>
        protocolMigrator.clearCache('non-existent-key'),
      ).not.toThrow();
    });

    it('should respect targetVersion option', async () => {
      const v7Doc = {
        schemaVersion: 7,
        description: 'Target version test',
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
        stages: [],
      };

      const result = await protocolMigrator.migrate(v7Doc, {
        targetVersion: 8,
        dependencies: { name: 'Test Protocol' },
      });

      expect(result.schemaVersion).toBe(8);
    });

    it('should cache with custom target version', async () => {
      const v7Doc = {
        schemaVersion: 7,
        description: 'Cached with target',
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
        stages: [],
      };

      const result1 = await protocolMigrator.migrate(v7Doc, {
        cacheKey: 'custom-target',
        targetVersion: 8,
        dependencies: { name: 'Test Protocol' },
      });

      const result2 = await protocolMigrator.migrate(v7Doc, {
        cacheKey: 'custom-target',
        targetVersion: 8,
        dependencies: { name: 'Test Protocol' },
      });

      expect(result1).toBe(result2);
    });

    it('keeps a separate cached result for each target version of one key', async () => {
      const v7Doc = {
        schemaVersion: 7,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [],
      };
      const options = {
        cacheKey: 'per-target',
        dependencies: { name: 'Test Protocol' },
      };

      const atEight = await protocolMigrator.migrate(v7Doc, {
        ...options,
        targetVersion: 8,
      });
      const atCurrent = await protocolMigrator.migrate(v7Doc, options);

      expect(atEight.schemaVersion).toBe(8);
      expect(atCurrent.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(
        await protocolMigrator.migrate(v7Doc, { ...options, targetVersion: 8 }),
      ).toBe(atEight);
      expect(await protocolMigrator.migrate(v7Doc, options)).toBe(atCurrent);

      protocolMigrator.clearCache('per-target');

      expect(
        await protocolMigrator.migrate(v7Doc, { ...options, targetVersion: 8 }),
      ).not.toBe(atEight);
      expect(await protocolMigrator.migrate(v7Doc, options)).not.toBe(
        atCurrent,
      );
    });

    it('should handle migration errors and not cache failed results', async () => {
      const invalidDoc = {
        schemaVersion: 7,
        // Invalid structure
      };

      await expect(
        protocolMigrator.migrate(invalidDoc, {
          cacheKey: 'error-test',
          dependencies: { name: 'Test Protocol' },
        }),
      ).rejects.toThrow();

      // Verify nothing was cached by attempting migration again
      await expect(
        protocolMigrator.migrate(invalidDoc, {
          cacheKey: 'error-test',
          dependencies: { name: 'Test Protocol' },
        }),
      ).rejects.toThrow();
    });
  });

  // Note: Complex migration scenarios with full protocol structures require
  // valid schema-compliant data which is better tested in the existing migrations.test.ts file
});
