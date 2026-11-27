import { z } from 'zod';

import {
  dynamicValueNameFor,
  optionCaseKey,
  optionIdFromCaseKey,
  parseDynamicValueName,
  rewriteDynamicValueReferences,
} from '../schemas/9/dynamic-values.ts';
import {
  createProtocolObjectId,
  isProtocolObjectId,
  type ProtocolObjectId,
} from '../schemas/9/protocol-object-id.ts';
import { stageSchema } from '../schemas/9/stages/index.ts';
import { collectLocalizedStringsFromSchema } from './collectLocalizedStrings.ts';
import {
  formPathOfField,
  renameKeys,
  rewriteFieldBlockReferences,
  rewriteStageReferences,
  setObjectIdAt,
  unshareObjects,
  valueAt,
} from './protocolObjectIdRewrite.ts';
import { findMarkedObjects } from './protocolObjectIds.ts';

export type FreshenedProtocolFragment<T> = {
  fragment: T;
  /**
   * Each id that was replaced, mapped to the id that replaced its first
   * occurrence in the fragment. Condition keys are included.
   */
  idMap: Map<string, ProtocolObjectId>;
};

const stagesSchema = z.array(stageSchema);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * An option by its variable as well as its id: two variables' options may
 * share an id, and text names an option only through the attribute that it
 * belongs to.
 */
const optionKey = (variableId: string, optionId: string) =>
  JSON.stringify([variableId, optionId]);

const startsWith = (
  path: readonly (string | number)[],
  prefix: readonly (string | number)[],
) => prefix.every((step, index) => path[index] === step);

/**
 * A copy of `fragment` (a stage, an array of stages, or any part of a
 * protocol described by `schema`) that can be added to a protocol whose
 * object ids are `destinationIds` without repeating one. An id is kept when
 * it is a UUID that neither the destination nor an earlier object in the
 * fragment holds; every other id, and every missing one, is replaced with a
 * new random id. Stage references inside the fragment that named a replaced
 * stage name its replacement.
 *
 * The conditions and dynamic attributes of each stage and node type label in
 * the fragment are treated alike, by their keys, and so are the options of
 * its categorical and ordinal variables, by their ids. Text in the fragment
 * that names a replaced condition (`condition_<id>`) or dynamic attribute
 * (`dynamic_<id>`), or gives a version for a replaced option of an
 * attribute, names its replacement; so does a dynamic attribute that names
 * a replaced condition or option, and a form's text that places a replaced
 * field. `fragment` is not changed.
 */
