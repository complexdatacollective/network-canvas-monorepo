import type { z } from 'zod';

import type { ProtocolObjectId } from '../schemas/9/protocol-object-id.ts';
import { isStageHit, walkSchemaReferences } from './schemaReferenceWalk.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const valueAt = (
  root: unknown,
  path: readonly (string | number)[],
): unknown => {
  let value: unknown = root;
  for (const segment of path) {
    value = Array.isArray(value)
      ? value[Number(segment)]
      : isRecord(value) && Object.hasOwn(value, String(segment))
        ? value[String(segment)]
        : undefined;
  }
  return value;
};

const copyTree = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(copyTree);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, copyTree(child)]),
    );
  }
  return value;
};

/**
 * Replaces, inside `root`, every object or array reached a second time with
 * a copy of its own. A document built in code can hold one object in two
 * places (one filter rule in a skip and a panel), and giving the second
 * place a new id must leave the first as it was. `root` is changed in place.
 */
export const unshareObjects = (root: unknown): void => {
  const seen = new Set<object>();
  const visit = (container: unknown): void => {
    if (typeof container !== 'object' || container === null) return;
    seen.add(container);
    const entries: [string | number, unknown][] = Array.isArray(container)
      ? container.map((child, index) => [index, child])
      : isRecord(container)
        ? Object.entries(container)
        : [];
    for (const [key, child] of entries) {
      if (typeof child !== 'object' || child === null) continue;
      const own = seen.has(child) ? copyTree(child) : child;
      if (own !== child) {
        if (Array.isArray(container) && typeof key === 'number') {
          container[key] = own;
        } else if (isRecord(container)) {
          container[String(key)] = own;
        }
      }
      visit(own);
    }
  };
  visit(root);
};

/**
 * Gives the object at `objectPath` inside `root` the id `id`, as its first
 * key, so that an id added to an object reads like one it always had. The
 * object is changed in place: `root` must be a copy the caller owns.
 */
export const setObjectIdAt = (
  root: unknown,
  objectPath: readonly (string | number)[],
  id: ProtocolObjectId,
): void => {
  const object = valueAt(root, objectPath);
  if (!isRecord(object)) return;
  const rest = Object.entries(object).filter(([key]) => key !== 'id');
  for (const key of Object.keys(object)) delete object[key];
  object.id = id;
  for (const [key, value] of rest) object[key] = value;
};

/**
 * Renames the keys of `record` in place, keeping their order. Each entry is
 * defined rather than assigned, so a `__proto__` key stays an entry instead
 * of replacing the record's prototype.
 */
export const renameKeys = (
  record: Record<string, unknown>,
  renames: ReadonlyMap<string, string>,
): void => {
  const entries = Object.entries(record);
  for (const key of Object.keys(record)) delete record[key];
  for (const [key, value] of entries) {
    Object.defineProperty(record, renames.get(key) ?? key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
};

export const setValueAt = (
  root: unknown,
  path: readonly (string | number)[],
  value: string,
): void => {
  const container = valueAt(root, path.slice(0, -1));
  const key = path.at(-1);
  if (Array.isArray(container) && typeof key === 'number') {
    container[key] = value;
  } else if (
    isRecord(container) &&
    key !== undefined &&
    Object.hasOwn(container, String(key))
  ) {
    container[String(key)] = value;
  }
};

/**
 * Points every stage reference in `root` (every site tagged
 * `stageReference`: skip destinations, a Narrative Pedigree's
 * `sourceStageId`) at the id `rename` gives the stage it names, leaving it
 * as it is where `rename` gives none. `root` must be a copy the caller owns.
 */
export const rewriteStageReferences = (
  schema: z.ZodType,
  root: unknown,
  rename: (stageId: string) => string | undefined,
): void => {
  for (const hit of walkSchemaReferences(schema, root, {
    readAssetBlocks: false,
  }).filter(isStageHit)) {
    const renamed = rename(hit.stageId);
    if (renamed !== undefined) setValueAt(root, hit.path, renamed);
  }
};
