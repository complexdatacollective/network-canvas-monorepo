import {
  type CodebookIdRenames,
  rewriteCodebookIds,
} from '../../utils/codebookIdRewrite.ts';
import {
  createEntityTypeId,
  createVariableId,
  isEntityTypeId,
  isVariableId,
} from './codebook-ids.ts';
import { ProtocolStructureSchema } from './protocol-structure.ts';

/**
 * Gives the node types, edge types and variables of a schema 9 protocol
 * document the ids `renames` names, and points every reference to each at
 * its new id (see `rewriteCodebookIds`). For a host or a generator holding a
 * document written with readable keys. `document` is changed in place.
 */
export const renameCodebookIds = (
  document: Record<string, unknown>,
  renames: CodebookIdRenames,
): void => {
  rewriteCodebookIds(ProtocolStructureSchema, document, renames);
};

/**
 * Gives each node type, edge type and variable in `document`'s codebook whose
 * key is not already a UUID a new random id, and points every reference to
 * each at its new id. A key that is a UUID is kept, because data the
 * migration cannot rewrite, such as a roster file bundled with the protocol,
 * may name a variable by it. Variable ids must be unique across the
 * codebook, so a UUID variable key used by more than one entity is kept by
 * the first in codebook order (node types, then edge types, then the ego)
 * and each other entity's variable gets a new id. A readable variable key
 * used by two entities gives each its own id. `document` is changed in
 * place.
 */
export const assignCodebookIds = (document: Record<string, unknown>) => {
  const keptVariableIds = new Set<string>();
  renameCodebookIds(document, {
    typeId: (typeId) =>
      isEntityTypeId(typeId) ? typeId : createEntityTypeId(),
    variableId: (variableId) => {
      if (!isVariableId(variableId) || keptVariableIds.has(variableId)) {
        return createVariableId();
      }
      keptVariableIds.add(variableId);
      return variableId;
    },
  });
};
