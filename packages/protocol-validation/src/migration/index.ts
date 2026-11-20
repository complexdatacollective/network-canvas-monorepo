/**
 * The migration chain: the registered steps that carry a protocol document
 * forward one schema version at a time, and the machinery that walks them.
 *
 * A migration changes a protocol document only. No Network Canvas host
 * rewrites a stored interview when a protocol's schema changes, and no host
 * upgrades a stored protocol: Interviewer and Fresco migrate a protocol only
 * as it is imported, and Studio stores only the current schema version.
 */

// Import the actual protocol types for each version
import type { z } from 'zod';

import type ProtocolSchemaV7 from '../schemas/7/schema.ts';
import type ProtocolSchemaV8 from '../schemas/8/schema.ts';
import type { SchemaVersion } from '../schemas/index.ts';
import {
  MigrationNotPossibleError,
  MigrationStepError,
  VersionMismatchError,
} from './errors.ts';

// Map schema versions to their inferred types. Versions 7 and 8 have loose
// stub schemas. A complete schema is left out: a step builds its output
// without parsing it, so that output is typed by its version number alone and
// `migrateProtocol` validates it against the full schema.
type ProtocolTypeMap = {
  7: z.infer<typeof ProtocolSchemaV7>;
  8: z.infer<typeof ProtocolSchemaV8>;
};

export type ProtocolDocument<V extends SchemaVersion> =
  V extends keyof ProtocolTypeMap
    ? ProtocolTypeMap[V]
    : {
        schemaVersion: V;
        [key: string]: unknown;
      };

export type ProtocolMigration<
  From extends SchemaVersion,
  To extends SchemaVersion,
  Deps extends Record<string, unknown> = Record<string, never>,
> = {
  from: From;
  to: To;
  notes?: string;
  dependencies: Deps;
  /**
   * `targetVersion` is the version the whole chain is migrating to. A step
   * whose output depends on it reads it; it is absent when a step is run on
   * its own.
   */
  migrate: (
    doc: ProtocolDocument<From>,
    deps: Deps,
    targetVersion?: SchemaVersion,
  ) => ProtocolDocument<To>;
};

/**
 * Helper to create a migration with inferred dependency types.
 * Dependencies are defined as an object where keys are dependency names
 *
 */
export function createMigration<
  From extends SchemaVersion,
  To extends SchemaVersion,
  Deps extends Record<string, unknown>,
>(config: {
  from: From;
  to: To;
  notes?: string;
  dependencies: Deps;
  migrate: (
    doc: ProtocolDocument<From>,
    deps: Deps,
    targetVersion?: SchemaVersion,
  ) => ProtocolDocument<To>;
}): ProtocolMigration<From, To, Deps> {
  return config;
}

type AnyMigration = ProtocolMigration<
  SchemaVersion,
  SchemaVersion,
  Record<string, unknown>
>;

export class MigrationChain {
  private migrations = new Map<SchemaVersion, AnyMigration>();

  register<
    From extends SchemaVersion,
    To extends SchemaVersion,
    Deps extends Record<string, unknown>,
  >(migration: ProtocolMigration<From, To, Deps>): this {
    if (this.migrations.has(migration.from)) {
      throw new Error(
        `Migration from version ${migration.from} already registered`,
      );
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the registry erases each step's version and dependency types so one map holds them all; steps are looked up by their `from`
    this.migrations.set(migration.from, migration as unknown as AnyMigration);
    return this;
  }

  canMigrate(from: SchemaVersion, to: SchemaVersion): boolean {
    if (from === to) return true;
    if (from > to) return false;

    let current = from;
    while (current < to) {
      const migration = this.migrations.get(current);
      if (!migration) return false;
      current = migration.to;
    }

    return current === to;
  }

  /**
   * Get all dependency keys required for a migration path.
   */
  getDependencies(from: SchemaVersion, to: SchemaVersion): string[] {
    if (from >= to) return [];

    const allDeps = new Set<string>();
    let current = from;

    while (current < to) {
      const migration = this.migrations.get(current);
      if (!migration) break;
      for (const dep of Object.keys(migration.dependencies)) {
        allDeps.add(dep);
      }
      current = migration.to;
    }

    return [...allDeps];
  }

  private executeStep<From extends SchemaVersion, To extends SchemaVersion>(
    document: ProtocolDocument<From>,
    migration: ProtocolMigration<From, To, Record<string, unknown>>,
    dependencies: Record<string, unknown>,
    targetVersion: SchemaVersion,
  ): ProtocolDocument<To> {
    try {
      const result = migration.migrate(document, dependencies, targetVersion);
      return result;
    } catch (cause) {
      // Kept on `cause`: this wrapper is indistinguishable from a protocol
      // that legitimately cannot be upgraded, so without the original a host
      // reporting it as a defect has nothing to act on.
      throw new MigrationStepError(migration.from, { cause });
    }
  }

  migrate<From extends SchemaVersion, To extends SchemaVersion>(
    document: ProtocolDocument<From>,
    targetVersion: To,
    dependencies: Record<string, unknown> = {},
  ): ProtocolDocument<To> {
    const fromVersion = document.schemaVersion;

    if ((fromVersion as SchemaVersion) === targetVersion) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the document is already at the target version (checked just above), but the types cannot relate From to To
      return document as unknown as ProtocolDocument<To>;
    }

    if ((fromVersion as number) > (targetVersion as number)) {
      throw new VersionMismatchError(fromVersion, targetVersion);
    }

    // Validate that all required dependencies are provided
    const requiredDeps = this.getDependencies(fromVersion, targetVersion);
    const missingDeps = requiredDeps.filter(
      (dep) => dependencies[dep] === undefined,
    );
    if (missingDeps.length > 0) {
      throw new Error(
        `Missing required migration dependencies: ${missingDeps.join(', ')}`,
      );
    }

    let current = document as ProtocolDocument<SchemaVersion>;
    let currentVersion: SchemaVersion = fromVersion;

    while (currentVersion < targetVersion) {
      const migration = this.migrations.get(currentVersion);
      if (!migration) {
        throw new MigrationNotPossibleError(currentVersion, targetVersion);
      }
      current = this.executeStep(
        current,
        migration,
        dependencies,
        targetVersion,
      );
      currentVersion = migration.to;
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the loop runs until the version reaches To; the version is a runtime value the types cannot follow
    return current as ProtocolDocument<To>;
  }

  getMigrationPath(from: SchemaVersion, to: SchemaVersion): SchemaVersion[] {
    if (from === to) return [from];
    if (from > to) return [];

    const path: SchemaVersion[] = [from];
    let current = from;

    while (current < to) {
      const migration = this.migrations.get(current);
      if (!migration) return [];
      path.push(migration.to);
      current = migration.to;
    }

    return current === to ? path : [];
  }

  getMigrationNotes(
    from: SchemaVersion,
    to: SchemaVersion,
  ): { version: SchemaVersion; notes: string }[] {
    if (from >= to) return [];

    const notes: { version: SchemaVersion; notes: string }[] = [];
    let current = from;

    while (current < to) {
      const migration = this.migrations.get(current);
      if (!migration) break;
      if (migration.notes) {
        notes.push({ version: migration.to, notes: migration.notes });
      }
      current = migration.to;
    }

    return notes;
  }
}
