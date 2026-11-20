import {
  collectProtocolObjectIds,
  deterministicProtocolObjectId,
  type ProtocolObjectId,
} from '@codaco/protocol-validation';

// The namespace of every id Sketch gives a protocol object. It must never
// change: a different namespace gives a design compiled again a different
// set of ids.
const SKETCH_ID_NAMESPACE = '4c3f0f7e-5a2b-4d8e-9b61-0f2a7d9c3e15';

const sketchObjectId = deterministicProtocolObjectId(SKETCH_ID_NAMESPACE);

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
  for (const { path, kind } of collectProtocolObjectIds({ stages })) {
    if (kind === 'stage') continue;
    const [, stageIndex, ...inside] = path;
    const stage = typeof stageIndex === 'number' ? stages[stageIndex] : null;
    const key = path.at(-1);
    let holder: unknown = { stages };
    for (const segment of path.slice(0, -1)) {
      holder = isObject(holder) ? Reflect.get(holder, segment) : undefined;
    }
    if (stage && isObject(holder) && key !== undefined) {
      Reflect.set(
        holder,
        key,
        sketchObjectId(`${String(stage.id)}${JSON.stringify(inside)}`),
      );
    }
  }
};
