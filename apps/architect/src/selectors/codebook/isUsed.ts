import { createSelector } from '@reduxjs/toolkit';
import { get } from 'es-toolkit/compat';

import type { RootState } from '~/ducks/store';

import { getVariableIndex } from '../indexes';
import { getProtocol } from '../protocol';
import { getIdsFromCodebook } from './helpers';

// Types
type IsUsedMap = {
  [variableId: string]: boolean;
};

type VariableOption = {
  label: string;
  value: string;
  type?: string;
  color?: string;
  isUsed?: boolean;
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
);

/**
 * Adds an `isUsed` property to a list of variable options.
 */
export const optionsWithIsUsedSelector = createSelector(
  [getIsUsed, (_state: RootState, options: VariableOption[]) => options],
  (isUsed, options): VariableOption[] =>
    options.map(({ value, ...rest }) => ({
      ...rest,
      value,
      isUsed: get(isUsed, value, false),
    })),
);
