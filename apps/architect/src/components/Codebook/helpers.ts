import { createSelector } from '@reduxjs/toolkit';
import { compact, get, reduce } from 'es-toolkit/compat';

import type { NodeShape } from '@codaco/fresco-ui/Node';
import {
  type EdgeDefinition,
  type EgoDefinition,
  type NodeDefinition,
  type Stage,
  type Variable,
  type Variables,
} from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/store';
import { getAllVariablesByUUID, getType } from '~/selectors/codebook';
import { getIsUsed } from '~/selectors/codebook/isUsed';
import { getVariableIndex, utils } from '~/selectors/indexes';
import { getCodebook, getProtocol } from '~/selectors/protocol';

type StageMeta = {
  label: string;
  id: string;
};

/**
 * Extract basic stage meta by index from the app state
 * @param {Object} state Application state
 * @returns {Object[]} Stage meta sorted by index in state
 */
const getStageMetaByIndex = createSelector(
  [getProtocol],
  (protocol): StageMeta[] => {
    if (!protocol) return [];
    return protocol.stages.map(({ label, id }: Stage) => ({ label, id }));
  },
);

const getVariableMetaByIndex = createSelector([getCodebook], (codebook) => {
  if (!codebook) return {};
  const variables = getAllVariablesByUUID(codebook);
  return variables;
});

const getTypeMetaByIndex = createSelector([getCodebook], (codebook) => {
  const typeNames: Record<string, string> = {};
  if (!codebook) return typeNames;
  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    if (!types) continue;
    for (const [id, definition] of Object.entries(types)) {
      if (definition && typeof definition.name === 'string') {
        typeNames[id] = definition.name;
      }
    }
  }
  return typeNames;
});

/**
 * Takes an object in the format of `{[path]: variableID}` and a variableID to
 * search for. Returns an array of paths that match the variableID.
 *
 * @param {Object.<string, string>}} index Usage index in (in format `{[path]: variableID}`)
 * @param {any} value Value to match in usage index
 * @returns {string[]} List of paths ("usage array")
 */
export const getUsage = (
  index: Record<string, unknown>,
  value: string,
): string[] =>
  reduce(
    index,
    (acc: string[], indexValue: unknown, path: string) => {
      if (indexValue !== value) {
        return acc;
      }
      return [...acc, path];
    },
    [],
  );

type UsageMeta = {
  label: string;
  id?: string;
};

/**
 * Get stage meta that matches "usage array" (with duplicates removed).
 *
 * Parses the dotted-array key format produced by collectEntityAttributeReferences,
 * e.g. `stages.0.form.fields.0.variable` or
 * `codebook.node.personType.variables.varId.validation.sameAs`.
 *
 * See `getUsage()` for how the usage array is generated.
 *
 * NEVER EMPTY by construction — which is the guarantee that matters, and is
 * narrower than "every key contributes". A key this parser does not recognise
 * (or one naming a stage index with no meta) contributes the generic entry
 * ONLY when nothing else resolved: the fallback below is gated on all three
 * resolved buckets being empty, so an unrecognised key sitting alongside a
 * recognised one is dropped. That is harmless, because the row is non-empty
 * either way — and non-empty is the whole claim. An empty result beside a
 * disabled "In use — cannot be deleted" button is the exact disagreement #1392
 * was filed for, and it must not be possible to reintroduce by adding a
 * reference site somewhere new.
 *
 * @param {Object[]} stageMetaByIndex Stage meta by index (as created by `getStageMetaByIndex()`)
 * @param {Object[]} variableMetaByIndex Variable meta by index (as created by
 * `getVariableMetaByIndex()`)
 * @param {string[]} usageArray "Usage array" as created by `getUsage()`
 * @returns {Object[]} List of stage meta `{ label, id }`.
 */
export const getUsageAsStageMeta = (
  stageMetaByIndex: StageMeta[],
  variableMetaByIndex: Variables,
  usageArray: string[],
  typeMetaByIndex: Record<string, string> = {},
): UsageMeta[] => {
  const codebookVariableNames = new Set<string>();
  const shapeMappingTypeNames = new Set<string>();
  const stageIndexSet = new Set<number>();
  let hasUnrecognisedKey = false;

  for (const key of usageArray) {
    const segments = key.split('.');
    if (segments[0] === 'stages') {
      const stageIndex = Number(segments[1]);
      if (Number.isNaN(stageIndex)) {
        hasUnrecognisedKey = true;
      } else {
        stageIndexSet.add(stageIndex);
      }
    } else if (segments[0] === 'codebook') {
      const variablesPos = segments.indexOf('variables');
      if (variablesPos !== -1) {
        const variableId = segments[variablesPos + 1];
        const variable = variableId
          ? variableMetaByIndex[variableId]
          : undefined;
        codebookVariableNames.add(variable?.name || 'unknown');
      } else if (segments.includes('shape')) {
        const typeId = segments[2];
        const typeName = typeId ? typeMetaByIndex[typeId] : undefined;
        shapeMappingTypeNames.add(typeName || 'unknown');
      } else {
        hasUnrecognisedKey = true;
      }
    } else {
      hasUnrecognisedKey = true;
    }
  }

  const codebookVariablesWithMeta: UsageMeta[] = [...codebookVariableNames].map(
    (name) => ({ label: `Used as validation for "${name}"` }),
  );

  const shapeMappingsWithMeta: UsageMeta[] = [...shapeMappingTypeNames].map(
    (name) => ({ label: `Used in shape settings for "${name}"` }),
  );

  const resolvedStages = [...stageIndexSet].map((stageIndex) =>
    get(stageMetaByIndex, stageIndex.toString()),
  );
  const stageVariablesWithMeta = compact(resolvedStages);
  if (stageVariablesWithMeta.length !== resolvedStages.length) {
    hasUnrecognisedKey = true;
  }

  const fallbackWithMeta: UsageMeta[] =
    hasUnrecognisedKey &&
    stageVariablesWithMeta.length === 0 &&
    codebookVariablesWithMeta.length === 0 &&
    shapeMappingsWithMeta.length === 0
      ? [{ label: 'Used elsewhere in this protocol' }]
      : [];

  return [
    ...stageVariablesWithMeta,
    ...codebookVariablesWithMeta,
    ...shapeMappingsWithMeta,
    ...fallbackWithMeta,
  ];
};

