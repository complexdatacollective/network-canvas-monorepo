/**
 * The migration chain: the registered steps that carry a protocol document
 * forward one schema version at a time, and the machinery that walks them.
 *
 * Hosts migrate a stored protocol IN PLACE (Fresco: apps/fresco/scripts/
 * migrate-protocols.ts; Interviewer: apps/interviewer/src/lib/db/
 * migrateStoredProtocols.ts), so every interview already recorded against it
 * goes on pointing at the migrated protocol. A session refers to its protocol
 * by stage INDEX — its resume position (`currentStep`) and each stage's
 * record (`stageMetadata`, keyed by index) — and holds data collected under
 * the old codebook. So every step answers for the sessions as well as the
 * document, in two parts:
 *
 * STAGE-INDEX CHANGES ARE HANDLED BY THE FRAMEWORK. After every step, when the
 * step added, removed or reordered stages, each session's stage records and
 * resume position follow their stages, matched by id between the protocol
 * before and after that step (`stageMovement` and `remapStageIndices`,
 * session.ts). A session resumes at the same stage in its new position, or at
 * the next surviving stage when its stage was removed; a stage inserted
 * before it is not visited retroactively, and the finish position stays the
 * finish position. A step never remaps indices itself.
 *
 * A MIGRATION THAT CHANGES HOW A SESSION REPRESENTS ITS DATA MUST PROVIDE A
 * SESSION STEP. A step that re-spells a recorded answer (a scalar becoming a
 * single-element array, an option's `value` being rewritten), or changes the
 * shape of a stage's metadata, declares `migrateSession` beside `migrate`, in
 * the same `createMigration` definition. It receives each session — already
 * at the step's new stage positions — together with the protocol before and
 * after the step, and returns the session as the target version reads it.
 * Hosts run it through `migrateProtocolWithSessions` (migrate-protocol.ts),
 * which migrates a protocol and returns the migrator for the sessions
 * recorded against it, for the host to apply in the same transaction as the
 * protocol write. Neither half may be left out: a migration whose effect on
 * sessions cannot be expressed is not a migration, and belongs in the schema
 * as a rejection the researcher resolves.
 *
 * Rules ABOUT a value (validation, input control, option labels, prompt text)
 * change nothing a session holds, and need no session step.
 *
 * Session steps are pure: a function of the session and the two protocols
 * only, deterministic, and never modifying either protocol (the snapshots
 * they receive are frozen).
 *
 * Steps that change stage positions (remapped by the framework):
 * - `migrationV7toV8` drops EgoForm / AlterForm / AlterEdgeForm stages left
 *   with no fields (v8 requires at least one).
 * - `migrationV8toV9` inserts an Information stage before a Family Pedigree
 *   that had an introduction screen (schema 9's pedigree has none).
 *
 * Steps that declare a session step:
 * - `migrationV8toV9`: the redesigned pedigree keeps a different stage
 *   record, which its session step translates
 *   (schemas/9/family-pedigree-session-migration.ts).
 *
 * One exception predates session migrations and is not repaired by one:
 * `migrationV7toV8` coerces boolean and fractional ordinal/categorical option
 * values to their string form (v8 admits neither), without rewriting answers
 * already recorded with the old value. Hosts migrated their stored v7
 * protocols before session migrations existed, so a session step added now
 * would reach almost none of the sessions concerned.
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
import type { RecordedSessionStep, SessionDocument } from './session.ts';
import { deepFreeze, stageIdsOf, stageMovement } from './session.ts';

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

/**
 * How the data a session holds changes across one step. It receives a session
 * (its own copy, which it may change) whose stage records and resume position
 * already sit at the step's new stage indices, and the protocol as it was
 * before the step and as the step left it, both frozen. It returns the session
 * as the step's target version reads it. It must be pure and deterministic.
 */
export type SessionMigrationStep<
  From extends SchemaVersion,
  To extends SchemaVersion,
> = (
  session: SessionDocument,
  protocols: {
    before: ProtocolDocument<From>;
    after: ProtocolDocument<To>;
  },
) => SessionDocument;

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
  /**
   * Required of a step that changes how a session represents its data (see
   * the header). Absent, sessions pass through the step unchanged apart from
   * the stage positions the framework moves.
   */
  migrateSession?: SessionMigrationStep<From, To>;
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
  migrateSession?: SessionMigrationStep<From, To>;
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
    return this.run(document, targetVersion, dependencies, false).document;
  }

  /**
   * `migrate`, also returning, for `createSessionMigrator`, each step on the
   * path that moved stages or declares a session step: how it moved stages,
   * and its session step with the protocol before and after it, frozen.
   */
  migrateWithSessionSteps<From extends SchemaVersion, To extends SchemaVersion>(
    document: ProtocolDocument<From>,
    targetVersion: To,
    dependencies: Record<string, unknown> = {},
  ): { document: ProtocolDocument<To>; sessionSteps: RecordedSessionStep[] } {
    return this.run(document, targetVersion, dependencies, true);
  }

  private run<From extends SchemaVersion, To extends SchemaVersion>(
    document: ProtocolDocument<From>,
    targetVersion: To,
    dependencies: Record<string, unknown>,
    recordSessionSteps: boolean,
  ): { document: ProtocolDocument<To>; sessionSteps: RecordedSessionStep[] } {
    const fromVersion = document.schemaVersion;
    const sessionSteps: RecordedSessionStep[] = [];

    if ((fromVersion as SchemaVersion) === targetVersion) {
      return {
        document: document as unknown as ProtocolDocument<To>,
        sessionSteps,
      };
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

      if (!recordSessionSteps) {
        current = this.executeStep(
          current,
          migration,
          dependencies,
          targetVersion,
        );
        currentVersion = migration.to;
        continue;
      }

      // Read before the step runs, in case it changes its input in place.
      const beforeIds = stageIdsOf(current);
      const before = migration.migrateSession
        ? deepFreeze(structuredClone(current))
        : undefined;
      current = this.executeStep(
        current,
        migration,
        dependencies,
        targetVersion,
      );
      const stages = stageMovement(beforeIds, stageIdsOf(current));
      const migrateSession = migration.migrateSession;
      if (stages.kind !== 'none' || migrateSession) {
        sessionSteps.push({
          from: migration.from,
          to: migration.to,
          stages,
          ...(migrateSession
            ? {
                migrateSession: {
                  run: (session, protocols) =>
                    migrateSession(
                      session,
                      protocols as {
                        before: ProtocolDocument<SchemaVersion>;
                        after: ProtocolDocument<SchemaVersion>;
                      },
                    ),
                  before,
                  after: deepFreeze(structuredClone(current)),
                },
              }
            : {}),
        });
      }
      currentVersion = migration.to;
    }

    return { document: current as ProtocolDocument<To>, sessionSteps };
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
