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

const isPrefix = (
  prefix: readonly (string | number)[],
  path: readonly (string | number)[],
): boolean =>
  prefix.length <= path.length &&
  prefix.every((segment, index) => segment === path[index]);

/**
 * For each path, the id of the nearest marked object that contains it, so a
 * host can attach a problem to the object it belongs to rather than to a
 * position that an edit can change.
 */
export const enclosingProtocolObjectIds = (
  protocol: unknown,
  paths: readonly (readonly (string | number)[])[],
): (string | undefined)[] => {
  const objects = collectProtocolObjectIds(protocol).map(({ id, path }) => ({
    id,
    objectPath: path.slice(0, -1),
  }));
  return paths.map((path) => {
    let nearest: { id: string; objectPath: (string | number)[] } | undefined;
    for (const object of objects) {
      if (
        isPrefix(object.objectPath, path) &&
        (nearest === undefined ||
          object.objectPath.length > nearest.objectPath.length)
      ) {
        nearest = object;
      }
    }
    return nearest?.id;
  });
};
