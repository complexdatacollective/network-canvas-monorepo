import type { CommitBatch, VariableConfig } from '../../../store';
import { buildParentageBatch } from './buildParentageBatch';

/**
 * Build the parent nodes/edges for an existing focal node whose parents are
 * being defined. The focal node already exists, so it is never created.
 */
export function defineParentsTransform(
  values: Record<string, unknown>,
  focalNodeId: string,
  variableConfig: VariableConfig,
): CommitBatch {
  return buildParentageBatch(focalNodeId, values, variableConfig);
}