/**
 * Helper function to be used with Array.sort. Sorts a collection of variable
 * definitions by the label property.
 *
 * @param {Object} a { label: string }
 * @param {Object} b { label: string }
 * @returns {number} -1 if a < b, 1 if a > b, 0 if a === b
 */
export const sortByLabel = (a: UsageMeta, b: UsageMeta): number => {
  if (a.label < b.label) {
    return -1;
  }
  if (a.label > b.label) {
    return 1;
  }
  return 0;
};

/**
 * Creates a selector that returns a function for getting entity usage data
 * @param {unknown} index The index to use for searching
 * @param {Record<string, unknown>} mergeProps Props to merge with the result
 * @returns {function} Function that can be used in map operations
 */
export const makeGetEntityWithUsage = (
  index: Record<string, unknown>,
  mergeProps: Record<string, unknown>,
) =>
  createSelector(
    [getStageMetaByIndex, getVariableMetaByIndex, getTypeMetaByIndex],
    (stageMetaByIndex, variableMetaByIndex, typeMetaByIndex) => {
      const search = utils.buildSearch([index]);

      return (_: unknown, id: string) => {
        const inUse = search.has(id);
        const usage = inUse
          ? getUsageAsStageMeta(
              stageMetaByIndex,
              variableMetaByIndex,
              getUsage(index, id),
              typeMetaByIndex,
            )
          : [];

        return {
          ...mergeProps,
          type: id,
          inUse,
          usage,
        };
      };
    },
  );

type EntityPropertiesParams = {
  entity: 'node' | 'edge' | 'ego';
  type?: string;
};

type VariableWithUsage = Variable & {
  id: string;
  inUse: boolean;
  usage?: UsageMeta[];
  usageString?: string;
};

type EntityProperties = {
  name: string;
  color?: string;
  shape?: NodeShape;
  variables: Record<string, VariableWithUsage>;
};

/**
 * Returns entity meta data for use in the codebook.
 * @param {*} state
 * @param {*} param1
 * @returns
 */
export const getEntityProperties = (
  state: RootState,
  { entity, type }: EntityPropertiesParams,
): EntityProperties | null => {
  const entityType = getType(state, { entity, type });

  if (!entityType) {
    return null;
  }

  // Type guard to check if entityType has name and color (nodes and edges do, ego does not)
  const hasNameAndColor = (
    def: NodeDefinition | EdgeDefinition | EgoDefinition,
  ): def is NodeDefinition | EdgeDefinition => {
    return 'name' in def && 'color' in def;
  };

  const isEgo = entity === 'ego';
  const variables = entityType.variables;

  // For non-ego entities, we need name and color
  if (!isEgo && !hasNameAndColor(entityType)) {
    return null;
  }

  const name = hasNameAndColor(entityType) ? entityType.name : 'Ego';
  const color = hasNameAndColor(entityType) ? entityType.color : undefined;
  const shape =
    entity === 'node' && 'shape' in entityType
      ? entityType.shape?.default
      : undefined;

  const variableIndex = getVariableIndex(state);
  const variableMeta = getVariableMetaByIndex(state);
  const typeMeta = getTypeMetaByIndex(state);
  const stageMetaByIndex = getStageMetaByIndex(state);
  const isUsedIndex = getIsUsed(state);

  const variablesWithUsage: Record<string, VariableWithUsage> = {};

  for (const [id, variable] of Object.entries(variables || {})) {
    const inUse = get(isUsedIndex, id, false);

    const baseProperties: VariableWithUsage = {
      ...variable,
      id,
      inUse,
    };

    if (!inUse) {
      variablesWithUsage[id] = baseProperties;
      continue;
    }

    const usage = getUsageAsStageMeta(
      stageMetaByIndex,
      variableMeta,
      getUsage(variableIndex, id),
      typeMeta,
    ).toSorted(sortByLabel);

    const usageString = usage
      .map(({ label }: UsageMeta) => label)
      .join(', ')
      .toUpperCase();

    variablesWithUsage[id] = {
      ...baseProperties,
      usage,
      usageString,
    };
  }

  return {
    name,
    color,
    shape,
    variables: variablesWithUsage,
  };
};
