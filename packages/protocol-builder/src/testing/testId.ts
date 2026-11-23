import {
  deterministicEntityTypeId,
  deterministicProtocolObjectId,
  deterministicVariableId,
  isEntityTypeId,
  isVariableId,
  renameCodebookIds,
} from '@codaco/protocol-validation';

/** A protocol object id a test can name: the same UUID for the same label. */
export const testId = deterministicProtocolObjectId(
  '0c6f3d52-8a8e-4f4e-9d3b-6a1f2c7e5b90',
);

/** A node or edge type id a test can name: the same UUID for the same label. */
export const testTypeId = deterministicEntityTypeId(
  '4d8e2a61-3b7c-4f95-8a0e-6c1d9b2f7e43',
);

/** A variable id a test can name: the same UUID for the same label. */
export const testVariableId = deterministicVariableId(
  'a2f6c8e1-5d3b-4e7a-9c04-8b1e3f6d2a95',
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A protocol fixture written with readable codebook keys, with each node or
 * edge type key that is not a UUID replaced by `testTypeId` of it, each
 * variable key that is not a UUID by `testVariableId` of it, and every
 * reference to them following. A test names an entry as `testVariableId('age')`.
 */
export const withTestCodebookIds = <T>(protocol: T): T => {
  const copy = structuredClone(protocol);
  if (!isRecord(copy)) return copy;
  renameCodebookIds(copy, {
    typeId: (key) => (isEntityTypeId(key) ? key : testTypeId(key)),
    variableId: (key) => (isVariableId(key) ? key : testVariableId(key)),
  });
  return copy;
};
