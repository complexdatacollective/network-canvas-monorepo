import { normalizeCodebookName } from '@codaco/shared-consts';

import {
  deterministicEntityTypeId,
  deterministicVariableId,
  isEntityTypeId,
  isVariableId,
} from '../schemas/9/codebook-ids.ts';
import { renameCodebookIds } from '../schemas/9/migration-codebook-ids.ts';
import {
  deterministicProtocolObjectId,
  isProtocolObjectId,
} from '../schemas/9/protocol-object-id.ts';
import { ProtocolStructureSchema } from '../schemas/9/protocol-structure.ts';
import type { VariableOwner } from '../utils/codebookIdRewrite.ts';
import {
  rewriteStageReferences,
  setObjectIdAt,
  unshareObjects,
  valueAt,
} from '../utils/protocolObjectIdRewrite.ts';
import { findMarkedObjects } from '../utils/protocolObjectIds.ts';
import {
  isAttributeHit,
  isTypeHit,
  walkSchemaReferences,
} from '../utils/schemaReferenceWalk.ts';

/** A protocol object id a test can name: the same UUID for the same label. */
export const testId = deterministicProtocolObjectId(
  '93e5e893-6af4-49dd-a348-e0a45978c112',
);

/** A node or edge type id a test can name: the same UUID for the same label. */
export const testTypeId = deterministicEntityTypeId(
  'b7d1f0a2-6c4e-4b8f-9e3a-1f2d5c7a9e04',
);

/** A variable id a test can name: the same UUID for the same label. */
export const testVariableId = deterministicVariableId(
  '5c0b8a3e-2f4d-4e61-9a7b-0d3c6f1e8b52',
);

const asTestId = (id: string): string =>
  isProtocolObjectId(id) ? id : testId(id);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTestCodebookId =
  (isId: (key: string) => boolean, idFor: (key: string) => string) =>
  (key: string): string =>
    isId(key) || key === '__proto__' ? key : idFor(key);

/**
 * A protocol fixture written with readable codebook keys, with each node or
 * edge type key that is not a UUID replaced by `testTypeId` of it, each
 * variable or layout key that is not a UUID by `testVariableId` of it (a
 * layout id is a variable id), and every reference to them with them. A key
 * used by two entities, or by an entity and a layout, becomes one id on both,
 * so a fixture testing the rule against reused keys still breaks it. A reference naming nothing in the codebook, and a `__proto__`
 * key (which a fixture uses to test the rule against it), are left as they
 * are. `withTestIds` does this too.
 */
export const withTestCodebookIds = <T>(protocol: T): T => {
  const copy = structuredClone(protocol);
  if (!isRecord(copy)) return copy;
  unshareObjects(copy);
  renameCodebookIds(copy, {
    typeId: asTestCodebookId(isEntityTypeId, testTypeId),
    variableId: asTestCodebookId(isVariableId, testVariableId),
    layoutId: asTestCodebookId(isVariableId, testVariableId),
  });
  withTestOptionIds(copy);
  return copy;
};

/**
 * Gives each option of a categorical or ordinal variable that has no id
 * `testId` of its variable's id and its value, in place, so a fixture need
 * not write option ids it never refers to.
 */
const withTestOptionIds = (protocol: Record<string, unknown>) => {
  for (const { id, path, objectKind } of findMarkedObjects(
    ProtocolStructureSchema,
    protocol,
  )) {
    if (objectKind !== 'option' || id !== undefined) continue;
    const objectPath = path.slice(0, -1);
    const option = valueAt(protocol, objectPath);
    const value = isRecord(option) ? option.value : undefined;
    setObjectIdAt(
      protocol,
      objectPath,
      testId(`option/${String(objectPath.at(-3))}/${String(value)}`),
    );
  }
};

// The top-level object holding the object at `objectPath`: a stage, or the
// protocol itself for anything outside the stage list.
const containerOf = (objectPath: readonly (string | number)[]) =>
  objectPath[0] === 'stages' ? `stages/${String(objectPath[1])}` : '';

/**
 * A protocol fixture written with readable ids, with each id that is not a
 * UUID replaced by `testId` of it, and each stage reference by `testId` of the
 * stage it names. A missing id becomes `testId` of the object's path. Its
 * codebook keys are replaced as `withTestCodebookIds` replaces them.
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
  return withTestCodebookIds(copy);
};

/** One stage fixture given ids as `withTestIds` gives a protocol's. */
export const withStageTestIds = <T>(stage: T): T => {
  const [converted] = withTestIds({ stages: [stage] }).stages;
  return converted ?? stage;
};

