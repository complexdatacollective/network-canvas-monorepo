import {
  rewriteStageReferences,
  setObjectIdAt,
  unshareObjects,
  valueAt,
} from '../../utils/protocolObjectIdRewrite.ts';
import { findMarkedObjects } from '../../utils/protocolObjectIds.ts';
import {
  createProtocolObjectId,
  deterministicProtocolObjectId,
} from './protocol-object-id.ts';
import { ProtocolStructureSchema } from './protocol-structure.ts';
import { optionValueKey } from './variables/variable.ts';

/**
 * Gives every marked object in `document` a new protocol object id, whatever
 * id it had before, except the options of categorical and ordinal variables,
 * which `assignOptionIds` gives theirs once every variable has its id. Each stage reference names the new id of the stage it
 * named; where one id was on several stages, it names the first of them.
 * `document` is changed in place.
 */
export const assignProtocolObjectIds = (document: Record<string, unknown>) => {
  unshareObjects(document);
  const stageRenames = new Map<string, string>();
  for (const { id, path, objectKind } of findMarkedObjects(
    ProtocolStructureSchema,
    document,
  )) {
    if (objectKind === 'option') continue;
    const newId = createProtocolObjectId();
    setObjectIdAt(document, path.slice(0, -1), newId);
    if (objectKind === 'stage' && id !== undefined && !stageRenames.has(id)) {
      stageRenames.set(id, newId);
    }
  }
  rewriteStageReferences(ProtocolStructureSchema, document, (id) =>
    stageRenames.get(id),
  );
};

// The namespace option ids are named in. Changing it changes the id of every
// option the migration names.
const optionIdFor = deterministicProtocolObjectId(
  'f3a1c8d2-5b7e-4f09-8c6d-2e4b9a7f1d35',
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Gives every option of a categorical or ordinal variable in `document` an
 * id named by where its variable is in the codebook (the entity, the type
 * and the variable's key) and by its value, so that one protocol migrated
 * twice gives its options the same ids. Each variable has one place, and
 * option values within a variable are unique, so the ids are unique. Meant
 * to run before `assignCodebookIds`, while the codebook keys are the ones
 * the protocol was written with. `document` is changed in place.
 */
export const assignOptionIds = (document: Record<string, unknown>) => {
  for (const { path, objectKind } of findMarkedObjects(
    ProtocolStructureSchema,
    document,
  )) {
    if (objectKind !== 'option') continue;
    const objectPath = path.slice(0, -1);
    const option = valueAt(document, objectPath);
    const value = isRecord(option) ? option.value : undefined;
    // The path to the variable: the option's path without `options` and
    // its index.
    const variablePath = objectPath.slice(0, -2);
    setObjectIdAt(
      document,
      objectPath,
      typeof value === 'string' || typeof value === 'number'
        ? optionIdFor(
            `${JSON.stringify(variablePath)}/${optionValueKey(value)}`,
          )
        : // An option the codebook's own check refuses anyway.
          createProtocolObjectId(),
    );
  }
};
