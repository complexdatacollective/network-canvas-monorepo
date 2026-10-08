import type { SchemaVersion } from '../schemas/index.ts';

export class MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MigrationError';
  }
}

export class MigrationNotPossibleError extends MigrationError {
  constructor(from: number, to: number) {
    super(`Migration to this version is not possible (${from} -> ${to}).`);
    this.name = 'MigrationNotPossibleError';
  }
}

export class VersionMismatchError extends MigrationError {
  constructor(from: number, to: number) {
    super(
      `Nonsensical migration path (${from} -> ${to}). Source version must be lower than target version.`,
    );
    this.name = 'VersionMismatchError';
  }
}

export class MigrationStepError extends MigrationError {
  constructor(version: number, options?: { cause?: unknown }) {
    super(`Migration step failed at version ${version}.`, options);
    this.name = 'MigrationStepError';
  }
}

/**
 * A migration ran and returned a document that does not satisfy the schema it
 * targeted.
 *
 * Separate from `ValidationError`, which the same function throws when the
 * *researcher's* document fails the checks for its own version. The two read
 * identically at the throw site and mean opposite things: one is a fact about
 * the file, the other is a migration that produced garbage. A host that cannot
 * tell them apart either reports every old protocol as a bug, or — worse —
 * reports none of its own broken migrations.
 */
export class MigrationResultInvalidError extends MigrationError {
  readonly targetVersion: number;

  constructor(message: string, targetVersion: number) {
    super(message);
    this.name = 'MigrationResultInvalidError';
    this.targetVersion = targetVersion;
  }
}

export class SchemaVersionDetectionError extends MigrationError {
  constructor() {
    super('Unable to detect schema version from document');
    this.name = 'SchemaVersionDetectionError';
  }
}

export class ValidationError extends MigrationError {
  constructor(message: string, version?: SchemaVersion) {
    super(
      version
        ? `Validation failed for version ${version}: ${message}`
        : `Validation failed: ${message}`,
    );
    this.name = 'ValidationError';
  }
}

/**
 * Why one stored session could not be carried across a protocol migration.
 *
 * - `invalid-session`: what the host passed is not a session at all (no
 *   network with node, edge and ego records, metadata that is not keyed by
 *   stage, a stage position that is not a whole number).
 * - `step-failed`: a session step threw. `version` is the schema version the
 *   failing step migrates from, and the step's own error is kept on `cause`.
 * - `invalid-result`: the migrated session does not satisfy the current
 *   session schema. A session that was already damaged before the migration
 *   ends here too, because its source version has no schema to check it with.
 *
 * Returned, never thrown, by a session migrator: one bad session is the host's
 * to report and leave in place, and must not abort the protocol migration it
 * belongs to.
 */
export type SessionMigrationFailure =
  | 'invalid-session'
  | 'step-failed'
  | 'invalid-result';

export class SessionMigrationError extends MigrationError {
  readonly reason: SessionMigrationFailure;
  readonly version: SchemaVersion | undefined;

  constructor(
    reason: SessionMigrationFailure,
    message: string,
    options?: { cause?: unknown; version?: SchemaVersion },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'SessionMigrationError';
    this.reason = reason;
    this.version = options?.version;
  }
}
