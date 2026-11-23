import type { z } from 'zod';

import {
  isProtocolObjectId,
  type ProtocolObjectId,
  type ProtocolObjectKind,
} from '../schemas/9/protocol-object-id.ts';
import {
  isObjectIdHit,
  type ProtocolObjectIdHit,
  walkSchemaReferences,
} from './schemaReferenceWalk.ts';

/** The `params.rule` of an issue reporting a repeated protocol object id. */
export const DUPLICATE_OBJECT_ID = 'duplicateObjectId';

export type ProtocolObjectIdLocation = {
  id: string;
  /** The path of the `id` field. */
  path: (string | number)[];
  kind: ProtocolObjectKind;
};

export type DuplicateProtocolObjectId = {
  id: string;
  /** The path of every `id` field that holds this id, in document order. */
  paths: (string | number)[][];
};

/**
 * Every object `schema` marks with `protocolObjectId`, found in `value`, in
 * document order. An object without a string id is included with `id`
 * undefined, which is how the migration finds the objects it has to give one.
 */
export const findMarkedObjects = (
  schema: z.ZodType,
  value: unknown,
): ProtocolObjectIdHit[] =>
  walkSchemaReferences(schema, value, { readAssetBlocks: false })
    .filter(isObjectIdHit)
    .map(({ kind: _kind, ...hit }) => hit);

/**
 * The id of every object `schema` marks, found in `value` (a protocol, a
 * stage or any part of one), with the path of its `id` field, in document
 * order. `value` need not be valid; an object without a string id is left
 * out.
 */
export const collectProtocolObjectIdsFromSchema = (
  schema: z.ZodType,
  value: unknown,
): ProtocolObjectIdLocation[] =>
  findMarkedObjects(schema, value).flatMap(({ id, path, objectKind }) =>
    id === undefined ? [] : [{ id, path, kind: objectKind }],
  );

const pathKey = (path: readonly (string | number)[]): string =>
  JSON.stringify(path);

type EnclosingProtocolObject = {
  id: string;
  /** The path of the object itself, not of its `id` field. */
  path: (string | number)[];
};

/**
 * For each path into `value`, the nearest object `schema` marks that contains
 * it, so a host can attach a problem to the object it belongs to rather than
 * to a position that an edit can change. `value` need not be valid.
 */
export const enclosingProtocolObjects = (
  schema: z.ZodType,
  value: unknown,
  paths: readonly (readonly (string | number)[])[],
): (EnclosingProtocolObject | undefined)[] => {
  // Keyed by the path of the object itself, so each lookup costs one probe per
  // prefix of the path instead of a scan of every object. The first object at
  // a path wins, as in document order.
  const byObjectPath = new Map<string, EnclosingProtocolObject>();
  for (const { id, path } of collectProtocolObjectIdsFromSchema(
    schema,
    value,
  )) {
    const objectPath = path.slice(0, -1);
    const key = pathKey(objectPath);
    if (!byObjectPath.has(key)) byObjectPath.set(key, { id, path: objectPath });
  }
  return paths.map((path) => {
    for (let length = path.length; length >= 0; length -= 1) {
      const object = byObjectPath.get(pathKey(path.slice(0, length)));
      if (object !== undefined) return object;
    }
    return undefined;
  });
};

/**
 * The issues, each given the id of the nearest object holding its path (see
 * `enclosingProtocolObjects`) as `objectId`, where that id is a protocol
 * object id.
 */
export const withEnclosingObjectIds = <
  Issue extends Readonly<{
    path: readonly (string | number)[];
    objectId?: ProtocolObjectId;
  }>,
>(
  schema: z.ZodType,
  value: unknown,
  issues: readonly Issue[],
): Issue[] => {
  const objects = enclosingProtocolObjects(
    schema,
    value,
    issues.map((issue) => issue.path),
  );
  return issues.map((issue, index) => {
    const id = objects[index]?.id;
    return isProtocolObjectId(id) ? { ...issue, objectId: id } : issue;
  });
};

export const groupDuplicateProtocolObjectIds = (
  locations: readonly ProtocolObjectIdLocation[],
): DuplicateProtocolObjectId[] => {
  const pathsById = new Map<string, (string | number)[][]>();
  for (const { id, path } of locations) {
    const paths = pathsById.get(id) ?? [];
    paths.push(path);
    pathsById.set(id, paths);
  }
  return [...pathsById]
    .filter(([, paths]) => paths.length > 1)
    .map(([id, paths]) => ({ id, paths }));
};

const formatPath = (path: readonly (string | number)[]): string =>
  path.join('.');

const MAX_LISTED_LOCATIONS = 5;

/**
 * Where a repeated id's locations are reported from. A stage's own check runs
 * whether the stage is parsed alone or inside a protocol, and cannot know
 * which, so it names the other locations relative to the stage and says so.
 * The protocol's check names them from the root of the protocol.
 */
type DuplicateScope = 'protocol' | 'stage';

const otherLocations = (
  paths: readonly (string | number)[][],
  path: readonly (string | number)[],
  scope: DuplicateScope,
): string => {
  // Only the first few paths are read, so the report for an id used n times
  // stays linear in n instead of naming every other location at each one.
  const listed = paths
    .slice(0, MAX_LISTED_LOCATIONS + 1)
    .filter((other) => other !== path)
    .slice(0, MAX_LISTED_LOCATIONS);
  const unlisted = paths.length - 1 - listed.length;
  const named = listed.map(formatPath).join(', ');
  const where = scope === 'stage' ? 'in this stage at' : 'at';
  return unlisted > 0
    ? `${where} ${named} and ${unlisted} more`
    : `${where} ${named}`;
};

/**
 * Adds one issue at every location of each repeated id. Each issue names up
 * to five of the other locations, so that whichever one a reader looks at,
 * they can find the rest.
 */
export const reportDuplicateProtocolObjectIds = (
  duplicates: readonly DuplicateProtocolObjectId[],
  ctx: z.RefinementCtx,
  scope: DuplicateScope,
): void => {
  for (const { id, paths } of duplicates) {
    for (const path of paths) {
      ctx.addIssue({
        code: 'custom',
        path,
        message: `The id "${id}" is also used ${otherLocations(paths, path, scope)}. Every id in a protocol must be unique.`,
        params: { rule: DUPLICATE_OBJECT_ID, id, uses: paths.length },
      });
    }
  }
};

/**
 * `schema` refined to reject a repeated protocol object id anywhere inside
 * it. Each stage schema is wrapped with it, so that a stage parsed on its own
 * is held to the same rule as a protocol. The walk reads the unrefined schema,
 * so the refinement does not run itself again.
 */
export const withUniqueObjectIds = <T extends z.ZodType>(schema: T): T =>
  schema.superRefine((value, ctx) => {
    reportDuplicateProtocolObjectIds(
      groupDuplicateProtocolObjectIds(
        collectProtocolObjectIdsFromSchema(schema, value),
      ),
      ctx,
      'stage',
    );
  });
