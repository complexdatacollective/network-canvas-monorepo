import {
  rewriteStageReferences,
  setObjectIdAt,
  unshareObjects,
} from '../../utils/protocolObjectIdRewrite.ts';
import { findMarkedObjects } from '../../utils/protocolObjectIds.ts';
import { createProtocolObjectId } from './protocol-object-id.ts';
import { ProtocolStructureSchema } from './protocol-structure.ts';

/**
 * Gives every marked object in `document` a new protocol object id, whatever
 * id it had before. Each stage reference names the new id of the stage it
 * named; where one id was on several stages, it names the first of them.
 * `document` is changed in place.
 */
export const assignProtocolObjectIds = (document: Record<string, unknown>) => {
  unshareObjects(document);
  const stageRenames = new Map<string, string>();
  for (const { id, path, objectKind } of findMarkedObjects(
    ProtocolStructureSchema,
    document,
  )) {
    const newId = createProtocolObjectId();
    setObjectIdAt(document, path.slice(0, -1), newId);
    if (objectKind === 'stage' && id !== undefined && !stageRenames.has(id)) {
      stageRenames.set(id, newId);
    }
  }
  rewriteStageReferences(ProtocolStructureSchema, document, stageRenames);
};
