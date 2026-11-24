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
  renameKeys,
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
 * The conditions of each stage and node type label in the fragment are
 * treated alike, by their keys, and so are the options of its categorical
 * and ordinal variables, by their ids. Text in the fragment that names a
 * replaced condition (`condition_<id>`) or gives a version for a replaced
 * option names its replacement. `fragment` is not changed.
 */
export const freshenProtocolFragmentIds = <T>(
  fragment: T,
  destinationIds: Iterable<string>,
  schema: z.ZodType = Array.isArray(fragment) ? stagesSchema : stageSchema,
): FreshenedProtocolFragment<T> => {
  const taken = new Set<string>(destinationIds);
  const idMap = new Map<string, ProtocolObjectId>();
  const stageRenames = new Map<string, string>();
  const optionRenames = new Map<string, string>();
  const stagePaths: (string | number)[][] = [];
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
    if (id !== undefined && firstOccurrence && objectKind === 'option') {
      optionRenames.set(id, fresh);
    }
  }

  rewriteStageReferences(schema, copy, (id) => stageRenames.get(id));

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
  const conditionRenames = new Map<string, Map<string, string>>();
  for (const owner of owners) {
    const conditions = valueAt(copy, [...owner, 'conditions']);
    if (!isRecord(conditions)) continue;
    const renames = new Map<string, string>();
    for (const key of Object.keys(conditions)) {
      if (isProtocolObjectId(key) && !taken.has(key)) {
        taken.add(key);
        continue;
      }
      const fresh = createProtocolObjectId();
      taken.add(fresh);
      renames.set(key, fresh);
      if (!idMap.has(key)) idMap.set(key, fresh);
    }
    renameKeys(conditions, renames);
    conditionRenames.set(JSON.stringify(owner), renames);
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
    const translations = valueAt(copy, hit.path);
    if (!isRecord(translations)) continue;
    for (const [locale, message] of Object.entries(translations)) {
      if (typeof message !== 'string') continue;
      translations[locale] = rewriteDynamicValueReferences(message, {
        name: (name) => {
          const parsed = parseDynamicValueName(name);
          if (parsed?.kind !== 'condition') return undefined;
          const renamed = renames?.get(parsed.conditionId);
          return renamed === undefined
            ? undefined
            : dynamicValueNameFor({ ...parsed, conditionId: renamed });
        },
        caseKey: (name, key) => {
          if (parseDynamicValueName(name)?.kind !== 'attribute') {
            return undefined;
          }
          const renamed = optionRenames.get(optionIdFromCaseKey(key));
          return renamed === undefined ? undefined : optionCaseKey(renamed);
        },
      });
    }
  }
  return { fragment: copy, idMap };
};
