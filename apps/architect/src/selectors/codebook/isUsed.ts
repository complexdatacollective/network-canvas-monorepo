import { createSelector } from '@reduxjs/toolkit';

import { readStageDraft } from '~/components/StageEditor/stageDraftBeacon';
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

/**
 * The stage the editor is holding, if one is open.
 *
 * Not Redux state: the editor is the protocol-builder package's and its
 * document lives in that form's own store, published to a beacon as it changes
 * (`stageDraftBeacon`). Read as an input selector so that every evaluation of
 * this selector — including the ones a codebook refusal makes from a thunk —
 * sees the draft as it stands, and so that a new reading invalidates the memo
 * the way a Redux input would.
 */
const getLiveStageValues = (_state: RootState) => readStageDraft().stage;

/**
 * Gets a key value object describing which variables are in use, including by
 * the stage currently being edited but not yet saved.
 *
 * Uses getVariableIndex to ensure consistency between "is used" checks and the
 * "where used" display: this reads the index's values, the display reads
 * `getVariableUsageHits`, and both are derived from the one memoised
 * `collectEntityAttributeReferences` walk, so they cannot disagree about which
 * variables are referenced.
 *
 * The unsaved stage is matched by JSON string search, because the shape of a
 * stage's in-progress values is dynamic and cannot be walked at known paths.
 *
 * The combiner reruns whenever the editor publishes a new draft (that is the
 * feature: a variable referenced only by an unsaved stage must still read as
 * used), but `resultEqualityCheck` hands back the PREVIOUS map reference
 * whenever the recomputed content is unchanged — the common case while typing
 * — so downstream selectors and `useSelector` equality guards keyed on this
 * map's identity stay quiet.
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
  {
    memoizeOptions: { resultEqualityCheck: isUsedMapEquals },
    // No memo on the ARGUMENT. One of this selector's inputs is not in the
    // state it is handed — the stage the editor is holding is published to a
    // beacon, and the editor changes it without dispatching anything — so a
    // cache keyed on the state object would answer a question about the
    // protocol as it stood when that object was made. The inputs are memoised
    // selectors and the result is compared by content, so what this costs is
    // running three cheap reads.
    argsMemoize: (selector) => selector,
  },
);
