import migrationV1toV2 from '../schemas/2/migration.ts';
import migrationV2toV3 from '../schemas/3/migration.ts';
import migrationV3toV4 from '../schemas/4/migration.ts';
import migrationV4toV5 from '../schemas/5/migration.ts';
import migrationV5toV6 from '../schemas/6/migration.ts';
import migrationV6toV7 from '../schemas/7/migration.ts';
import migrationV7toV8 from '../schemas/8/migration.ts';
import migrationV8toV9 from '../schemas/9/migration.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocol,
  type Protocol,
  type SchemaVersion,
  SchemaVersionSchema,
  type VersionedProtocol,
  VersionedProtocolSchema,
} from '../schemas/index.ts';
import { findPrototypeCodebookKeys } from '../validation/prototypeCodebookKeys.ts';
import { formatProtocolValidationIssues } from '../validation/validate-protocol.ts';
import {
  MigrationResultInvalidError,
  SchemaVersionDetectionError,
  ValidationError,
  VersionMismatchError,
} from './errors.ts';
import { type ProtocolDocument, protocolMigrations } from './index.ts';
import {
  createSessionMigrator,
  type RecordedSessionStep,
  type SessionMigrator,
} from './session.ts';

protocolMigrations.register(migrationV1toV2);
protocolMigrations.register(migrationV2toV3);
protocolMigrations.register(migrationV3toV4);
protocolMigrations.register(migrationV4toV5);
protocolMigrations.register(migrationV5toV6);
protocolMigrations.register(migrationV6toV7);
protocolMigrations.register(migrationV7toV8);
protocolMigrations.register(migrationV8toV9);

/** The versions a document can be validated at, and so migrated to. */
type ValidatedSchemaVersion = VersionedProtocol['schemaVersion'];

export function detectSchemaVersion(document: unknown): SchemaVersion {
  let coerced: unknown;
  try {
    const rawVersion = (document as { schemaVersion?: unknown })?.schemaVersion;

    // Handle v1 string schemaVersion ("1" -> 1)
    coerced = typeof rawVersion === 'string' ? Number(rawVersion) : rawVersion;
  } catch {
    throw new SchemaVersionDetectionError();
  }

  const partial = SchemaVersionSchema.safeParse(coerced);
  if (partial.success) {
    return partial.data;
  }
  // A version this build has never heard of, but that a later one would
  // recognise, is a file made by newer software — not a file without a version.
  if (Number.isInteger(coerced) && Number(coerced) > CURRENT_SCHEMA_VERSION) {
    throw new VersionMismatchError(Number(coerced), CURRENT_SCHEMA_VERSION);
  }
  throw new SchemaVersionDetectionError();
}

function migrateAndValidate(
  document: unknown,
  targetVersion: ValidatedSchemaVersion,
  dependencies: Record<string, unknown>,
  recordSessionSteps: boolean,
): { protocol: VersionedProtocol; sessionSteps: RecordedSessionStep[] } {
  const detectedVersion = detectSchemaVersion(document);

  // Every schema parse below would drop a `__proto__` codebook id unseen, so
  // the document is checked for one at every version, before any of them.
  const prototypeKeyIssues = findPrototypeCodebookKeys(document);
  if (prototypeKeyIssues.length > 0) {
    throw new ValidationError(
      `Invalid protocol document for version ${detectedVersion}: ${formatProtocolValidationIssues(prototypeKeyIssues)}`,
      detectedVersion,
    );
  }

  // Only pre-validate versions that have Zod schemas (7+)
  if (detectedVersion >= 7) {
    const preValidationResult = VersionedProtocolSchema.safeParse(document);
    if (!preValidationResult.success) {
      throw new ValidationError(
        `Invalid protocol document for version ${detectedVersion}: ${preValidationResult.error.message}`,
        detectedVersion,
      );
    }
  }

  // Ensure schemaVersion is numeric before passing to migration chain
  const normalizedDocument = {
    ...(document as Record<string, unknown>),
    schemaVersion: detectedVersion,
  };

  // Perform migration
  const { document: migrated, sessionSteps } = recordSessionSteps
    ? protocolMigrations.migrateWithSessionSteps(
        normalizedDocument as ProtocolDocument<SchemaVersion>,
        targetVersion,
        dependencies,
      )
    : {
        document: protocolMigrations.migrate(
          normalizedDocument as ProtocolDocument<SchemaVersion>,
          targetVersion,
          dependencies,
        ),
        sessionSteps: [],
      };

  // Validated against the schema of the version it was migrated to, which the
  // version-discriminated union picks from the document's own `schemaVersion`.
  // That field is written by the migration steps, so it is checked against the
  // target too: a step that forgot to set it would otherwise be validated
  // against its input's rules.
  const postValidationResult = VersionedProtocolSchema.safeParse(migrated);
  if (!postValidationResult.success) {
    // Not a `ValidationError`: the input passed its own version's checks above,
    // so this says a migration of ours returned something invalid. Hosts use
    // the distinction to decide what belongs in exception tracking.
    throw new MigrationResultInvalidError(
      `Migration resulted in invalid protocol: ${postValidationResult.error.message}`,
      targetVersion,
    );
  }
  if (postValidationResult.data.schemaVersion !== targetVersion) {
    throw new MigrationResultInvalidError(
      `Migration to version ${targetVersion} resulted in a version ${postValidationResult.data.schemaVersion} protocol`,
      targetVersion,
    );
  }

  return { protocol: postValidationResult.data, sessionSteps };
}