export const freshenProtocolFragmentIds = <T>(
  fragment: T,
  destinationIds: Iterable<string>,
  schema: z.ZodType = Array.isArray(fragment) ? stagesSchema : stageSchema,
): FreshenedProtocolFragment<T> => {
  const taken = new Set<string>(destinationIds);
  const idMap = new Map<string, ProtocolObjectId>();
  const stageRenames = new Map<string, string>();
  // By `optionKey`: two variables' options may share an id.
  const optionRenames = new Map<string, string>();
  const stagePaths: (string | number)[][] = [];
  // By form: a form's text names only its own fields.
  const fieldRenames = new Map<
    string,
    { formPath: readonly (string | number)[]; renames: Map<string, string> }
  >();
  const copy = structuredClone(fragment);
  unshareObjects(copy);

  const seen = new Set<string>();
  const seenOnStages = new Set<string>();
  for (const { id, path, objectKind } of findMarkedObjects(schema, copy)) {
    const firstOccurrence = id !== undefined && !seen.has(id);
    // A stage reference only ever names a stage, so an earlier prompt or rule
    // holding the same id must not stop the stage's rename being recorded.
    const firstStageOccurrence =
      objectKind === 'stage' && id !== undefined && !seenOnStages.has(id);
    if (id !== undefined) seen.add(id);
    if (objectKind === 'stage' && id !== undefined) seenOnStages.add(id);
    if (objectKind === 'stage') stagePaths.push(path.slice(0, -1));
    if (id !== undefined && isProtocolObjectId(id) && !taken.has(id)) {
      taken.add(id);
      continue;
    }
    // A random UUID never repeats one already taken in practice.
    const fresh = createProtocolObjectId();
    taken.add(fresh);
    setObjectIdAt(copy, path.slice(0, -1), fresh);
    if (id !== undefined && firstOccurrence) idMap.set(id, fresh);
    if (id !== undefined && firstStageOccurrence) stageRenames.set(id, fresh);
    if (objectKind === 'formField' && id !== undefined) {
      const formPath = formPathOfField(path);
      const key = JSON.stringify(formPath);
      const form = fieldRenames.get(key) ?? { formPath, renames: new Map() };
      if (!form.renames.has(id)) form.renames.set(id, fresh);
      fieldRenames.set(key, form);
    }
    // An option's id is at `[…, 'variables', <variable id>, 'options', <index>, 'id']`.
    const variableId = objectKind === 'option' ? path.at(-4) : undefined;
    if (id !== undefined && typeof variableId === 'string') {
      const key = optionKey(variableId, id);
      if (!optionRenames.has(key)) optionRenames.set(key, fresh);
    }
  }

  rewriteStageReferences(schema, copy, (id) => stageRenames.get(id));
  for (const { formPath, renames } of fieldRenames.values()) {
    rewriteFieldBlockReferences(copy, formPath, renames);
  }

  // The texts that may name conditions and options, and the objects that
  // declare conditions: each stage, and each node type's label.
  const texts = collectLocalizedStringsFromSchema(schema, copy).filter(
    (hit) => hit.dynamicValues !== undefined,
  );
  const owners = [
    ...stagePaths,
    ...texts.flatMap((hit) =>
      hit.dynamicValues === 'nodeLabel' ? [hit.path.slice(0, -1)] : [],
    ),
  ];
  // A condition's key is unique only among the conditions of its stage or
  // node type label, not across the protocol: two stages may each declare a
  // condition with one key, and text names only the conditions declared
  // beside it. So each owner's renames are kept apart, and each text is
  // rewritten by the renames of the owner that declares its conditions. A
  // key is still replaced when it is not a UUID, or is an id taken by the
  // destination or by an earlier object or condition in the fragment, so
  // that `idMap` names each replaced key once.
  const conditionRenames = new Map<string, Map<string, string>>();
  // Dynamic attributes are keyed like conditions, and kept apart by owner
  // for the same reason.
  const dynamicAttributeRenames = new Map<string, Map<string, string>>();
  const renameOwnKeys = (record: Record<string, unknown>) => {
    const renames = new Map<string, string>();
    for (const key of Object.keys(record)) {
      if (isProtocolObjectId(key) && !taken.has(key)) {
        taken.add(key);
        continue;
      }
      const fresh = createProtocolObjectId();
      taken.add(fresh);
      renames.set(key, fresh);
      if (!idMap.has(key)) idMap.set(key, fresh);
    }
    renameKeys(record, renames);
    return renames;
  };
  for (const owner of owners) {
    const conditions = valueAt(copy, [...owner, 'conditions']);
    if (isRecord(conditions)) {
      conditionRenames.set(JSON.stringify(owner), renameOwnKeys(conditions));
    }
    const dynamicAttributes = valueAt(copy, [...owner, 'dynamicAttributes']);
    if (isRecord(dynamicAttributes)) {
      dynamicAttributeRenames.set(
        JSON.stringify(owner),
        renameOwnKeys(dynamicAttributes),
      );
    }
  }

  // A definition names its owner's conditions, and the options of the
  // attribute whose answers it reads.
  for (const owner of owners) {
    const dynamicAttributes = valueAt(copy, [...owner, 'dynamicAttributes']);
    if (!isRecord(dynamicAttributes)) continue;
    const renames = conditionRenames.get(JSON.stringify(owner));
    for (const definition of Object.values(dynamicAttributes)) {
      if (!isRecord(definition)) continue;
      if (Array.isArray(definition.cases)) {
        for (const entry of definition.cases) {
          if (!isRecord(entry) || typeof entry.condition !== 'string') continue;
          entry.condition = renames?.get(entry.condition) ?? entry.condition;
        }
      }
      const parsed =
        typeof definition.value === 'string'
          ? parseDynamicValueName(definition.value)
          : undefined;
      if (parsed?.kind !== 'attribute' || !Array.isArray(definition.answers)) {
        continue;
      }
      for (const entry of definition.answers) {
        if (!isRecord(entry) || typeof entry.answer !== 'string') continue;
        const optionId = optionIdFromCaseKey(entry.answer);
        const renamed =
          optionId === undefined
            ? undefined
            : optionRenames.get(optionKey(parsed.variableId, optionId));
        if (renamed !== undefined) entry.answer = optionCaseKey(renamed);
      }
    }
  }

  for (const hit of texts) {
    // The innermost owner holding the text declares the conditions it names.
    const owner = owners
      .filter((path) => startsWith(hit.path, path))
      .reduce<(string | number)[] | undefined>(
        (innermost, path) =>
          innermost === undefined || path.length > innermost.length
            ? path
            : innermost,
        undefined,
      );
    const renames =
      owner === undefined
        ? undefined
        : conditionRenames.get(JSON.stringify(owner));
    const attributeRenames =
      owner === undefined
        ? undefined
        : dynamicAttributeRenames.get(JSON.stringify(owner));
    const translations = valueAt(copy, hit.path);
    if (!isRecord(translations)) continue;
    for (const [locale, message] of Object.entries(translations)) {
      if (typeof message !== 'string') continue;
      translations[locale] = rewriteDynamicValueReferences(message, {
        name: (name) => {
          const parsed = parseDynamicValueName(name);
          if (parsed?.kind === 'dynamicAttribute') {
            const renamed = attributeRenames?.get(parsed.id);
            return renamed === undefined
              ? undefined
              : dynamicValueNameFor({ ...parsed, id: renamed });
          }
          if (parsed?.kind !== 'condition') return undefined;
          const renamed = renames?.get(parsed.conditionId);
          return renamed === undefined
            ? undefined
            : dynamicValueNameFor({ ...parsed, conditionId: renamed });
        },
        caseKey: (name, key) => {
          const parsed = parseDynamicValueName(name);
          const optionId = optionIdFromCaseKey(key);
          if (parsed?.kind !== 'attribute' || optionId === undefined) {
            return undefined;
          }
          const renamed = optionRenames.get(
            optionKey(parsed.variableId, optionId),
          );
          return renamed === undefined ? undefined : optionCaseKey(renamed);
        },
      });
    }
  }
  return { fragment: copy, idMap };
};
