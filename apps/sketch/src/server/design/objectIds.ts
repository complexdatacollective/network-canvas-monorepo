import {
  collectProtocolObjectIdsFromSchema,
  deterministicEntityTypeId,
  deterministicProtocolObjectId,
  deterministicVariableId,
  type ProtocolObjectId,
  renameCodebookIds,
  renameFieldBlocks,
  stageSchema,
} from '@codaco/protocol-validation';
import { isRecord, valueAtPath } from '@codaco/shared-consts';

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

/**
 * Points each field block in the document of the form at `formPath` (its
 * `content`, in each language) at the id `renames` gives its field, with
 * protocol-validation's rename, which renames every block in one pass.
 */
const renameFieldBlocksOf = (
  stage: Record<string, unknown>,
  formPath: readonly (string | number)[],
  renames: ReadonlyMap<string, string>,
): void => {
  const content = valueAtPath(stage, [...formPath, 'content']);
  if (!isRecord(content)) return;
  for (const [locale, message] of Object.entries(content)) {
    if (typeof message !== 'string') continue;
    Reflect.set(content, locale, renameFieldBlocks(message, renames));
  }
};

/**
 * Replaces the id of every marked object inside `stages` other than a stage
 * with one named by the object's stage and its place in that stage. The
 * compiler gives these objects readable ids that repeat from stage to stage
 * (every stage's first prompt is `p1`) and copies filters into several
 * places, so the ids are only made unique here, once the stages are built.
 * A form's document names its fields by id, so its field blocks are given
 * the new ids too. Stage ids, which skip logic and the Narrative Pedigree
 * refer to, are left as they are.
 */
export const assignNestedObjectIds = (
  stages: readonly Record<string, unknown>[],
): void => {
  for (const stage of stages) {
    // The new id of each field, by the path of its form.
    const fieldRenames = new Map<
      string,
      { formPath: readonly (string | number)[]; renames: Map<string, string> }
    >();
    for (const { id, path, kind } of collectProtocolObjectIdsFromSchema(
      stageSchema,
      stage,
    )) {
      if (kind === 'stage') continue;
      const key = path.at(-1);
      const holder = valueAtPath(stage, path.slice(0, -1));
      if (isRecord(holder) && key !== undefined) {
        const newId = sketchObjectId(
          `${String(stage.id)}${JSON.stringify(path)}`,
        );
        Reflect.set(holder, key, newId);
        if (kind === 'formField') {
          // A field's id is at `<form>.fields.<index>.id`.
          const formPath = path.slice(0, -3);
          const form = fieldRenames.get(JSON.stringify(formPath)) ?? {
            formPath,
            renames: new Map<string, string>(),
          };
          form.renames.set(id, newId);
          fieldRenames.set(JSON.stringify(formPath), form);
        }
      }
    }
    for (const { formPath, renames } of fieldRenames.values()) {
      renameFieldBlocksOf(stage, formPath, renames);
    }
  }
};

/** The id of the node or edge type the compiler keys `key`. */
export const sketchTypeId = (key: string) => typeIdIn(`type:${key}`);

/** The id of the variable the compiler keys `key`. */
export const sketchVariableId = (key: string) =>
  variableIdIn(`variable:${key}`);

/**
 * A source map path (`codebook.<entity>.<type>` or one that goes on to
 * `.variables.<variable>`) with the ids its keys were given.
 */
const renamedSourcePath = (path: string): string => {
  const segments = path.split('.');
  if (segments[0] !== 'codebook') return path;
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
 * Gives every node type, edge type and variable of `protocol` a UUID named
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

/** The entity types under a codebook's `node` or `edge`. */
const entitiesOf = (entity: unknown): unknown[] =>
  isRecord(entity) ? Object.values(entity) : [];

/**
 * Gives every option of a categorical or ordinal variable of `protocol` an
 * id named by its variable's id and its value, so compiling one design twice
 * gives the same ids. Variable ids are unique across the codebook and a
 * variable's option values are unique within it, so each option has an id
 * of its own. Runs after `assignCodebookIds`. `protocol` is changed in place.
 */
export const assignOptionIds = (protocol: Record<string, unknown>): void => {
  const { codebook } = protocol;
  if (!isRecord(codebook)) return;
  const owners = [
    codebook.ego,
    ...entitiesOf(codebook.node),
    ...entitiesOf(codebook.edge),
  ];
  for (const owner of owners) {
    if (!isRecord(owner) || !isRecord(owner.variables)) continue;
    for (const [variableId, variable] of Object.entries(owner.variables)) {
      if (
        !isRecord(variable) ||
        !OPTION_ID_VARIABLE_TYPES.has(variable.type) ||
        !Array.isArray(variable.options)
      ) {
        continue;
      }
      variable.options = variable.options.map((option: unknown) =>
        isRecord(option)
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
