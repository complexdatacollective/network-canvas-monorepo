import type { Variable } from '@codaco/protocol-validation';
import {
  graphMLLabelKey,
  ncSourceUUID,
  ncTargetUUID,
  ncTypeProperty,
  ncUUIDProperty,
} from '@codaco/shared-consts';

import { sha1 } from './helpers';

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

export type GraphMLKeyIds = {
  /**
   * The key id of each column of a codebook variable, in the order
   * `variableExportColumnEntries` lists them, looked up by the variable's
   * record in the codebook.
   */
  readonly variable: ReadonlyMap<Variable, readonly string[]>;
  /** The key id of each attribute the codebook does not declare. */
  readonly external: ReadonlyMap<string, string>;
};

/**
 * Hands out key ids so that no two keys share one, built-in keys included.
 *
 * Every key asks for the id it would have on its own: a built-in key its
 * name, a variable column its record id (with a suffix for each column of a
 * categorical or layout variable), an attribute the codebook does not declare
 * the SHA-1 of its name. The first key to ask gets the id. A later one gets
 * that id followed by `_1`, `_2`, ..., or, for an undeclared attribute, the
 * SHA-1 of a salted name; either way an id no key asked for, so a moved key
 * never takes another key's own id.
 */
export const createKeyIdAllocator = (requested: Iterable<string>) => {
  const wanted = new Set(requested);
  const given = new Set<string>();
  const isFree = (id: string) => !given.has(id) && !wanted.has(id);
  const give = (id: string) => {
    given.add(id);
    return id;
  };

  return {
    keyId: (preferred: string): string => {
      if (!given.has(preferred)) return give(preferred);
      let suffix = 1;
      while (!isFree(`${preferred}_${suffix}`)) suffix += 1;
      return give(`${preferred}_${suffix}`);
    },
    externalKeyId: async (
      attribute: string,
      preferred: string,
    ): Promise<string> => {
      if (!given.has(preferred)) return give(preferred);
      const maximumAttempts = given.size + wanted.size + 1;
      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        const candidate = await sha1(`external:${attempt}:${attribute}`);
        if (isFree(candidate)) return give(candidate);
      }
      throw new Error(
        `Could not generate a unique GraphML key for external attribute: ${attribute}`,
      );
    },
  };
};
