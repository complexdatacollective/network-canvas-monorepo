import {
  deterministicEntityTypeId,
  deterministicProtocolObjectId,
  deterministicVariableId,
  isEntityTypeId,
  isVariableId,
  type ProtocolObjectId,
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
 * The id a fixture's categorical or ordinal option without one is given:
 * the same UUID for the same variable and value, and a different one for
 * each variable, since an option id is unique across the protocol.
 */
export const testOptionId = (
  variableId: string,
  value: unknown,
): ProtocolObjectId => testId(`option/${variableId}/${String(value)}`);

/** Gives each categorical or ordinal option in `variables` without an id one. */
const giveOptionsIds = (variables: unknown) => {
  if (!isRecord(variables)) return;
  for (const [variableId, variable] of Object.entries(variables)) {
    if (
      !isRecord(variable) ||
      (variable.type !== 'categorical' && variable.type !== 'ordinal') ||
      !Array.isArray(variable.options)
    ) {
      continue;
    }
    variable.options = variable.options.map((option: unknown) =>
      isRecord(option) && typeof option.id !== 'string'
        ? { id: testOptionId(variableId, option.value), ...option }
        : option,
    );
  }
};

/**
 * A protocol fixture written with readable codebook keys, with each node or
 * edge type key that is not a UUID replaced by `testTypeId` of it, each
 * variable key that is not a UUID by `testVariableId` of it, and every
 * reference to them following. A test names an entry as `testVariableId('age')`.
 * Each categorical or ordinal option written without an id is given one
 * (`testOptionId`).
 */
export const withTestCodebookIds = <T>(protocol: T): T => {
  const copy = structuredClone(protocol);
  if (!isRecord(copy)) return copy;
  renameCodebookIds(copy, {
    typeId: (key) => (isEntityTypeId(key) ? key : testTypeId(key)),
    variableId: (key) => (isVariableId(key) ? key : testVariableId(key)),
  });
  const { codebook } = copy;
  if (isRecord(codebook)) {
    if (isRecord(codebook.ego)) giveOptionsIds(codebook.ego.variables);
    for (const entity of ['node', 'edge'] as const) {
      const types = codebook[entity];
      if (!isRecord(types)) continue;
      for (const type of Object.values(types)) {
        if (isRecord(type)) giveOptionsIds(type.variables);
      }
    }
  }
  return copy;
};
