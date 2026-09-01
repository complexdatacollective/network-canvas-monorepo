import { createSelector } from '@reduxjs/toolkit';

import type { NodeShape } from '@codaco/fresco-ui/Node';
import {
  type ColorReference,
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
import {
  getEntityTypeUsageHitsById,
  getVariableUsageHits,
  utils,
} from '~/selectors/indexes';
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

type UsageMeta = {
  label: string;
  id?: string;
};

/**
 * The one thing this display needs from a reference hit: WHERE in the protocol
 * the reference sits. Both `collectEntityAttributeReferences` (variables) and
 * `collectEntityTypeReferences` (node/edge types) emit exactly this, so both
 * usage columns are described by one function.
 */
type UsageHit = {
  path: readonly (string | number)[];
};

/**
 * Describes where a set of reference hits sit, as the rows of the Codebook's
 * "Used In" cell (with duplicates removed).
 *
 * Reads the collector's own structured paths. It does NOT re-derive structure
 * from a joined string: segments arrive already separated, so a codebook
 * record key containing a dot (`/^[a-zA-Z0-9._:-]+$/` permits one) names its
 * variable or type correctly instead of degrading to "unknown", and a stage
 * index arrives as the number it is rather than something to re-parse.
 *
 * NEVER EMPTY by construction — which is the guarantee that matters, and is
 * narrower than "every hit contributes". A hit sitting somewhere this function
 * has no wording for (a schema that tags a reference at a new kind of location)
 * contributes the generic entry ONLY when nothing else resolved: the fallback
 * below is gated on all three resolved buckets being empty, so an undescribable
 * hit sitting alongside a described one is dropped. That is harmless, because
 * the row is non-empty either way — and non-empty is the whole claim. An empty
 * result beside a disabled "In use — cannot be deleted" button is the exact
 * disagreement #1392 was filed for, and it must not be possible to reintroduce
 * by adding a reference site somewhere new.
 *
 * @param {Object[]} stageMetaByIndex Stage meta by index (as created by `getStageMetaByIndex()`)
 * @param {Object[]} variableMetaByIndex Variable meta by index (as created by
 * `getVariableMetaByIndex()`)
 * @param {Object[]} hits Reference hits naming one variable or one entity type
 * @returns {Object[]} List of stage meta `{ label, id }`.
 */
export const getUsageAsStageMeta = (
  stageMetaByIndex: StageMeta[],
  variableMetaByIndex: Variables,
  hits: readonly UsageHit[],
  typeMetaByIndex: Record<string, string> = {},
): UsageMeta[] => {
  const codebookVariableNames = new Set<string>();
  const shapeMappingTypeNames = new Set<string>();
  const stagesByIndex = new Map<number, StageMeta>();
  let hasUndescribableHit = false;

  for (const { path } of hits) {
    if (path[0] === 'stages') {
      const stageIndex = path[1];
      const stageMeta =
        typeof stageIndex === 'number'
          ? stageMetaByIndex[stageIndex]
          : undefined;
      if (typeof stageIndex === 'number' && stageMeta) {
        stagesByIndex.set(stageIndex, stageMeta);
        continue;
      }
      hasUndescribableHit = true;
      continue;
    }

    if (path[0] === 'codebook') {
      // An ego definition has no type segment, so the reference sites are:
      //   codebook.ego.variables.<owner>.validation.<rule>
      //   codebook.<entity>.<typeId>.variables.<owner>.validation.<rule>
      //   codebook.node.<typeId>.shape.dynamic.variable
      const withinDefinition =
        path[1] === 'ego' ? path.slice(2) : path.slice(3);

      if (withinDefinition[0] === 'variables') {
        const owningVariableId = withinDefinition[1];
        const owner =
          typeof owningVariableId === 'string'
            ? variableMetaByIndex[owningVariableId]
            : undefined;
        codebookVariableNames.add(owner?.name ?? 'unknown');
        continue;
      }

      if (withinDefinition[0] === 'shape') {
        const typeId = path[2];
        const typeName =
          typeof typeId === 'string' ? typeMetaByIndex[typeId] : undefined;
        shapeMappingTypeNames.add(typeName ?? 'unknown');
        continue;
      }
    }

    hasUndescribableHit = true;
  }

  const stageVariablesWithMeta = [...stagesByIndex.values()];

  const codebookVariablesWithMeta: UsageMeta[] = [...codebookVariableNames].map(
    (name) => ({ label: `Used as validation for "${name}"` }),
  );

  const shapeMappingsWithMeta: UsageMeta[] = [...shapeMappingTypeNames].map(
    (name) => ({ label: `Used in shape settings for "${name}"` }),
  );

  const fallbackWithMeta: UsageMeta[] =
    hasUndescribableHit &&
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
 * Creates a selector that returns a function for getting entity usage data.
 *
 * `index` answers only "is this type referenced at all" — the gate on the
 * Delete control. Where it is referenced comes from the structured hits, so
 * the two cannot be derived from the same string by different rules.
 *
 * @param {unknown} index A joined type index (`getNodeIndex`/`getEdgeIndex`)
 * @param {Record<string, unknown>} mergeProps Props to merge with the result
 * @returns {function} Function that can be used in map operations
 */
export const makeGetEntityWithUsage = (
  index: Record<string, unknown>,
  mergeProps: Record<string, unknown>,
) =>
  createSelector(
    [
      getStageMetaByIndex,
      getVariableMetaByIndex,
      getTypeMetaByIndex,
      getEntityTypeUsageHitsById,
    ],
    (stageMetaByIndex, variableMetaByIndex, typeMetaByIndex, hitsByTypeId) => {
      const search = utils.buildSearch([index]);

      return (_: unknown, id: string) => {
        const inUse = search.has(id);
        const usage = inUse
          ? getUsageAsStageMeta(
              stageMetaByIndex,
              variableMetaByIndex,
              hitsByTypeId.get(id) ?? [],
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
  color?: ColorReference;
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

  const variableMeta = getVariableMetaByIndex(state);
  const typeMeta = getTypeMetaByIndex(state);
  const stageMetaByIndex = getStageMetaByIndex(state);
  const isUsedIndex = getIsUsed(state);

  const variablesWithUsage: Record<string, VariableWithUsage> = {};

  for (const [id, variable] of Object.entries(variables || {})) {
    // Indexed directly rather than through a path-style getter, so a variable
    // id containing a dot (`/^[a-zA-Z0-9._:-]+$/` permits one) needs no
    // reasoning about whether the getter treats it as a path or a key.
    const inUse = isUsedIndex[id] ?? false;

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
      getVariableUsageHits(state, id),
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