const ENTITIES = ['node', 'edge'] as const;

const typesOf = (
  codebook: unknown,
  entity: 'node' | 'edge',
): Record<string, unknown> => {
  const types = isRecord(codebook) ? codebook[entity] : undefined;
  return isRecord(types) ? types : {};
};

const variablesOf = (
  codebook: unknown,
  owner: VariableOwner,
): Record<string, unknown> => {
  const definition =
    owner.entity === 'ego'
      ? isRecord(codebook)
        ? codebook.ego
        : undefined
      : typesOf(codebook, owner.entity)[owner.type];
  return isRecord(definition) && isRecord(definition.variables)
    ? definition.variables
    : {};
};

const nameIn = (record: Record<string, unknown>, key: string) => {
  const entry = record[key];
  return isRecord(entry) && typeof entry.name === 'string'
    ? entry.name
    : undefined;
};

// The key of the entry of `record` called `name`, comparing names as the
// migrations clean them (earlier versions allowed tabs and repeated spaces).
const comparableName = (name: string) =>
  normalizeCodebookName(name).replaceAll(/\s+/g, ' ');

const keyNamed = (
  record: Record<string, unknown>,
  name: string | undefined,
): string | undefined => {
  if (name === undefined) return undefined;
  const wanted = comparableName(name);
  return Object.keys(record).find((key) => {
    const candidate = nameIn(record, key);
    return candidate !== undefined && comparableName(candidate) === wanted;
  });
};

/**
 * For each node type, edge type and variable of `migrated` (a migration's
 * result), the key the same entry had in `original` (the document it was
 * migrated from), found by its name, and for a variable by the entity it
 * belongs to. An entry the migration added has none, and is given its name.
 * The ids are UUIDs, so one map serves every kind.
 */
export const originalCodebookKeys = (
  migrated: unknown,
  original: unknown,
): Map<string, string> => {
  const keys = new Map<string, string>();
  const migratedCodebook = isRecord(migrated) ? migrated.codebook : undefined;
  const originalCodebook = isRecord(original) ? original.codebook : undefined;
  const owners: [VariableOwner, VariableOwner][] = [
    [{ entity: 'ego' }, { entity: 'ego' }],
  ];
  for (const entity of ENTITIES) {
    const types = typesOf(migratedCodebook, entity);
    for (const type of Object.keys(types)) {
      const name = nameIn(types, type);
      const originalType =
        keyNamed(typesOf(originalCodebook, entity), name) ?? name ?? type;
      keys.set(type, originalType);
      owners.push([
        { entity, type },
        { entity, type: originalType },
      ]);
    }
  }
  for (const [owner, originalOwner] of owners) {
    const variables = variablesOf(migratedCodebook, owner);
    const originalVariables = variablesOf(originalCodebook, originalOwner);
    for (const key of Object.keys(variables)) {
      const name = nameIn(variables, key);
      keys.set(key, keyNamed(originalVariables, name) ?? name ?? key);
    }
  }
  return keys;
};

/**
 * `migrated` with each node type, edge type and variable stored under the
 * key it had in `original`, and every reference to each naming that key, so
 * that a test can describe a migration's result in the readable keys its
 * fixture was written with.
 *
 * It throws where a reference still holds one of those readable keys: a
 * reference the migration failed to follow, which the renaming would
 * otherwise hide.
 */
export const withOriginalCodebookKeys = <T>(
  migrated: T,
  original: unknown,
): T => {
  const copy = structuredClone(migrated);
  if (!isRecord(copy)) return copy;
  const keys = originalCodebookKeys(copy, original);
  const readable = new Set(keys.values());
  for (const hit of walkSchemaReferences(ProtocolStructureSchema, copy)) {
    const held = isTypeHit(hit)
      ? hit.typeId
      : isAttributeHit(hit) && !hit.dataSourceColumn
        ? hit.variableId
        : undefined;
    if (held === undefined || isVariableId(held) || !readable.has(held)) {
      continue;
    }
    throw new Error(
      `The reference at ${hit.path.join('.')} still names "${held}".`,
    );
  }
  renameCodebookIds(copy, {
    typeId: (key) => keys.get(key) ?? key,
    variableId: (key) => keys.get(key) ?? key,
  });
  return copy;
};
