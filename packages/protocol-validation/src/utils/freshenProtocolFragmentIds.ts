import { z } from 'zod';

import {
  createProtocolObjectId,
  isProtocolObjectId,
  type ProtocolObjectId,
} from '../schemas/9/protocol-object-id.ts';
import { stageSchema } from '../schemas/9/stages/index.ts';
import {
  rewriteStageReferences,
  setObjectIdAt,
  unshareObjects,
} from './protocolObjectIdRewrite.ts';
import { findMarkedObjects } from './protocolObjectIds.ts';

export type FreshenedProtocolFragment<T> = {
  fragment: T;
  /**
   * Each id that was replaced, mapped to the id that replaced its first
   * occurrence in the fragment.
   */
  idMap: Map<string, ProtocolObjectId>;
};

const stagesSchema = z.array(stageSchema);

/**
 * A copy of `fragment` (a stage, an array of stages, or any part of a
 * protocol described by `schema`) that can be added to a protocol whose
 * object ids are `destinationIds` without repeating one. An id is kept when
 * it is a UUID that neither the destination nor an earlier object in the
 * fragment holds; every other id, and every missing one, is replaced with a
 * new random id. Stage references inside the fragment that named a replaced
 * stage name its replacement. `fragment` is not changed.
 */
export const freshenProtocolFragmentIds = <T>(
  fragment: T,
  destinationIds: Iterable<string>,
  schema: z.ZodType = Array.isArray(fragment) ? stagesSchema : stageSchema,
): FreshenedProtocolFragment<T> => {
  const taken = new Set<string>(destinationIds);
  const idMap = new Map<string, ProtocolObjectId>();
  const stageRenames = new Map<string, string>();
  const copy = structuredClone(fragment);
  unshareObjects(copy);

  const seen = new Set<string>();
  const seenOnStages = new Set<string>();
  for (const { id, path, objectKind } of findMarkedObjects(schema, copy)) {
    const firstOccurrence = id !== undefined && !seen.has(id);
    // A stage reference only ever names a stage, so an earlier prompt or rule
    // holding the same id must not stop the stage's rename being recorded.
    const firstStageOccurrence =
      objectKind === 'stage' && id !== undefined && !seenOnStages.has(id);
    if (id !== undefined) seen.add(id);
    if (objectKind === 'stage' && id !== undefined) seenOnStages.add(id);
    if (id !== undefined && isProtocolObjectId(id) && !taken.has(id)) {
      taken.add(id);
      continue;
    }
    // A random UUID never repeats one already taken in practice.
    const fresh = createProtocolObjectId();
    taken.add(fresh);
    setObjectIdAt(copy, path.slice(0, -1), fresh);
    if (id !== undefined && firstOccurrence) idMap.set(id, fresh);
    if (id !== undefined && firstStageOccurrence) stageRenames.set(id, fresh);
  }

  rewriteStageReferences(schema, copy, stageRenames);
  return { fragment: copy, idMap };
};
