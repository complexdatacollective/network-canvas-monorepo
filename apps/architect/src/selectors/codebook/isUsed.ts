import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '~/ducks/store';

import { getVariableIndex } from '../indexes';
import { getProtocol } from '../protocol';
import { getIdsFromCodebook } from './helpers';

// Types
export type IsUsedMap = {
  [variableId: string]: boolean;
};

/**
 * Shallow map equality for `getIsUsed`'s `resultEqualityCheck`: same variable
 * ids mapping to the same booleans. Values are always booleans, so a key
 * missing from `b` reads as `undefined` and fails the comparison.
 */
const isUsedMapEquals = (a: IsUsedMap, b: IsUsedMap): boolean => {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => a[key] === b[key]);
};

// The stage form's live values, mirrored into Redux by `StageFormBridge` —
// the only Redux-visible view of in-progress editor state.
const getLiveStageValues = (state: RootState) =>
  state.stageEditorDraft.ui.liveValues;

/**
 * Gets a key value object describing which variables are in use, including by
 * the stage currently being edited but not yet saved.
 *
 * Uses getVariableIndex (derived from collectEntityAttributeReferences) to ensure
 * consistency between "is used" checks and "where used" display. Both systems share the
 * same source of truth: the extractor-derived variable index.
 *
 * The unsaved stage is matched by JSON string search, because the shape of a
 * stage's in-progress values is dynamic and cannot be walked at known paths.
 *
 * The combiner reruns on every `liveValues` mirror tick (that reactivity is
 * the feature: a variable referenced only by unsaved in-progress values must
 * still read as used), but `resultEqualityCheck` hands back the PREVIOUS map
 * reference whenever the recomputed content is unchanged — the common case
 * while typing — so downstream selectors and `useSelector` equality guards
 * keyed on this map's identity stay quiet.
 *
 * @returns a key value object describing which variables are in use
 */
export const getIsUsed = createSelector(
  [getProtocol, getLiveStageValues, getVariableIndex],
  (protocol, liveValues, variableIndex): IsUsedMap => {
    if (!protocol?.codebook) {
      return {};
    }

    const variableIds = getIdsFromCodebook(protocol.codebook);

    // Variables referenced at known paths (same source as usage display)
    const referencedVariables = new Set(Object.values(variableIndex));

    const liveStageData = liveValues ? JSON.stringify(liveValues) : '';

    return variableIds.reduce<IsUsedMap>((memo, variableId) => {
      const inProtocol = referencedVariables.has(variableId);
      const inLiveStage = liveStageData.includes(`"${variableId}"`);

      memo[variableId] = inProtocol || inLiveStage;
      return memo;
    }, {});
  },
  { memoizeOptions: { resultEqualityCheck: isUsedMapEquals } },
);
