import type { SchemaVersion } from '../schemas/index.ts';
import type { ProtocolValidationIssue } from '../validation/validate-protocol.ts';
import type { RefusedContentProblem } from './refusedContent.ts';

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
 *
 * `issues` names each place that failed in the migrated document. When every
 * one of them is content the migration copies from the protocol and may not
 * invent, the more specific `MigrationContentRefusedError` is thrown instead.
 */
export class MigrationResultInvalidError extends MigrationError {
  readonly targetVersion: number;
  /**
   * Why the result is refused, where the schema said: each issue, so a host
   * can explain one it has words for, such as two options that read the same.
   */
  readonly issues: readonly ProtocolValidationIssue[];

  constructor(
    message: string,
    targetVersion: number,
    issues: readonly ProtocolValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'MigrationResultInvalidError';
    this.targetVersion = targetVersion;
    this.issues = issues;
  }
}

/**
 * The migrated document is invalid only because the protocol left empty
 * content that the target schema requires and a migration may not invent: a
 * prompt or question, an ordinal or categorical option's value, or a node
 * type, edge type or attribute name (see `findRefusedContent` for how that is
 * decided).
 *
 * A fact about the researcher's file, not a fault in the migration: they
 * correct it in the version of Architect that made the protocol, then open it
 * again. `problems` says where each one is, in words they can follow there.
 * Still a `MigrationResultInvalidError`, with the same `issues`.
 */
export class MigrationContentRefusedError extends MigrationResultInvalidError {
  readonly problems: readonly RefusedContentProblem[];

  constructor(
    message: string,
    targetVersion: number,
    issues: readonly ProtocolValidationIssue[],
    problems: readonly RefusedContentProblem[],
  ) {
    super(message, targetVersion, issues);
    this.name = 'MigrationContentRefusedError';
    this.problems = problems;
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
