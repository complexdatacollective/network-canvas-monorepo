import { ProtocolStructureSchema } from '../schemas/9/protocol-structure.ts';
import {
  collectProtocolObjectIdsFromSchema,
  type DuplicateProtocolObjectId,
  groupDuplicateProtocolObjectIds,
  type ProtocolObjectIdLocation,
} from './protocolObjectIds.ts';

/**
 * The id of every marked object in a schema 9 protocol (see
 * `protocolObjectId`), with the path of its `id` field, in document order.
 * The protocol need not be valid; an object without a string id is left out.
 */
export const collectProtocolObjectIds = (
  protocol: unknown,
): ProtocolObjectIdLocation[] =>
  collectProtocolObjectIdsFromSchema(ProtocolStructureSchema, protocol);

/** Each id more than one object in the protocol holds, with every path. */
export const findDuplicateProtocolObjectIds = (
  protocol: unknown,
): DuplicateProtocolObjectId[] =>
  groupDuplicateProtocolObjectIds(collectProtocolObjectIds(protocol));

const pathKey = (path: readonly (string | number)[]): string =>
  JSON.stringify(path);

/**
 * For each path, the id of the nearest marked object that contains it, so a
 * host can attach a problem to the object it belongs to rather than to a
 * position that an edit can change.
 */
export const enclosingProtocolObjectIds = (
  protocol: unknown,
  paths: readonly (readonly (string | number)[])[],
): (string | undefined)[] => {
  // Keyed by the path of the object itself, so each lookup costs one probe per
  // prefix of the path instead of a scan of every object in the protocol. The
  // first object at a path wins, as in document order.
  const idByObjectPath = new Map<string, string>();
  for (const { id, path } of collectProtocolObjectIds(protocol)) {
    const key = pathKey(path.slice(0, -1));
    if (!idByObjectPath.has(key)) idByObjectPath.set(key, id);
  }
  return paths.map((path) => {
    for (let length = path.length; length >= 0; length -= 1) {
      const id = idByObjectPath.get(pathKey(path.slice(0, length)));
      if (id !== undefined) return id;
    }
    return undefined;
  });
};
