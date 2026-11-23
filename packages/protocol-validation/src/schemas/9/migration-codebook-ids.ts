import {
  type CodebookIdRenames,
  rewriteCodebookIds,
} from '../../utils/codebookIdRewrite.ts';
import { createEntityTypeId, createVariableId } from './codebook-ids.ts';
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
 * Gives every node type, edge type and variable in `document`'s codebook a
 * new id, whatever key it had before, and points every reference to each at
 * its new id. A variable key used by two entities gives each its own id.
 * `document` is changed in place.
 */
export const assignCodebookIds = (document: Record<string, unknown>) => {
  renameCodebookIds(document, {
    typeId: () => createEntityTypeId(),
    variableId: () => createVariableId(),
  });
};
