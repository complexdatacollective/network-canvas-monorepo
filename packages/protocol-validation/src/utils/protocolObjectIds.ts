import type { z } from 'zod';

import type { ProtocolObjectKind } from '../schemas/9/protocol-object-id.ts';
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
  walkSchemaReferences(schema, value)
    .filter(isObjectIdHit)
    .map(({ kind: _kind, ...hit }) => hit);

export const collectProtocolObjectIdsFromSchema = (
  schema: z.ZodType,
  value: unknown,
): ProtocolObjectIdLocation[] =>
  findMarkedObjects(schema, value).flatMap(({ id, path, objectKind }) =>
    id === undefined ? [] : [{ id, path, kind: objectKind }],
  );

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

/**
 * Adds one issue at every location of each repeated id. Each issue names the
 * other locations, so that whichever one a reader looks at, they can find the
 * rest.
 */
export const reportDuplicateProtocolObjectIds = (
  duplicates: readonly DuplicateProtocolObjectId[],
  ctx: z.RefinementCtx,
): void => {
  for (const { id, paths } of duplicates) {
    for (const path of paths) {
      const others = paths
        .filter((other) => other !== path)
        .map(formatPath)
        .join(', ');
      ctx.addIssue({
        code: 'custom',
        path,
        message: `The id "${id}" is also used at ${others}. Every id in a protocol must be unique.`,
        params: { rule: DUPLICATE_OBJECT_ID, id, paths },
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
    );
  });
