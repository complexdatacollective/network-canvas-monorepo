import {
  collectProtocolObjectIdsFromSchema,
  deterministicEntityTypeId,
  deterministicProtocolObjectId,
  deterministicVariableId,
  type ProtocolObjectId,
  renameCodebookIds,
  stageSchema,
} from '@codaco/protocol-validation';

// The namespace of every id Sketch gives a protocol object. It must never
// change: a different namespace gives a design compiled again a different
// set of ids.
const SKETCH_ID_NAMESPACE = '4c3f0f7e-5a2b-4d8e-9b61-0f2a7d9c3e15';

const sketchObjectId = deterministicProtocolObjectId(SKETCH_ID_NAMESPACE);
const typeIdIn = deterministicEntityTypeId(SKETCH_ID_NAMESPACE);
const variableIdIn = deterministicVariableId(SKETCH_ID_NAMESPACE);

/**
 * The id of the stage the compiler names `name` (a design stage's id, or a
 * name such as `consent` or `finish` for a stage the compiler adds). The
 * compiler names each stage once, so compiling one design twice gives the
 * same stage ids.
 */
export const sketchStageId = (name: string): ProtocolObjectId =>
  sketchObjectId(`stage:${name}`);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Replaces the id of every marked object inside `stages` other than a stage
 * with one named by the object's stage and its place in that stage. The
 * compiler gives these objects readable ids that repeat from stage to stage
 * (every stage's first prompt is `p1`) and copies filters into several
 * places, so the ids are only made unique here, once the stages are built.
 * Stage ids, which skip logic and the Narrative Pedigree refer to, are left
 * as they are.
 */
export const assignNestedObjectIds = (
  stages: readonly Record<string, unknown>[],
): void => {
  for (const stage of stages) {
    for (const { path, kind } of collectProtocolObjectIdsFromSchema(
      stageSchema,
      stage,
    )) {
      if (kind === 'stage') continue;
      const key = path.at(-1);
      let holder: unknown = stage;
      for (const segment of path.slice(0, -1)) {
        holder = isObject(holder) ? Reflect.get(holder, segment) : undefined;
      }
      if (isObject(holder) && key !== undefined) {
        Reflect.set(
          holder,
          key,
          sketchObjectId(`${String(stage.id)}${JSON.stringify(path)}`),
        );
      }
    }
  }
};

/** The id of the node or edge type the compiler keys `key`. */
export const sketchTypeId = (key: string) => typeIdIn(`type:${key}`);

/** The id of the variable the compiler keys `key`. */
export const sketchVariableId = (key: string) =>
  variableIdIn(`variable:${key}`);

const sketchLayoutId = (key: string) => variableIdIn(`layout:${key}`);

/**
 * A source map path (`codebook.<entity>.<type>` or one that goes on to
 * `.variables.<variable>`, or `codebook.layouts.<layout>`) with the ids its
 * keys were given.
 */
const renamedSourcePath = (path: string): string => {
  const segments = path.split('.');
  if (segments[0] !== 'codebook') return path;
  if (segments[1] === 'layouts') {
    return segments
      .map((segment, index) =>
        index === 2 ? sketchLayoutId(segment) : segment,
      )
      .join('.');
  }
  const ego = segments[1] === 'ego';
  const variableAt = ego ? 3 : 4;
  return segments
    .map((segment, index) => {
      if (index === 2 && !ego) return sketchTypeId(segment);
      if (index === variableAt && segments[variableAt - 1] === 'variables')
        return sketchVariableId(segment);
      return segment;
    })
    .join('.');
};

/**
 * Gives every node type, edge type, variable and layout of `protocol` a UUID named
 * by the readable key the compiler gave it, so compiling one design twice
 * gives the same ids, and returns `sourceMap` with its codebook paths
 * renamed to match. The compiler claims every key once across the whole
 * codebook, so a key alone names its id. `protocol` is changed in place.
 */
export const assignCodebookIds = (
  protocol: Record<string, unknown>,
  sourceMap: ReadonlyMap<string, string>,
): Map<string, string> => {
  renameCodebookIds(protocol, {
    typeId: sketchTypeId,
    layoutId: sketchLayoutId,
    variableId: sketchVariableId,
  });
  return new Map(
    [...sourceMap].map(([path, source]) => [renamedSourcePath(path), source]),
  );
};

// Variable types whose options text chooses wording by, and which so give
// each option an id.
const OPTION_ID_VARIABLE_TYPES: ReadonlySet<unknown> = new Set([
  'categorical',
  'ordinal',
]);

/**
 * Gives every option of a categorical or ordinal variable of `protocol` an
 * id named by its variable's id and its value, so compiling one design twice
 * gives the same ids. Variable ids are unique across the codebook and a
 * variable's option values are unique within it, so each option has an id
 * of its own. Runs after `assignCodebookIds`. `protocol` is changed in place.
 */
export const assignOptionIds = (protocol: Record<string, unknown>): void => {
  const { codebook } = protocol;
  if (!isObject(codebook)) return;
  const entitiesOf = (entity: unknown): unknown[] =>
    isObject(entity) ? Object.values(entity) : [];
  const owners = [
    codebook.ego,
    ...entitiesOf(codebook.node),
    ...entitiesOf(codebook.edge),
  ];
  for (const owner of owners) {
    if (!isObject(owner) || !isObject(owner.variables)) continue;
    for (const [variableId, variable] of Object.entries(owner.variables)) {
      if (
        !isObject(variable) ||
        !OPTION_ID_VARIABLE_TYPES.has(variable.type) ||
        !Array.isArray(variable.options)
      ) {
        continue;
      }
      variable.options = variable.options.map((option: unknown) =>
        isObject(option)
          ? {
              id: sketchObjectId(
                `option:${variableId}/${JSON.stringify(option.value)}`,
              ),
              ...option,
            }
          : option,
      );
    }
  }
};
