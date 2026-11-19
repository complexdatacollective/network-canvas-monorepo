import { v5 } from 'uuid';

import {
  isProtocolObjectId,
  type ProtocolObjectId,
  ProtocolObjectIdSchema,
} from '../schemas/9/protocol-object-id.ts';
import { ProtocolStructureSchema } from '../schemas/9/protocol-structure.ts';
import {
  setObjectIdAt,
  unshareObjects,
} from '../utils/protocolObjectIdRewrite.ts';
import { findMarkedObjects } from '../utils/protocolObjectIds.ts';
import {
  isStageHit,
  walkSchemaReferences,
} from '../utils/schemaReferenceWalk.ts';

const TEST_ID_NAMESPACE = '93e5e893-6af4-49dd-a348-e0a45978c112';

/**
 * A protocol object id for a test, the same every time for the same label, so
 * that a fixture can name an object by a readable label and a test can refer
 * to it again by that label.
 */
export const testId = (label: string): ProtocolObjectId =>
  ProtocolObjectIdSchema.parse(v5(label, TEST_ID_NAMESPACE));

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
  for (const { path, stageId } of walkSchemaReferences(
    ProtocolStructureSchema,
    copy,
  ).filter(isStageHit)) {
    let container: unknown = copy;
    for (const segment of path.slice(0, -1)) {
      container =
        typeof container === 'object' && container !== null
          ? Reflect.get(container, segment)
          : undefined;
    }
    const key = path.at(-1);
    if (
      typeof container === 'object' &&
      container !== null &&
      key !== undefined
    ) {
      Reflect.set(container, key, asTestId(stageId));
    }
  }
  return copy;
};

/** One stage fixture given ids as `withTestIds` gives a protocol's. */
export const withStageTestIds = <T>(stage: T): T => {
  const [converted] = withTestIds({ stages: [stage] }).stages;
  return converted ?? stage;
};
