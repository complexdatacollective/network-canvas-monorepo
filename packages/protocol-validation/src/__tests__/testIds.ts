import {
  deterministicProtocolObjectId,
  isProtocolObjectId,
} from '../schemas/9/protocol-object-id.ts';
import { ProtocolStructureSchema } from '../schemas/9/protocol-structure.ts';
import {
  rewriteStageReferences,
  setObjectIdAt,
  unshareObjects,
} from '../utils/protocolObjectIdRewrite.ts';
import { findMarkedObjects } from '../utils/protocolObjectIds.ts';

/** A protocol object id a test can name: the same UUID for the same label. */
export const testId = deterministicProtocolObjectId(
  '93e5e893-6af4-49dd-a348-e0a45978c112',
);

const asTestId = (id: string): string =>
  isProtocolObjectId(id) ? id : testId(id);

// The top-level object holding the object at `objectPath`: a stage, or the
// protocol itself for anything outside the stage list.
const containerOf = (objectPath: readonly (string | number)[]) =>
  objectPath[0] === 'stages' ? `stages/${String(objectPath[1])}` : '';

/**
 * A protocol fixture written with readable ids, with each id that is not a
 * UUID replaced by `testId` of it, and each stage reference by `testId` of the
 * stage it names. A missing id becomes `testId` of the object's path.
 *
 * Fixtures written before ids were unique across a protocol repeat readable
 * ids on different stages (every stage's first prompt `p1`). Such an id
 * becomes `testId` of the label on the stage that uses it first, and `testId`
 * of the stage's id and the label on every other stage. A label repeated
 * within one stage, or as the id of two stages, stays repeated, so a fixture
 * testing the rule against repeats still breaks it.
 */
export const withTestIds = <T>(protocol: T): T => {
  const copy = structuredClone(protocol);
  unshareObjects(copy);
  const stageIds = new Map<string, string>();
  const firstContainer = new Map<string, string>();
  for (const { id, path, objectKind } of findMarkedObjects(
    ProtocolStructureSchema,
    copy,
  )) {
    const objectPath = path.slice(0, -1);
    if (objectKind === 'stage' && objectPath.length === 2 && id !== undefined) {
      stageIds.set(containerOf(objectPath), id);
    }
    if (id !== undefined && isProtocolObjectId(id)) continue;
    if (id === undefined) {
      setObjectIdAt(copy, objectPath, testId(JSON.stringify(objectPath)));
      continue;
    }
    const container = containerOf(objectPath);
    const first = firstContainer.get(id) ?? container;
    firstContainer.set(id, first);
    const isStage = objectKind === 'stage' && objectPath.length === 2;
    setObjectIdAt(
      copy,
      objectPath,
      isStage || first === container
        ? testId(id)
        : testId(`${stageIds.get(container) ?? container}/${id}`),
    );
  }
  rewriteStageReferences(ProtocolStructureSchema, copy, asTestId);
  return copy;
};

/** One stage fixture given ids as `withTestIds` gives a protocol's. */
export const withStageTestIds = <T>(stage: T): T => {
  const [converted] = withTestIds({ stages: [stage] }).stages;
  return converted ?? stage;
};