export function migrateProtocol(
  document: unknown,
  targetVersion?: typeof CURRENT_SCHEMA_VERSION,
  dependencies?: Record<string, unknown>,
): CurrentProtocol;
export function migrateProtocol<V extends ValidatedSchemaVersion>(
  document: unknown,
  targetVersion: V,
  dependencies?: Record<string, unknown>,
): Protocol<V>;
export function migrateProtocol(
  document: unknown,
  targetVersion: ValidatedSchemaVersion = CURRENT_SCHEMA_VERSION,
  dependencies: Record<string, unknown> = {},
): VersionedProtocol {
  return migrateAndValidate(document, targetVersion, dependencies, false)
    .protocol;
}

/**
 * A migrated protocol, and the migrator for the sessions recorded against the
 * protocol it was migrated from.
 */
export type ProtocolWithSessionMigrator<P extends VersionedProtocol> = {
  protocol: P;
  /**
   * Carries one session recorded against the source protocol to the migrated
   * one: its stage metadata and resume position follow their stages, and any
   * data the migration re-spells is rewritten. Pure, so a host may call it
   * for each of its sessions, in any order, inside the transaction that
   * writes the protocol. A session that cannot be migrated is reported in the
   * result, never thrown; if any session fails, the host writes neither the
   * protocol nor any of its sessions.
   */
  migrateSession: SessionMigrator;
};

/**
 * `migrateProtocol` for a host that stores sessions against its protocols:
 * migrates the protocol exactly as `migrateProtocol` does, throwing the same
 * errors, and returns it together with the migrator for its sessions. When the
 * protocol is already at the target version the migrator only validates each
 * session against the current session schema.
 */
export function migrateProtocolWithSessions(
  document: unknown,
  targetVersion?: typeof CURRENT_SCHEMA_VERSION,
  dependencies?: Record<string, unknown>,
): ProtocolWithSessionMigrator<CurrentProtocol>;
export function migrateProtocolWithSessions<V extends ValidatedSchemaVersion>(
  document: unknown,
  targetVersion: V,
  dependencies?: Record<string, unknown>,
): ProtocolWithSessionMigrator<Protocol<V>>;
export function migrateProtocolWithSessions(
  document: unknown,
  targetVersion: ValidatedSchemaVersion = CURRENT_SCHEMA_VERSION,
  dependencies: Record<string, unknown> = {},
): ProtocolWithSessionMigrator<VersionedProtocol> {
  const { protocol, sessionSteps } = migrateAndValidate(
    document,
    targetVersion,
    dependencies,
    true,
  );
  return { protocol, migrateSession: createSessionMigrator(sessionSteps) };
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

type MigratorOptions = {
  cacheKey?: string;
  dependencies?: Record<string, unknown>;
};

export class ProtocolMigrator {
  // One caller key can be migrated to several versions; each result is kept.
  private cache = new Map<
    string,
    Map<ValidatedSchemaVersion, VersionedProtocol>
  >();

  migrate(
    document: unknown,
    options?: MigratorOptions & {
      targetVersion?: typeof CURRENT_SCHEMA_VERSION;
    },
  ): Promise<CurrentProtocol>;
  migrate<V extends ValidatedSchemaVersion>(
    document: unknown,
    options: MigratorOptions & { targetVersion: V },
  ): Promise<Protocol<V>>;
  async migrate(
    document: unknown,
    options: MigratorOptions & { targetVersion?: ValidatedSchemaVersion } = {},
  ): Promise<VersionedProtocol> {
    const {
      cacheKey,
      targetVersion = CURRENT_SCHEMA_VERSION,
      dependencies,
    } = options;

    const cached =
      cacheKey === undefined
        ? undefined
        : this.cache.get(cacheKey)?.get(targetVersion);
    if (cached) return cached;

    const migrated = migrateProtocol(document, targetVersion, dependencies);

    if (cacheKey) {
      const variants =
        this.cache.get(cacheKey) ??
        new Map<ValidatedSchemaVersion, VersionedProtocol>();
      variants.set(targetVersion, migrated);
      this.cache.set(cacheKey, variants);
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
