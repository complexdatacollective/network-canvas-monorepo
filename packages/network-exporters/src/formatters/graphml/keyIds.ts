import type { Codebook } from '@codaco/protocol-validation';
import {
  graphMLLabelKey,
  ncSourceUUID,
  ncTargetUUID,
  ncTypeProperty,
  ncUUIDProperty,
} from '@codaco/shared-consts';

export type GraphMLKeyTarget = 'graph' | 'node' | 'edge' | 'all';

type GraphMLBuiltInKey = {
  readonly id: string;
  readonly type: 'string';
  readonly target: GraphMLKeyTarget;
};

// Declared in every export, in this order, ahead of the codebook's variables.
export const builtInKeys: readonly GraphMLBuiltInKey[] = [
  { id: graphMLLabelKey, type: 'string', target: 'all' },
  { id: ncTypeProperty, type: 'string', target: 'all' },
  { id: ncUUIDProperty, type: 'string', target: 'all' },
  { id: ncTargetUUID, type: 'string', target: 'edge' },
  { id: ncSourceUUID, type: 'string', target: 'edge' },
];

const builtInKeyIds: ReadonlySet<string> = new Set(
  builtInKeys.map(({ id }) => id),
);

export type GraphMLKeyIds = {
  /**
   * The key id of each codebook variable whose record id is also a built-in
   * key's id (`label`). Every other variable's key id is its record id.
   */
  readonly variable: ReadonlyMap<string, string>;
  /** The key id of each attribute the codebook does not declare. */
  readonly external: ReadonlyMap<string, string>;
};

/**
 * Gives a variable whose record id is a built-in key's id a key id of its own.
 * Left alone, it would be merged into the built-in key, and its values would be
 * written under the wrong key.
 *
 * The new id is the record id followed by `_1`, `_2`, ... until it is neither a
 * built-in id nor another variable's record id, so it cannot collide with
 * either. Ids that do not collide are not changed.
 */
export const allocateVariableKeyIds = (
  codebook: Codebook,
): ReadonlyMap<string, string> => {
  const variableIds = new Set<string>();
  const addVariableIds = (variables: Record<string, unknown> | undefined) => {
    for (const id of Object.keys(variables ?? {})) variableIds.add(id);
  };
  addVariableIds(codebook.ego?.variables);
  for (const definition of Object.values(codebook.node ?? {})) {
    addVariableIds(definition.variables);
  }
  for (const definition of Object.values(codebook.edge ?? {})) {
    addVariableIds(definition.variables);
  }

  const taken = new Set([...builtInKeyIds, ...variableIds]);
  const allocated = new Map<string, string>();
  for (const id of variableIds) {
    if (!builtInKeyIds.has(id)) continue;
    let suffix = 1;
    while (taken.has(`${id}_${suffix}`)) suffix += 1;
    const keyId = `${id}_${suffix}`;
    taken.add(keyId);
    allocated.set(id, keyId);
  }
  return allocated;
};
