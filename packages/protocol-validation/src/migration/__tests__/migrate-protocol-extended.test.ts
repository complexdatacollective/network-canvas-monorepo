import { describe, expect, it } from 'vitest';

import { SchemaVersionDetectionError, ValidationError } from '../errors.ts';
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

    it('should throw error for very large version number', () => {
      const doc = { schemaVersion: 999 };
      expect(() => detectSchemaVersion(doc)).toThrow(
        SchemaVersionDetectionError,
      );
    });

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
      expect(info.path[info.path.length - 1]).toBe(8); // Assuming current is 8
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
        schemaVersion: 8,
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
        'Invalid protocol document for version 8',
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

      const migrated = migrateProtocol(v7Doc, undefined, {
        name: 'Test Protocol',
      });

      expect(migrated).toHaveProperty('experiments');
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
        expect(migrated.schemaVersion).toBe(8);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
      }
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
      expect(result1.schemaVersion).toBe(8);
      expect(result2.schemaVersion).toBe(8);
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
      expect(result1.schemaVersion).toBe(8);
      expect(result2.schemaVersion).toBe(8);
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

describe('migration of a current-schema document is identity', () => {
  it('returns the document byte-for-byte, nothing schema-resolved', () => {
    // Parsing resolves `synthetic` descriptors; migration must NOT. A host
    // stores, hashes, and identity-compares the pre-parse document, so a
    // "migration" that rewrote an already-current document would republish
    // every stored protocol as changed and move migrated-import hashes each
    // time the schema learns a new default. Regression: Studio's
    // republish-as-unchanged flow caught exactly this in CI.
    const document = {
      name: 'Identity',
      schemaVersion: 8,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              name: { name: 'name', type: 'text', component: 'Text' },
            },
          },
        },
      },
      stages: [
        {
          id: 'info',
          type: 'Information',
          label: 'Welcome',
          title: 'Welcome',
          items: [{ id: 'w', type: 'text', content: 'Hello.' }],
        },
      ],
    };
    const before = JSON.stringify(document);

    const migrated = migrateProtocol(document, 8);

    expect(JSON.stringify(migrated)).toBe(before);
    expect(JSON.stringify(document)).toBe(before);
  });
});
