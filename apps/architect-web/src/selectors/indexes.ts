import { createSelector } from '@reduxjs/toolkit';
import { isArray, values } from 'es-toolkit/compat';

import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
} from '@codaco/protocol-validation';

import collectPath, {
  type CollectPathsEntry,
  collectPaths,
} from '../utils/collectPaths';
import { getProtocol } from './protocol';

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

const mapSortProperty = (
  value: unknown,
  path: string,
): [unknown, string] | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { property } = value as { property?: unknown };
  if (typeof property !== 'string') {
    return undefined;
  }
  return [property, `${path}.property`];
};

// Node/edge TYPE usage and variable usage are both derived from the schema
// (collectEntityTypeReferences / collectEntityAttributeReferences), so new
// stage types are covered automatically. Assets and sort keys still need
// hand-kept paths — the schema tags neither (sort `property` is a plain string
// that may be a codebook variable, a roster column, or a magic key).
const paths: {
  assets: CollectPathsEntry[];
  sortVariables: CollectPathsEntry[];
} = {
  assets: [
    'stages[].panels[].dataSource',
    'stages[].dataSource',
    'stages[].background.image',
    'stages[].mapOptions.tokenAssetId',
    'stages[].mapOptions.dataSourceAssetId',
    ['stages[].items[]', mapAssetItems],
    ['stages[].introScreen.items[]', mapAssetItems],
  ],
  // Prompt-level sort keys reference the stage's codebook variables. Roster
  // sortOptions keys are data-source columns, not codebook variables, so they
  // are deliberately excluded.
  sortVariables: [
    ['stages[].prompts[].sortOrder[]', mapSortProperty],
    ['stages[].prompts[].bucketSortOrder[]', mapSortProperty],
    ['stages[].prompts[].binSortOrder[]', mapSortProperty],
  ],
};

const collectTypeIndex = (
  protocol: unknown,
  entity: 'node' | 'edge',
): Record<string, string> => {
  if (!protocol) return {};
  const index: Record<string, string> = {};
  for (const hit of collectEntityTypeReferences(protocol)) {
    if (hit.entity === entity) index[hit.path.join('.')] = hit.typeId;
  }
  return index;
};

/**
 * Returns index of used edge types.
 * Keys use the dotted-array format produced by collectEntityTypeReferences,
 * e.g. `stages.0.edges.0.subject.type`. Values are the edge type id strings.
 * @returns {object} in format: { [dotted-path]: typeId }
 */
const getEdgeIndex = createSelector(getProtocol, (protocol) =>
  collectTypeIndex(protocol, 'edge'),
);

/**
 * Returns index of used node types.
 * @returns {object} in format: { [dotted-path]: typeId }
 */
const getNodeIndex = createSelector(getProtocol, (protocol) =>
  collectTypeIndex(protocol, 'node'),
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
  // Sort keys are untagged plain strings in the schema, so a variable used only
  // as a sort key would otherwise read "not in use" and be safely deletable.
  Object.assign(index, collectPaths(paths.sortVariables, protocol));
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
