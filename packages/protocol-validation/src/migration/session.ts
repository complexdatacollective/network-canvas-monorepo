/**
 * Session migration: carrying the interviews recorded against a protocol
 * across the same schema migration as the protocol itself.
 *
 * A host migrates a stored protocol in place, and every session recorded
 * against it goes on pointing at the migrated protocol.
 * `migrateProtocolWithSessions` hands the host a migrator that carries each
 * session recorded against the source protocol across every step, in order:
 *
 * 1. Stage positions, which the framework handles for every step. When a step
 *    adds, removes or reorders stages, the session's stage-keyed records and
 *    resume position follow their stages, matched by id between the protocol
 *    before and after that step (`stageMovement`, `remapStageIndices`).
 * 2. Data shape, which a step that changes how a session represents its data
 *    declares as `migrateSession` beside its protocol transform (see
 *    `createMigration`). It receives the session already at the step's new
 *    stage positions.
 */
import { isEqual } from 'ohash';
import { z } from 'zod';

import {
  type NcNetwork,
  NcNetworkSchema,
  type StageMetadata,
  StageMetadataSchema,
} from '@codaco/shared-consts';

import type { SchemaVersion } from '../schemas/index.ts';
import { SessionMigrationError } from './errors.ts';

/**
 * The part of a stored interview session a migration may rewrite, as a host
 * persists it. This is the whole of what Fresco's `Interview` row and
 * Interviewer's session record hold that depends on the protocol:
 *
 * - `network`: the nodes, edges and ego collected so far (`NcNetwork`).
 * - `stageMetadata`: each stage's own record, keyed by the stage's index in
 *   the protocol's `stages` (as a decimal string). Hosts store it as nullable
 *   JSON, so `null` and `undefined` both mean "none yet".
 * - `currentStep`: the index of the stage the session resumes at. The engine
 *   appends a finish stage after the protocol's own, at index
 *   `stages.length`.
 *
 * Every other field a host keeps (timestamps, ids, progress, locale) is the
 * host's, and stays untouched. Hosts persist no prompt position: it lives only
 * in the running engine.
 *
 * Typed loosely because a stored session holds whatever its source schema
 * version wrote, which the current schema may no longer accept.
 */
export type PersistedSession = {
  network: unknown;
  stageMetadata?: unknown;
  currentStep: number;
};

/** A migrated session, valid against the current session schema. */
export type MigratedSession = {
  network: NcNetwork;
  /** Absent when the host stored none and the migration added none. */
  stageMetadata: StageMetadata | undefined;
  currentStep: number;
};

/**
 * One session as a session step sees it. The step receives its own copy and
 * may change it in place or return a new one.
 */
export type SessionDocument = {
  network: {
    nodes: Record<string, unknown>[];
    edges: Record<string, unknown>[];
    ego: Record<string, unknown>;
  };
  /** Each stage's record, keyed by the stage's index as a decimal string. */
  stageMetadata: Record<string, unknown>;
  currentStep: number;
};

/**
 * The outcome of migrating one session. A failure is returned rather than
 * thrown, so a host can migrate every session of a protocol and report every
 * failure. A host writes nothing for a protocol with any failed session: the
 * protocol and all its sessions stay as they were (see the README).
 */
export type SessionMigrationResult =
  | {
      success: true;
      session: MigratedSession;
      /** False when the migrated session is identical to the one passed in,
       * so the host can skip writing it. */
      changed: boolean;
    }
  | { success: false; error: SessionMigrationError };

/**
 * Migrates one session recorded against the source protocol of a protocol
 * migration. Pure and deterministic: the same session always gives the same
 * result, and the session passed in is never modified.
 */
export type SessionMigrator = (
  session: PersistedSession,
) => SessionMigrationResult;

/**
 * One step of a protocol migration as the chain recorded it, for the session
 * migrator: how the step moved stages, and the step's own session step, if it
 * declares one, with the protocol before and after it (frozen).
 */
