import { ProtocolStructureSchema } from '../schemas/9/protocol-structure.ts';
import {
  collectProtocolObjectIdsFromSchema,
  type DuplicateProtocolObjectId,
  enclosingProtocolObjectIdsIn,
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

/**
 * For each path, the id of the nearest marked object in the protocol that
 * contains it (see `enclosingProtocolObjectIdsIn`).
 */
export const enclosingProtocolObjectIds = (
  protocol: unknown,
  paths: readonly (readonly (string | number)[])[],
): (string | undefined)[] =>
  enclosingProtocolObjectIdsIn(ProtocolStructureSchema, protocol, paths);
