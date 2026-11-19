import { hash } from 'ohash';
import { v5 } from 'uuid';

import type { SessionDocument } from '../../migration/session.ts';
import {
  rewriteStageReferences,
  setObjectIdAt,
  unshareObjects,
} from '../../utils/protocolObjectIdRewrite.ts';
import { findMarkedObjects } from '../../utils/protocolObjectIds.ts';
import {
  isProtocolObjectId,
  type ProtocolObjectId,
  ProtocolObjectIdSchema,
} from './protocol-object-id.ts';
import { ProtocolStructureSchema } from './protocol-structure.ts';
import { FAMILY_PEDIGREE_BUILD_PROMPT_ID } from './stages/family-pedigree.ts';

/**
 * The UUID v5 namespace of every id the schema 8 to 9 migration creates. It
 * must never change: a different namespace gives a protocol migrated twice two
 * different sets of ids.
 */
const MIGRATION_ID_NAMESPACE = '70cb4c89-169e-42a0-a3c5-1f09048a04b1';

/** Far more names than one protocol can hold; reaching it means a defect. */
const MAX_MINT_ATTEMPTS = 1000;

export type MigrationIdMinter = {
  /** Marks an id as in use, so that nothing minted afterwards repeats it. */
  reserve: (id: string) => void;
  /**
   * The id for `name`: a UUID v5 of the seed and the name. When that id is
   * already in use, a counter is added to the name until one is free.
   */
  mint: (name: string) => ProtocolObjectId;
};

/**
 * Ids derived from `seed`, a hash of the document the migration step was
 * given, and a name describing where in the migrated document each id goes.
 * Migrating one document twice gives the same ids; two different documents
 * give different ones, so two protocols migrated separately and then
 * combined do not share ids.
 */
export const createMigrationIdMinter = (input: unknown): MigrationIdMinter => {
  const seed = hash(input);
  const taken = new Set<string>();
  return {
    reserve: (id) => {
      taken.add(id);
    },
    mint: (name) => {
      for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt += 1) {
        const id = v5(
          attempt === 0 ? `${seed}:${name}` : `${seed}:${name}:${attempt}`,
          MIGRATION_ID_NAMESPACE,
        );
        if (!taken.has(id)) {
          taken.add(id);
          return ProtocolObjectIdSchema.parse(id);
        }
      }
      throw new Error(`No free migration id for ${name}`);
    },
  };
};

type PromptIdChange = {
  /** The id, before the migration, of the stage holding the prompt. */
  stageId: string | undefined;
  oldId: string;
  newId: string;
};

/** What the id pass changed, for the sessions recorded against the protocol. */
export type MigrationIdChanges = {
  /** Each replaced stage id, mapped to the id of its first occurrence. */
  stageRenames: ReadonlyMap<string, string>;
  /** Every prompt that had a string id, in document order, replaced or not. */
  prompts: readonly PromptIdChange[];
};

const stageIndexOf = (
  path: readonly (string | number)[],
): number | undefined =>
  path[0] === 'stages' && typeof path[1] === 'number' ? path[1] : undefined;

/**
 * Gives every marked object in `document` a protocol object id that is unique
 * across it. An id that is a UUID is kept the first time it is seen; an id
 * that is missing, is not a UUID, or repeats an earlier one is replaced with
 * one minted from the object's path. Stage references that named a replaced
 * stage name its replacement. `document` is changed in place.
 */
export const assignProtocolObjectIds = (
  document: Record<string, unknown>,
  minter: MigrationIdMinter,
): MigrationIdChanges => {
  unshareObjects(document);
  const objects = findMarkedObjects(ProtocolStructureSchema, document);
  const seen = new Set<string>();
  const kept = objects.map(({ id }) => {
    const keep = id !== undefined && isProtocolObjectId(id) && !seen.has(id);
    if (id !== undefined) seen.add(id);
    return keep;
  });
  objects.forEach(({ id }, index) => {
    if (kept[index] && id !== undefined) minter.reserve(id);
  });

  const stageIds = new Map<number, string>();
  const stageRenames = new Map<string, string>();
  const occurred = new Set<string>();
  const newIds = objects.map(({ id, path, objectKind }, index) => {
    const objectPath = path.slice(0, -1);
    const stageIndex = stageIndexOf(objectPath);
    if (
      objectKind === 'stage' &&
      objectPath.length === 2 &&
      stageIndex !== undefined &&
      id !== undefined
    ) {
      stageIds.set(stageIndex, id);
    }
    if (kept[index] && id !== undefined) {
      occurred.add(id);
      return id;
    }
    const newId = minter.mint(JSON.stringify(objectPath));
    setObjectIdAt(document, objectPath, newId);
    if (objectKind === 'stage' && id !== undefined && !occurred.has(id)) {
      stageRenames.set(id, newId);
    }
    if (id !== undefined) occurred.add(id);
    return newId;
  });

  rewriteStageReferences(ProtocolStructureSchema, document, stageRenames);

  const prompts = objects.flatMap(({ id, path, objectKind }, index) => {
    const newId = newIds[index];
    if (objectKind !== 'prompt' || id === undefined || newId === undefined) {
      return [];
    }
    const stageIndex = stageIndexOf(path);
    return [
      {
        stageId:
          stageIndex === undefined ? undefined : stageIds.get(stageIndex),
        oldId: id,
        newId,
      },
    ];
  });

  return { stageRenames, prompts };
};

/**
 * Points each node's `stageId` and `promptIDs` at the ids the migration gave
 * its stage and prompts.
 *
 * A prompt id that was repeated, on two stages or on one, was replaced on
 * every occurrence after the first, so one old id can stand for several new
 * ones. A node recorded that id on the stage it names in `stageId`, so the
 * occurrence on that stage is the one it means. When no occurrence is on
 * that stage, the node records the first occurrence's id, which is the one
 * that kept or replaced the id where the protocol first used it. The id the
 * interview gives the Family Pedigree's family-building step is never a
 * prompt of the protocol, and is left as it is.
 */
export const rewriteSessionObjectIds = (
  session: SessionDocument,
  { stageRenames, prompts }: MigrationIdChanges,
): void => {
  for (const node of session.network.nodes) {
    const { stageId, promptIDs } = node;
    if (Array.isArray(promptIDs)) {
      node.promptIDs = promptIDs.map((promptId: unknown) => {
        if (
          typeof promptId !== 'string' ||
          promptId === FAMILY_PEDIGREE_BUILD_PROMPT_ID
        ) {
          return promptId;
        }
        const occurrences = prompts.filter(({ oldId }) => oldId === promptId);
        const occurrence =
          occurrences.find((candidate) => candidate.stageId === stageId) ??
          occurrences[0];
        return occurrence?.newId ?? promptId;
      });
    }
    if (typeof stageId === 'string') {
      node.stageId = stageRenames.get(stageId) ?? stageId;
    }
  }
};
