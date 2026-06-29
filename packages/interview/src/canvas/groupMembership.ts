import type { VariableOptionValue } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

/**
 * Single source of truth for deriving a node's group memberships from a
 * categorical variable. A node's value may be an array (multiple groups), a
 * scalar (one group), or null/undefined (no groups). Only string/number entries
 * are valid group keys; booleans and objects are filtered out. Both the convex
 * hull layer and the group-cohesion force derive membership through this helper
 * so they can never drift on the null/boolean/empty-array edge cases.
 */
export function getGroupKeys(
  node: NcNode,
  groupVariable: string,
): VariableOptionValue[] {
  const raw = node[entityAttributesProperty][groupVariable];
  if (raw == null) return [];

  return (Array.isArray(raw) ? raw : [raw]).filter(
    (value): value is VariableOptionValue =>
      typeof value === 'string' || typeof value === 'number',
  );
}
