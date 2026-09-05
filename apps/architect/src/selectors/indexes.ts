import { createSelector } from '@reduxjs/toolkit';
import { isArray, values } from 'es-toolkit/compat';

import {
  collectAssetReferences,
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  collectVariableRoleHits,
  findExclusiveVariableSlots,
  findInterfaceOwnedOptionBindings,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
  type InterfaceOwnedOptionSetKey,
} from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/modules/root';

import { getProtocol } from './protocol';

// EVERY reference kind in this file is derived from the schema — node/edge
// types, variables, and assets — so a stage type that gains a reference is
// covered the moment its schema is tagged.
//
// Assets were the last hand-kept path list here. Sort keys and roster columns
// were kept the same way once, in `collectPaths`' bracketed format, while the
// Codebook's "Used In" display only understood the collector's dotted format —
// so every such reference counted towards "in use" and vanished from "Used In"
// (#1392). An asset field added to a stage type failed the same way, in the
// worse direction: unlisted meant UNUSED, and the Resource Library offers an
// unused resource for deletion. Do not reintroduce a path list of any kind.
//
// The `{ [dotted-path]: id }` indexes below survive only as membership sets —
// their values answer "is this referenced at all", nothing reads their keys.
// Joining a path into a string throws away where the segment boundaries were,
// so a display that has to name the reference site takes the `…UsageHits`
// selectors, which hand back the collector's own `(string | number)[]` paths.

// Groups hits by the id they name, into a Map rather than a plain object: a
// codebook record key is only constrained to `/^[a-zA-Z0-9._:-]+$/`, so
// `constructor` and `toString` are legal ids that an object index would answer
// for without ever having seen them.
const groupBy = <T>(items: readonly T[], keyOf: (item: T) => string) => {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = grouped.get(key);
    if (existing) existing.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
};

// Memoises the entity-type walk for every consumer below, so the joined
// indexes and the structured usage hits come from ONE traversal of the
// protocol rather than one each.
const getEntityTypeHits = createSelector(getProtocol, (protocol) =>
  protocol ? collectEntityTypeReferences(protocol) : [],
);

const collectTypeIndex = (
  hits: readonly EntityTypeReferenceHit[],
  entity: 'node' | 'edge',
): Record<string, string> => {
  const index: Record<string, string> = {};
  for (const hit of hits) {
    if (hit.entity === entity) index[hit.path.join('.')] = hit.typeId;
  }
  return index;
};

/**
 * Returns index of used edge types.
 * Keys use the dotted-array format produced by collectEntityTypeReferences,
 * e.g. `stages.0.edges.0.subject.type`. Values are the edge type id strings.
 *
 * Only the VALUES are read (`utils.buildSearch`, in `makeGetEntityWithUsage`
 * and `getEntityTypeIsUsed`): "is this type referenced at all". Anything that
 * needs to say WHERE reads `getEntityTypeUsageHitsById` instead, whose paths
 * are still arrays.
 *
 * @returns {object} in format: { [dotted-path]: typeId }
 */
const getEdgeIndex = createSelector(getEntityTypeHits, (hits) =>
  collectTypeIndex(hits, 'edge'),
);

/**
 * Returns index of used node types. See `getEdgeIndex` for the key format and
 * for why only its values are consumed.
 * @returns {object} in format: { [dotted-path]: typeId }
 */
const getNodeIndex = createSelector(getEntityTypeHits, (hits) =>
  collectTypeIndex(hits, 'node'),
);

/**
 * Every entity-type reference, grouped by the type id it names — the
 * structured counterpart of the joined indexes above, for consumers that need
 * to report WHERE a type is used.
 *
 * Node and edge hits share one map because codebook record keys are unique
 * across entity types (`CodebookSchema` rejects a reused key), and each hit
 * carries its own `entity` anyway.
 */
export const getEntityTypeUsageHitsById = createSelector(
  [getEntityTypeHits],
  (hits) => groupBy(hits, (hit) => hit.typeId),
);

