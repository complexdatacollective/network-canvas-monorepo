import { createSelector, createSlice } from '@reduxjs/toolkit';
import { v4 } from 'uuid';

import type { Stage } from '@codaco/protocol-validation';

import type { ProtocolPayload } from '../../contract/types';

type ProtocolState = ProtocolPayload;

const initialState = {} as ProtocolState;

/**
 * The stage the runtime appends to every interview's stage list. It is not
 * part of the protocol, so it carries no protocol-authored copy: the
 * FinishSession interface takes its text from the interview's own catalog.
 */
type FinishStage = Readonly<{ id: string; type: 'FinishSession' }>;

const DefaultFinishStage: FinishStage = {
  id: v4(),
  type: 'FinishSession',
};

const protocolSlice = createSlice({
  name: 'protocol',
  initialState,
  reducers: {},
  selectors: {
    getCodebook: (state) => state.codebook,
    getProtocolLocalization: (state) => state.localization,
    getStages: createSelector(
      [(state: ProtocolState) => state.stages],
      (stages): (Stage | FinishStage)[] => [
        ...(stages ?? []),
        DefaultFinishStage,
      ],
    ),
    getProtocolStages: createSelector(
      [(state: ProtocolState) => state.stages],
      (stages) => stages ?? [],
    ),
    getAssetManifest: createSelector(
      [(state: ProtocolState) => state.assets],
      (assets) =>
        assets ? Object.fromEntries(assets.map((a) => [a.assetId, a])) : {},
    ),
  },
});

// export selectors
export const {
  getCodebook,
  getProtocolLocalization,
  getStages,
  getProtocolStages,
  getAssetManifest,
} = protocolSlice.selectors;

export default protocolSlice.reducer;
