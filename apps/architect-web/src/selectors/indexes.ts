import { createSelector } from '@reduxjs/toolkit';
import { isArray, values } from 'es-toolkit/compat';

import { collectEntityAttributeReferences } from '@codaco/protocol-validation';

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

const paths: {
  edges: CollectPathsEntry[];
  nodes: CollectPathsEntry[];
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
 * Returns index of used variables.
 * Keys use the dotted-array format produced by collectEntityAttributeReferences,
 * e.g. `stages.0.prompts.0.variable`. Values are the variable id strings.
 * @returns {object} in format: { [dotted-path]: variableId }
 */
const getVariableIndex = createSelector(getProtocol, (protocol) => {
  if (!protocol) return {};
  const index: Record<string, string> = {};
  for (const hit of collectEntityAttributeReferences(protocol)) {
    index[hit.path.join('.')] = hit.variableId;
  }
  return index;
});

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
