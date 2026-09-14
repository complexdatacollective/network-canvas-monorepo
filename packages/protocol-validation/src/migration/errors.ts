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