// Memoises the entity-attribute walk for every consumer below, so re-deriving
// the index or the per-variable usage hits doesn't re-collect unless the
// protocol changes. (getVariableRoleMap below has its own grouping needs and
// calls collectVariableRoleHits directly rather than consuming this.)
const getEntityAttributeHits = createSelector(getProtocol, (protocol) =>
  protocol ? collectEntityAttributeReferences(protocol) : [],
);

/**
 * Returns index of used variables.
 *
 * Only the VALUES are consumed — by `getIsUsed`, which asks the boolean "is
 * this variable referenced anywhere?" to gate deletion. The keys exist so the
 * map has one entry per reference SITE rather than one per variable; nothing
 * reads them, and nothing should. Joining a path into a string is lossy (a
 * codebook record key may itself contain a dot, and `/^[a-zA-Z0-9._:-]+$/` is
 * the only constraint on one), so anything that needs to say WHERE a variable
 * is used reads `getVariableUsageHits` and keeps the path as an array.
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

const getEntityAttributeHitsByVariableId = createSelector(
  [getEntityAttributeHits],
  (hits) => groupBy(hits, (hit) => hit.variableId),
);

// Shared identity for "referenced nowhere", so a miss doesn't hand out a fresh
// array on every call.
const NO_HITS: readonly EntityAttributeReferenceHit[] = Object.freeze([]);

/**
 * Every entity-attribute reference naming one variable, as the collector
 * produced it: `path` still an array, `subject` intact.
 *
 * Grouped once per protocol rather than written as a `createSelector`
 * parameterised on the variable id. Either form would be memoised — Reselect's
 * default `weakMapMemoize` caches per argument pair, not single-slot — but a
 * parameterised selector scans the whole hit list once per variable, and the
 * Codebook's usage column asks for every variable of an entity type in turn.
 * One grouping pass answers all of them, and holds one cache entry per
 * protocol instead of one per (protocol, variable).
 */
export const getVariableUsageHits = (
  state: RootState,
  variableId: string,
): readonly EntityAttributeReferenceHit[] =>
  getEntityAttributeHitsByVariableId(state).get(variableId) ?? NO_HITS;

/**
 * Composite key scoping a variable to its writer subject (entity + type), so
 * identically-named variables on different node/edge types never collide.
 */
export const roleMapKey = (
  subject: { entity: string; type?: string },
  variableId: string,
): string => JSON.stringify([subject.entity, subject.type ?? null, variableId]);

/**
 * Writer-role counts per subject-scoped variable, keyed by `roleMapKey`.
 * Exported because every consumer reads it through `~/selectors/roleFilters`'s
 * predicates rather than indexing it by hand — see `hasValidatedUse`.
 */
export type VariableRoleMap = Record<
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

export type ExclusiveSlotClaim = {
  slot: string;
  owner: string;
  ownerInterface?: string;
};

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
        ownerInterface:
          slot.path[0] === 'stages' && typeof slot.path[1] === 'number'
            ? protocol.stages[slot.path[1]]?.type
            : undefined,
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
 * Returns index of used assets.
 *
 * Keys use the dotted-array format produced by `collectAssetReferences`, e.g.
 * `stages.0.panels.0.dataSource`; values are the asset id strings. Both
 * consumers (`getUnusedAssets` and the Resource Library's `withAssets`) read
 * only the VALUES, through `utils.buildSearch`.
 *
 * @returns {object} in format: { [dotted-path]: assetId }
 */
const getAssetIndex = createSelector(getProtocol, (protocol) => {
  if (!protocol) return {};
  const index: Record<string, string> = {};
  for (const hit of collectAssetReferences(protocol)) {
    index[hit.path.join('.')] = hit.assetId;
  }
  return index;
});

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
};

export { getAssetIndex, getEdgeIndex, getNodeIndex, getVariableIndex, utils };
