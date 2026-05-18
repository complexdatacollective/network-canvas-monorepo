import { createSelector } from '@reduxjs/toolkit';
import { isArray, values } from 'es-toolkit/compat';

import collectPath, {
  type CollectPathsEntry,
  collectPaths,
} from '../utils/collectPaths';
import { getProtocol } from './protocol';

const mapSubject =
  (entityType: string) =>
  (value: unknown, path: string): [unknown, string] | undefined => {
    const { type, entity } = value as { type: string; entity: string };
    if (entity !== entityType) {
      return undefined;
    }
    return [type, `${path}.type`];
  };

const mapAssetItems = (
  value: unknown,
  path: string,
): [unknown, string] | undefined => {
  const { type, content } = value as { type: string; content: string };
  if (type === 'text') {
    return undefined;
  }
  return [content, `${path}.content`];
};

/**
 * Master list of paths where variables are used.
 *
 * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
 * It is VITAL that this be updated when any new variable use occurs in the
 * protocol schema!
 * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
 *
 */
export const paths: {
  edges: CollectPathsEntry[];
  nodes: CollectPathsEntry[];
  variables: CollectPathsEntry[];
  assets: CollectPathsEntry[];
} = {
  edges: [
    'stages[].prompts[].edges.create',
    'stages[].prompts[].edges.display[]',
    'stages[].presets[].edges.display[]',
    'stages[].prompts[].createEdge',
    ['stages[].subject', mapSubject('edge')],
    ['stages[].edgeType', mapSubject('edge')], // Legacy FamilyTreeCensus edge type
    'stages[].edgeConfig.type', // FamilyPedigree edge type
  ],
  nodes: [
    ['stages[].subject', mapSubject('node')],
    'stages[].nodeConfig.type', // FamilyPedigree node type
  ],
  variables: [
    'stages[].quickAdd',
    'stages[].form.fields[].variable',
    'stages[].panels.filter.rules[].options.attribute',
    'stages[].searchOptions.matchProperties[]',
    'stages[].cardOptions.additionalProperties[].variable',
    'stages[].prompts[].variable',
    'stages[].prompts[].edgeVariable',
    'stages[].prompts[].otherVariable',
    'stages[].prompts[].additionalAttributes[].variable',
    'stages[].prompts[].highlight.variable',
    'stages[].prompts[].layout.layoutVariable',
    'stages[].prompts[].presets[].layoutVariable',
    'stages[].prompts[].presets[].groupVariable',
    'stages[].prompts[].presets[].edges.display[]',
    'stages[].prompts[].presets[].highlight[]',
    'stages[].prompts[].bucketSortOrder[].property',
    'stages[].prompts[].binSortOrder[].property',
    'stages[].skipLogic.filter.rules[].options.attribute',
    'stages[].filter.rules[].options.attribute',
    'stages[].presets[].layoutVariable',
    'stages[].presets[].groupVariable',
    'stages[].presets[].edges.display[]',
    'stages[].presets[].highlight[]',
    // FamilyPedigree variable paths
    'stages[].nodeConfig.nodeLabelVariable',
    'stages[].nodeConfig.egoVariable',
    'stages[].nodeConfig.biologicalSexVariable',
    'stages[].nodeConfig.relationshipVariable',
    'stages[].nodeConfig.form[].variable',
    'stages[].edgeConfig.relationshipTypeVariable',
    'stages[].edgeConfig.isActiveVariable',
    'stages[].edgeConfig.isGestationalCarrierVariable',
    'stages[].nominationPrompts[].variable',
    // `sameAs` and `differentFrom` are variable references in these locations
    'codebook.ego.variables[].validation.sameAs',
    'codebook.ego.variables[].validation.differentFrom',
    'codebook.node[].variables[].validation.sameAs',
    'codebook.node[].variables[].validation.differentFrom',
    'codebook.edge[].variables[].validation.sameAs',
    'codebook.edge[].variables[].validation.differentFrom',
  ],
  assets: [
    'stages[].panels[].dataSource',
    'stages[].dataSource',
    'stages[].background.image',
    'stages[].mapOptions.tokenAssetId',
    'stages[].mapOptions.dataSourceAssetId',
    ['stages[].items[]', mapAssetItems],
  ],
};

/**
 * Returns index of used edges (entities)
 * @returns {object} in format: { [path]: variable }
 */
const getEdgeIndex = createSelector(getProtocol, (protocol) =>
  collectPaths(paths.edges, protocol),
);

/**
 * Returns index of used nodes (entities)
 * @returns {object} in format: { [path]: variable }
 */
const getNodeIndex = createSelector(getProtocol, (protocol) =>
  collectPaths(paths.nodes, protocol),
);

/**
 * Returns index of used variables
 * @returns {object} in format: { [path]: variable }
 */
const getVariableIndex = createSelector(getProtocol, (protocol) =>
  collectPaths(paths.variables, protocol),
);

/**
 * Returns index of used assets
 * @returns {object} in format: { [path]: variable }
 */
const getAssetIndex = createSelector(getProtocol, (protocol) =>
  collectPaths(paths.assets, protocol),
);

type ListItem = Record<string, unknown> | string[];

const combineLists = (lists: ListItem[]) =>
  lists
    .map((list) => (!isArray(list) ? values(list).map(String) : list))
    .reduce((acc: string[], list) => acc.concat(list), []);

const buildSearch = (include: ListItem[] = [], exclude: ListItem[] = []) => {
  const combinedInclude = combineLists(include);
  const combinedExclude = combineLists(exclude);
  const lookup = new Set(combinedInclude);

  combinedExclude.forEach((value) => {
    lookup.delete(value);
  });

  return lookup;
};

const utils = {
  buildSearch,
  collectPath,
  collectPaths,
};

export { getAssetIndex, getEdgeIndex, getNodeIndex, getVariableIndex, utils };