export type RecordedSessionStep = {
  from: SchemaVersion;
  to: SchemaVersion;
  stages: StageMovement;
  migrateSession?: {
    run: (
      session: SessionDocument,
      protocols: { before: unknown; after: unknown },
    ) => SessionDocument;
    before: unknown;
    after: unknown;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MigratedSessionSchema = z.object({
  network: NcNetworkSchema,
  stageMetadata: StageMetadataSchema.optional(),
  currentStep: z.number().int().nonnegative(),
});

/**
 * Freezes a protocol snapshot handed to session steps, so a step that tries
 * to change it fails loudly instead of leaking into the next session.
 */
export const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const toSessionDocument = (
  session: PersistedSession,
): SessionDocument | string => {
  if (!isRecord(session)) return 'The session is not an object.';
  const { network, stageMetadata, currentStep } = session;
  if (
    !isRecord(network) ||
    !Array.isArray(network.nodes) ||
    !Array.isArray(network.edges) ||
    !isRecord(network.ego) ||
    !network.nodes.every(isRecord) ||
    !network.edges.every(isRecord)
  ) {
    return 'The session has no network of node, edge and ego records.';
  }
  if (stageMetadata !== undefined && stageMetadata !== null) {
    if (!isRecord(stageMetadata)) {
      return 'The session stage metadata is not keyed by stage.';
    }
  }
  if (!Number.isInteger(currentStep) || currentStep < 0) {
    return 'The session stage position is not a whole number.';
  }
  return structuredClone({
    network: network as SessionDocument['network'],
    stageMetadata: isRecord(stageMetadata) ? stageMetadata : {},
    currentStep,
  });
};

/** The fields a migration can change, with an absent metadata record left
 * out, so a stored `null` and a returned `undefined` compare as equal. */
const comparable = (
  network: unknown,
  stageMetadata: unknown,
  currentStep: number,
) => ({
  network,
  currentStep,
  ...(stageMetadata === undefined || stageMetadata === null
    ? {}
    : { stageMetadata }),
});

const describeIssues = (error: z.ZodError) =>
  error.issues
    .map((issue) => `${issue.path.join('.') || '(session)'}: ${issue.message}`)
    .join('; ');

/**
 * Builds the migrator for sessions recorded against a protocol migrated
 * through `steps`, each with the protocol before and after it.
 */
export const createSessionMigrator =
  (steps: readonly RecordedSessionStep[]): SessionMigrator =>
  (session) => {
    const document = toSessionDocument(session);
    if (typeof document === 'string') {
      return {
        success: false,
        error: new SessionMigrationError('invalid-session', document),
      };
    }
    const storedNoMetadata =
      session.stageMetadata === undefined || session.stageMetadata === null;

    let current = document;
    for (const step of steps) {
      if (step.stages.kind === 'unmatched') {
        return {
          success: false,
          error: new SessionMigrationError(
            'stages-unmatched',
            `The migration from version ${step.from} changed how many stages the protocol has, and its stages cannot be told apart because some have no id or share one, so the session's stage positions cannot be carried across it.`,
            { version: step.from },
          ),
        };
      }
      if (step.stages.kind === 'moved') {
        current = remapStageIndices(current, step.stages.map);
      }
      if (!step.migrateSession) continue;
      const { run, before, after } = step.migrateSession;
      try {
        current = run(current, { before, after });
      } catch (cause) {
        return {
          success: false,
          error: new SessionMigrationError(
            'step-failed',
            `Session migration step failed at version ${step.from}.`,
            { cause, version: step.from },
          ),
        };
      }
    }

    const leaveOutMetadata =
      storedNoMetadata && Object.keys(current.stageMetadata).length === 0;
    const parsed = MigratedSessionSchema.safeParse({
      network: current.network,
      stageMetadata: leaveOutMetadata ? undefined : current.stageMetadata,
      currentStep: current.currentStep,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: new SessionMigrationError(
          'invalid-result',
          `Migrated session is invalid: ${describeIssues(parsed.error)}`,
          { cause: parsed.error },
        ),
      };
    }

    const migrated: MigratedSession = {
      network: parsed.data.network,
      stageMetadata: parsed.data.stageMetadata,
      currentStep: parsed.data.currentStep,
    };
    return {
      success: true,
      session: migrated,
      changed: !isEqual(
        comparable(session.network, session.stageMetadata, session.currentStep),
        comparable(
          migrated.network,
          migrated.stageMetadata,
          migrated.currentStep,
        ),
      ),
    };
  };

/** Each stage's id, in order; `undefined` for a stage without one. */
export const stageIdsOf = (protocol: unknown): (string | undefined)[] => {
  const stages = isRecord(protocol) ? protocol.stages : undefined;
  if (!Array.isArray(stages)) return [];
  return stages.map((stage) =>
    isRecord(stage) && typeof stage.id === 'string' ? stage.id : undefined,
  );
};

const hasUniqueIds = (ids: readonly (string | undefined)[]) =>
  ids.every((id) => id !== undefined) && new Set(ids).size === ids.length;

/**
 * Where each stage of the protocol before a step is in the protocol after it.
 *
 * - `stage(i)` is the new index of the stage at old index `i`, or `undefined`
 *   if the step removed it. Indices at or past the end of the old stages (the
 *   engine's finish stage) keep their distance from the end, so the finish
 *   stage stays the finish stage.
 * - `position(i)` is where a session at old index `i` resumes: the same stage
 *   at its new index, or, if it was removed, the first stage after it that
 *   survived (the finish stage if none did). A stage the step inserted is
 *   never chosen for a session already past or on the stage it precedes.
 */
export type StageIndexMap = {
  stage: (index: number) => number | undefined;
  position: (index: number) => number;
};

/**
 * How one step moved the protocol's stages:
 *
 * - `none`: no stage moved, so nothing a session holds by stage index changes.
 * - `moved`: stages were added, removed or reordered; `map` says where each
 *   went.
 * - `unmatched`: the number of stages changed, but they cannot be matched
 *   between the two protocols because some stage has no id or shares one.
 *   Every session of the protocol fails with `stages-unmatched` rather than be
 *   guessed at.
 *
 * Stages are matched by id. Without a unique id on every stage on both sides,
 * an unchanged count is taken to mean every stage stayed where it was:
 * every step in the chain that moves stages adds or removes one, and none
 * reorders them, so a step that keeps the count keeps every position.
 */
export type StageMovement =
  | { kind: 'none' }
  | { kind: 'moved'; map: StageIndexMap }
  | { kind: 'unmatched' };

export const stageMovement = (
  beforeIds: readonly (string | undefined)[],
  afterIds: readonly (string | undefined)[],
): StageMovement => {
  const reliable = hasUniqueIds(beforeIds) && hasUniqueIds(afterIds);
  if (beforeIds.length === afterIds.length) {
    if (!reliable || beforeIds.every((id, index) => afterIds[index] === id)) {
      return { kind: 'none' };
    }
  } else if (!reliable) {
    return { kind: 'unmatched' };
  }

  const beyond = (index: number) => index - beforeIds.length + afterIds.length;
  const newIndexById = new Map(afterIds.map((id, index) => [id, index]));
  const stage = (index: number): number | undefined => {
    if (index < 0) return index;
    if (index >= beforeIds.length) return beyond(index);
    return newIndexById.get(beforeIds[index]);
  };
  const position = (index: number): number => {
    for (let next = index; next < beforeIds.length; next += 1) {
      const mapped = stage(next);
      if (mapped !== undefined) return mapped;
    }
    return index < 0 ? index : beyond(Math.max(index, beforeIds.length));
  };
  return { kind: 'moved', map: { stage, position } };
};

const STAGE_INDEX_KEY = /^(0|[1-9]\d*)$/;

/**
 * Moves a session's stage-keyed records and its resume position to where a
 * step put each stage. The record of a removed stage is dropped; a session
 * resuming at a removed stage resumes at the stage that followed it. A key
 * that is not a stage index is kept as it is.
 *
 * Everything a host persists that names a stage by index is here: the
 * `stageMetadata` keys and `currentStep`. No stage record refers to another
 * stage by index (a Narrative Pedigree finds its source pedigree by id), so
 * record values are carried unchanged.
 */
export const remapStageIndices = (
  session: SessionDocument,
  map: StageIndexMap,
): SessionDocument => {
  const stageMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(session.stageMetadata)) {
    if (!STAGE_INDEX_KEY.test(key)) {
      stageMetadata[key] = value;
      continue;
    }
    const mapped = map.stage(Number(key));
    if (mapped !== undefined) stageMetadata[String(mapped)] = value;
  }
  return {
    ...session,
    stageMetadata,
    currentStep: map.position(session.currentStep),
  };
};
