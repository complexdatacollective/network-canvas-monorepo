/**
 * The migration chain: the registered steps that carry a protocol document
 * forward one schema version at a time, and the machinery that walks them.
 *
 * TWO INVARIANTS BIND EVERY RULE A MIGRATION STEP MAY APPLY. Neither can be
 * checked by the schema the output is validated against, because both are
 * about the relationship between the document that went IN and the one that
 * comes out — and both exist because a protocol is migrated underneath
 * interviews that have already collected data against it.
 *
 * 1. A migration never adds, removes, or reorders stages. Fresco migrates its
 *    stored protocols IN PLACE (`prisma.protocol.update` keyed by the existing
 *    row id — apps/fresco/scripts/migrate-protocols.ts), so every
 *    in-progress interview goes on pointing at the same protocol row
 *    afterwards, and a session's resume position is a stage INDEX
 *    (`Interview.currentStep`) into that protocol's `stages`. A step that
 *    inserted, dropped, or moved a stage would silently resume a part-finished
 *    interview somewhere other than where its participant left it. Any host
 *    that migrates a stored protocol is held to the same contract: it points
 *    the sessions it already has at the migrated protocol rather than starting
 *    them over.
 *
 * 2. A migration never changes the shape of a collected answer value. That
 *    same in-place update rewrites the codebook while leaving every interview's
 *    already-collected network exactly as it was — no host rewrites the data a
 *    session holds when the protocol behind it moves forward. So a value
 *    recorded under the old codebook has to still read correctly under the new
 *    one: re-spelling how an answer is stored — a scalar becoming a
 *    single-element array, an option's `value` being rewritten — reinterprets
 *    data that has already been gathered. Rules ABOUT a value (validation,
 *    input control, option labels, prompt text) are fair game; the recorded
 *    value itself is not.
 *
 * A repair that cannot be made without breaking one of these is not a
 * migration. It belongs in the schema, as a rejection the researcher is told
 * about and resolves themselves — and a rule that MUST break one forces the
 * host-side handling to be redesigned in the same change.
 *
 * The exceptions that do exist are all the same forced choice, where the
 * target schema cannot express the old shape AT ALL and the alternative is
 * refusing to migrate the protocol: `migrationV7toV8` drops EgoForm /
 * AlterForm / AlterEdgeForm stages left with no fields (v8 requires at least
 * one) and coerces boolean and fractional ordinal/categorical option values to
 * their string form (v8 admits neither). Neither is licence to touch a stage or
 * a value the target schema could have represented.
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

// Map schema versions to their inferred types
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
  migrate: (doc: ProtocolDocument<From>, deps: Deps) => ProtocolDocument<To>;
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
  migrate: (doc: ProtocolDocument<From>, deps: Deps) => ProtocolDocument<To>;
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
  ): ProtocolDocument<To> {
    try {
      const result = migration.migrate(document, dependencies);
      return result;
    } catch (_error) {
      throw new MigrationStepError(migration.from);
    }
  }

  migrate<From extends SchemaVersion, To extends SchemaVersion>(
    document: ProtocolDocument<From>,
    targetVersion: To,
    dependencies: Record<string, unknown> = {},
  ): ProtocolDocument<To> {
    const fromVersion = document.schemaVersion;

    if ((fromVersion as SchemaVersion) === targetVersion) {
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

      current = this.executeStep(current, migration, dependencies);
      currentVersion = migration.to;
    }

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

export const protocolMigrations = new MigrationChain();
