import { createSelector } from '@reduxjs/toolkit';
import { isArray, values } from 'es-toolkit/compat';

import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  collectVariableRoleHits,
  findExclusiveVariableSlots,
  findInterfaceOwnedOptionBindings,
  type InterfaceOwnedOptionSetKey,
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

// Node/edge TYPE usage and variable usage are both derived from the schema
// (collectEntityTypeReferences / collectEntityAttributeReferences), so new
// stage types are covered automatically. Assets are the only remaining
// hand-kept path list, and the only consumer of `collectPaths`' BRACKETED key
// format (`stages[0].dataSource`) — `getAssetIndex`'s keys are never parsed as
// paths, only its values are read.
//
// Sort keys and roster columns used to be hand-kept here too, in that bracket
// format, while `getUsageAsStageMeta` only understood the collector's dotted
// format — so every such reference counted towards "in use" and vanished from
// "Used In" (#1392). They are schema-tagged references now; do not reintroduce
// a second variable-path list.
const paths: {
  assets: CollectPathsEntry[];
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

// Memoises getVariableIndex's entity-attribute walk so re-deriving the index
// doesn't re-collect hits unless the protocol changes. (getVariableRoleMap
// below has its own grouping needs and calls collectVariableRoleHits directly
// rather than consuming this.)
const getEntityAttributeHits = createSelector(getProtocol, (protocol) =>
  protocol ? collectEntityAttributeReferences(protocol) : [],
);

/**
 * Returns index of used variables.
 *
 * EVERY key uses the dotted-array format produced by
 * collectEntityAttributeReferences, e.g. `stages.0.prompts.0.variable`. That is
 * a load-bearing invariant, not an incidental detail: `getIsUsed` reads this
 * index's VALUES to gate deletion while `getUsageAsStageMeta` parses its KEYS
 * to say where the variable is used, so a key in any other shape shows up as
 * "in use" with nothing to show for it. Values are the variable id strings.
 *
 * @returns {object} in format: { [dotted-path]: variableId }
 */
const getVariableIndex = createSelector(
  [getEntityAttributeHits, getProtocol],
  (hits, protocol) => {
    if (!protocol) return {};
    const index: Record<string, string> = {};
    for (const hit of hits) {
      index[hit.path.join('.')] = hit.variableId;
    }
    return index;
  },
);

/**
 * Composite key scoping a variable to its writer subject (entity + type), so
 * identically-named variables on different node/edge types never collide.
 */
export const roleMapKey = (
  subject: { entity: string; type?: string },
  variableId: string,
): string => JSON.stringify([subject.entity, subject.type ?? null, variableId]);

type VariableRoleMap = Record<
  string,
  { validated: number; unvalidated: number }
>;

const buildVariableRoleMap = (
  protocol: unknown,
  excludedStageIndex?: number,
): VariableRoleMap => {
  if (!protocol) return {};
  const map: VariableRoleMap = {};
  for (const group of collectVariableRoleHits(protocol)) {
    const countOutsideStage = (hits: typeof group.validated): number =>
      excludedStageIndex === undefined
        ? hits.length
        : hits.filter((hit) => hit.stageIndex !== excludedStageIndex).length;
    map[roleMapKey(group.subject, group.variableId)] = {
      validated: countOutsideStage(group.validated),
      unvalidated: countOutsideStage(group.unvalidated),
    };
  }
  return map;
};

/**
 * Counts of validated- vs unvalidated-usage hits per subject-scoped variable,
 * keyed by `roleMapKey`. Backs the writer-picker exclusions and save-time
 * gates that keep a variable from being written both by a form (validated)
 * and by a bin/highlight/census/etc. (unvalidated).
 */
export const getVariableRoleMap = createSelector(
  getProtocol,
  (protocol): VariableRoleMap => buildVariableRoleMap(protocol),
);

/**
 * Counts saved writer roles outside the stage currently being edited. The
 * editor overlays that stage's live Redux Form draft separately.
 */
export const getVariableRoleMapOutsideStage = createSelector(
  [
    getProtocol,
    (_state: unknown, excludedStageIndex: number | undefined) =>
      excludedStageIndex,
  ],
  (protocol, excludedStageIndex): VariableRoleMap =>
    buildVariableRoleMap(protocol, excludedStageIndex),
);

export type ExclusiveSlotClaim = { slot: string; owner: string };

/**
 * The interface-owned structural slot claiming each subject-scoped variable,
 * keyed by `roleMapKey`. Derived from the schema's own `exclusive` tags (via
 * `findExclusiveVariableSlots`), so a picker exclusion cannot drift from the
 * protocol rule it exists to keep the researcher away from.
 *
 * SLOT-aware: the value records WHICH slot claims the variable, because the
 * same slot on another stage may legitimately name it — two Family Pedigree
 * stages over one node type share their structural variables.
 */
export const getExclusiveVariableSlotMap = createSelector(
  [getEntityAttributeHits, getProtocol],
  (hits, protocol): Record<string, ExclusiveSlotClaim> => {
    if (!protocol) return {};
    const map: Record<string, ExclusiveSlotClaim> = {};
    for (const slot of findExclusiveVariableSlots(protocol, hits)) {
      map[roleMapKey(slot.subject, slot.variableId)] = {
        slot: slot.descriptor.slot,
        owner: slot.descriptor.owner,
      };
    }
    return map;
  },
);

/**
 * The interface-owned option set bound to each subject-scoped variable, keyed
 * by `roleMapKey`. Backs the read-only option tables in the field and bin
 * editors: an interface that both writes and reads these values fixes the
 * option list, whoever else binds the variable.
 */
export const getInterfaceOwnedOptionMap = createSelector(
  [getEntityAttributeHits, getProtocol],
  (hits, protocol): Record<string, InterfaceOwnedOptionSetKey> => {
    if (!protocol) return {};
    const map: Record<string, InterfaceOwnedOptionSetKey> = {};
    for (const binding of findInterfaceOwnedOptionBindings(protocol, hits)) {
      map[roleMapKey(binding.subject, binding.variableId)] = binding.optionSet;
    }
    return map;
  },
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
