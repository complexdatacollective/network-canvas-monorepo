import migrationV1toV2 from '../schemas/2/migration.ts';
import migrationV2toV3 from '../schemas/3/migration.ts';
import migrationV3toV4 from '../schemas/4/migration.ts';
import migrationV4toV5 from '../schemas/5/migration.ts';
import migrationV5toV6 from '../schemas/6/migration.ts';
import migrationV6toV7 from '../schemas/7/migration.ts';
import migrationV7toV8 from '../schemas/8/migration.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocolDocument,
  CurrentProtocolSchema,
  type SchemaVersion,
  SchemaVersionSchema,
  VersionedProtocolSchema,
} from '../schemas/index.ts';
import { repairLegacyColorReferences } from '../utils/repairLegacyColorReferences.ts';
import { SchemaVersionDetectionError, ValidationError } from './errors.ts';
import { type ProtocolDocument, protocolMigrations } from './index.ts';

protocolMigrations.register(migrationV1toV2);
protocolMigrations.register(migrationV2toV3);
protocolMigrations.register(migrationV3toV4);
protocolMigrations.register(migrationV4toV5);
protocolMigrations.register(migrationV5toV6);
protocolMigrations.register(migrationV6toV7);
protocolMigrations.register(migrationV7toV8);

export function detectSchemaVersion(document: unknown): SchemaVersion {
  try {
    const rawVersion = (document as { schemaVersion?: unknown })?.schemaVersion;

    // Handle v1 string schemaVersion ("1" -> 1)
    const coerced =
      typeof rawVersion === 'string' ? Number(rawVersion) : rawVersion;

    const partial = SchemaVersionSchema.safeParse(coerced);

    if (partial.success) {
      return partial.data;
    }
    throw new SchemaVersionDetectionError();
  } catch {
    throw new SchemaVersionDetectionError();
  }
}

export function migrateProtocol(
  document: unknown,
  targetVersion: SchemaVersion = CURRENT_SCHEMA_VERSION,
  dependencies: Record<string, unknown> = {},
): CurrentProtocolDocument {
  const detectedVersion = detectSchemaVersion(document);
  // Repair exact legacy colors generated or shipped by Network Canvas before
  // strict pre-validation. The repair is deliberately bounded; arbitrary raw
  // and custom values remain invalid.
  const legacyColorRepair = repairLegacyColorReferences(document);
  const migrationInput = legacyColorRepair.protocol;

  // Only pre-validate versions that have Zod schemas (7+)
  if (detectedVersion >= 7) {
    const preValidationResult =
      VersionedProtocolSchema.safeParse(migrationInput);
    if (!preValidationResult.success) {
      throw new ValidationError(
        `Invalid protocol document for version ${detectedVersion}: ${preValidationResult.error.message}`,
        detectedVersion,
      );
    }
  }

  // Ensure schemaVersion is numeric before passing to migration chain
  const normalizedDocument = {
    ...(migrationInput as Record<string, unknown>),
    schemaVersion: detectedVersion,
  };

  // Perform migration
  const migrated = protocolMigrations.migrate(
    normalizedDocument as ProtocolDocument<SchemaVersion>,
    targetVersion,
    dependencies,
  );

  // Validate the migrated document against the target schema — a GATE, not
  // a rewrite. The parse RESULT is deliberately discarded: parsing resolves
  // `synthetic` descriptors into the document, and returning that would make
  // migration of an already-current document non-identity — rewriting what a
  // host stores, moving the identity hash of every migrated import whenever
  // the schema learns a new default, and materialising derived values into
  // Architect's editor. Callers parse at their own generation boundary.
  const postValidationResult = CurrentProtocolSchema.safeParse(migrated);
  if (!postValidationResult.success) {
    throw new ValidationError(
      `Migration resulted in invalid protocol: ${postValidationResult.error.message}`,
      targetVersion,
    );
  }

  // The safeParse above just proved `migrated` is valid current-schema input;
  // the chain's own static type is a cross-version union TS cannot narrow.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return migrated as CurrentProtocolDocument;
}

export function getMigrationInfo(
  from: SchemaVersion,
  to: SchemaVersion = CURRENT_SCHEMA_VERSION,
) {
  const path = protocolMigrations.getMigrationPath(from, to);
  return {
    canMigrate: protocolMigrations.canMigrate(from, to),
    path,
    stepsRequired: path.length - 1,
    notes: protocolMigrations.getMigrationNotes(from, to),
    dependencies: protocolMigrations.getDependencies(from, to),
  };
}

export type MigrationInfo = ReturnType<typeof getMigrationInfo>;
export type MigrationNote = MigrationInfo['notes'][number];

export class ProtocolMigrator {
  private cache = new Map<string, CurrentProtocolDocument>();

  async migrate(
    document: unknown,
    options?: {
      cacheKey?: string;
      targetVersion?: SchemaVersion;
      dependencies?: Record<string, unknown>;
    },
  ): Promise<CurrentProtocolDocument> {
    const { cacheKey, targetVersion, dependencies } = options || {};

    if (cacheKey && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const migrated = migrateProtocol(document, targetVersion, dependencies);

    if (cacheKey) {
      this.cache.set(cacheKey, migrated);
    }

    return migrated;
  }

  clearCache(key?: string) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

export const protocolMigrator = new ProtocolMigrator();
